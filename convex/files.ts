import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, type Infer, v } from "convex/values";
import { ATTACHMENT_DELETE_BATCH_SIZE, getUploadPolicyError } from "../src/lib/config/upload";
import { ERROR_CODES } from "../src/lib/error-codes";
import { sanitizeAndValidateFileName } from "../src/lib/filename";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { assertServerSecret } from "./lib/auth_helper";
import { supportsFileUploadModel } from "./lib/fileUploadModels";
import { rateLimiter } from "./rateLimiter";
import schema from "./schema";

/*
 * Upload lifecycle:
 * 1. generateUploadUrl: checks the declared type/size, rate-limits, and records a pending row
 *    (no chatId) owned by the caller, then returns a presigned R2 PUT URL.
 * 2. The client (or a server route) PUTs the bytes to R2.
 * 3. saveFileAttachment / saveGeneratedImage: syncs the object's real metadata from R2, re-checks
 *    it against the upload policy, and attaches the row to a chat. Violating objects are deleted.
 * 4. recheckAttachment: if the upload URL was still live at step 3, re-checks the object once
 *    after the URL expires, since the client could have replaced it.
 * Pending rows that never reach step 3 are removed with their objects by cleanupPendingUploads.
 */

const r2 = new R2(components.r2);

const TRAILING_SLASH_RE = /\/$/;

// Presigned PUT URLs from r2.generateUploadUrl use the AWS presigner default of 900 seconds, and
// they don't sign the content type or length: until expiry the client can overwrite the object.
const UPLOAD_URL_LIFETIME_MS = 15 * 60 * 1000;
// Attachments saved while their URL is still valid are re-checked this long after it expires.
const RECHECK_MARGIN_MS = 60 * 1000;
// Pending uploads older than this are deleted by the cron in crons.ts; their URLs have expired.
const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;
const PENDING_CLEANUP_BATCH_SIZE = 50;

const attachmentDoc = schema.doc("chat_attachments");

// A finalized attachment always has its chat and file metadata.
const savedAttachment = attachmentDoc.extend({
  chatId: v.id("chats"),
  fileName: v.string(),
  fileType: v.string(),
  fileSize: v.number(),
});

const finalizeArgs = v.object({
  chatId: v.id("chats"),
  key: v.string(),
  fileName: v.optional(v.string()),
  isGenerated: v.boolean(),
});
type FinalizeArgs = Infer<typeof finalizeArgs>;

// Rejections are returned rather than thrown so that deleting the offending object commits.
const saveResult = v.union(
  v.object({ status: v.literal("saved"), attachment: savedAttachment }),
  v.object({
    status: v.literal("rejected"),
    error: v.union(
      v.literal(ERROR_CODES.UNSUPPORTED_FILE_TYPE),
      v.literal(ERROR_CODES.FILE_TOO_LARGE),
      v.literal(ERROR_CODES.INVALID_INPUT),
    ),
  }),
);
type SaveResult = Infer<typeof saveResult>;

/** Permanent public URL for an R2 key, or undefined when R2_PUBLIC_URL_BASE is unset. */
function getPublicUrl(key: string): string | undefined {
  const base = process.env.R2_PUBLIC_URL_BASE;
  return base ? `${base.replace(TRAILING_SLASH_RE, "")}/${key}` : undefined;
}

/**
 * Upload policy for a stored object's synced R2 metadata; generated images must be images.
 * Missing metadata fields fail the check.
 */
function getStoredObjectPolicyError(
  meta: { contentType?: string; size?: number },
  isGenerated: boolean,
) {
  const file = { type: meta.contentType ?? "", size: meta.size ?? -1 };
  return (
    getUploadPolicyError(file) ??
    (isGenerated && !file.type.startsWith("image/") ? ERROR_CODES.UNSUPPORTED_FILE_TYPE : null)
  );
}

/** Fallback name for generated images saved without one, e.g. "gen-1700000000000.png". */
function defaultGeneratedFileName(contentType: string): string {
  const subtype = contentType.split("/")[1]?.split("+")[0];
  return `gen-${Date.now()}.${subtype || "bin"}`;
}

/**
 * Returns the caller's user id. Guest (anonymous) accounts cannot store files, so they get
 * NOT_AUTHENTICATED, which tells the client to sign in.
 */
async function requireRegisteredUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
  }
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
  }
  if (user.isAnonymous) {
    throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
  }
  return userId;
}

/**
 * Loads the caller's upload row for `key` and checks it may be attached to `chatId`.
 * Never inserts: rows only come from generateUploadUrl.
 */
async function requireAttachableUpload(
  ctx: QueryCtx | MutationCtx,
  args: FinalizeArgs,
): Promise<Doc<"chat_attachments">> {
  const userId = await requireRegisteredUser(ctx);
  const row = await ctx.db
    .query("chat_attachments")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .first();
  if (!row || row.userId !== userId) {
    throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
  }

  const chat = await ctx.db.get("chats", args.chatId);
  if (!chat || chat.userId !== userId) {
    throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
  }
  // Generated images come from our image models; user uploads need a file-capable chat model.
  if (!(args.isGenerated || (chat.model && supportsFileUploadModel(chat.model)))) {
    throw new ConvexError(ERROR_CODES.UNSUPPORTED_MODEL);
  }
  return row;
}

/**
 * Issues a presigned R2 PUT URL for one file and records a pending upload owned by the caller.
 * The declared type/size are checked here; the real object is re-checked when it is attached.
 * Server routes pass SERVER_ROUTE_SECRET for generated images, which are already paid for with a
 * message credit, so they skip the per-user upload rate limit.
 */
export const generateUploadUrl = mutation({
  args: { contentType: v.string(), size: v.number(), serverSecret: v.optional(v.string()) },
  returns: v.object({ key: v.string(), url: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireRegisteredUser(ctx);
    const policyError = getUploadPolicyError({ type: args.contentType, size: args.size });
    if (policyError) {
      throw new ConvexError(policyError);
    }
    if (args.serverSecret === undefined) {
      await rateLimiter.limit(ctx, "fileUpload", { key: userId, throws: true });
    } else {
      assertServerSecret(args.serverSecret);
    }

    const upload = await r2.generateUploadUrl();
    await ctx.db.insert("chat_attachments", { userId, key: upload.key });
    return upload;
  },
});

/** Throws unless the caller can attach this upload to the chat (see requireAttachableUpload). */
export const checkAttachable = internalQuery({
  args: finalizeArgs.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAttachableUpload(ctx, args);
    return null;
  },
});

/**
 * Attaches an uploaded object to a chat using its synced R2 metadata. Objects that break the
 * upload policy are deleted along with their row and reported as rejected.
 */
export const internalSave = internalMutation({
  args: finalizeArgs.fields,
  returns: saveResult,
  handler: async (ctx, args): Promise<SaveResult> => {
    const row = await requireAttachableUpload(ctx, args);
    const meta = await r2.getMetadata(ctx, args.key);
    if (!meta) {
      // finalizeUpload syncs metadata first, so this means the sync did not land.
      throw new ConvexError(ERROR_CODES.UPLOAD_FAILED);
    }

    const policyError = getStoredObjectPolicyError(meta, args.isGenerated);
    if (policyError) {
      await r2.deleteObject(ctx, args.key);
      await ctx.db.delete("chat_attachments", row._id);
      return { status: "rejected", error: policyError };
    }

    const fileType = meta.contentType ?? "";
    const saved = {
      chatId: args.chatId,
      fileName: sanitizeAndValidateFileName(args.fileName ?? defaultGeneratedFileName(fileType)),
      fileType,
      fileSize: meta.size ?? 0,
      url: getPublicUrl(args.key),
      isGenerated: args.isGenerated || undefined,
    };
    await ctx.db.patch("chat_attachments", row._id, saved);

    // The upload URL (issued with the row) may still be live, so the object could be replaced
    // after this check. Check it once more after the URL expires.
    const recheckAt = row._creationTime + UPLOAD_URL_LIFETIME_MS + RECHECK_MARGIN_MS;
    if (recheckAt > Date.now()) {
      await ctx.scheduler.runAt(recheckAt, internal.files.recheckAttachment, {
        attachmentId: row._id,
        key: args.key,
      });
    }
    return { status: "saved", attachment: { ...row, ...saved } };
  },
});

/**
 * Shared body of saveFileAttachment and saveGeneratedImage: authorizes, syncs the object's real
 * metadata from R2, then validates and attaches it. Throws the policy error for rejected files.
 */
async function finalizeUpload(
  ctx: ActionCtx,
  args: FinalizeArgs,
): Promise<Infer<typeof savedAttachment>> {
  // Authorize before touching R2 so callers can't trigger syncs for keys they don't own.
  await ctx.runQuery(internal.files.checkAttachable, args);
  try {
    await r2.syncMetadata(ctx, args.key);
  } catch (error) {
    console.error("R2 metadata sync failed", { key: args.key, error });
    throw new ConvexError(ERROR_CODES.UPLOAD_FAILED);
  }
  const result: SaveResult = await ctx.runMutation(internal.files.internalSave, args);
  if (result.status === "rejected") {
    throw new ConvexError(result.error);
  }
  return result.attachment;
}

/** Attaches a file the user uploaded via generateUploadUrl to one of their chats. */
export const saveFileAttachment = action({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    fileName: v.string(),
  },
  returns: savedAttachment,
  handler: (ctx, args) => finalizeUpload(ctx, { ...args, isGenerated: false }),
});

/**
 * Attaches an AI-generated image (uploaded by the chat route via generateUploadUrl) to a chat.
 * The stored URL is always derived from the key; only image types within the upload policy pass.
 */
export const saveGeneratedImage = action({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    fileName: v.optional(v.string()),
  },
  returns: savedAttachment,
  handler: (ctx, args) => finalizeUpload(ctx, { ...args, isGenerated: true }),
});

/**
 * Lists the caller's attachments, newest first, for the settings page. Pending uploads that were
 * never attached to a chat are left out (cleanupPendingUploads removes them).
 */
export const getAttachmentsForUser = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(attachmentDoc),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // Signed-out clients (e.g. mid sign-out) get an empty list instead of a thrown error.
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("chat_attachments")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.filter((attachment) => attachment.chatId !== undefined),
    };
  },
});

/**
 * Deletes up to ATTACHMENT_DELETE_BATCH_SIZE of the caller's attachments and their R2 objects.
 * Ids that are missing or owned by someone else are skipped.
 */
export const deleteAttachments = mutation({
  args: { attachmentIds: v.array(v.id("chat_attachments")) },
  returns: v.null(),
  handler: async (ctx, { attachmentIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    if (attachmentIds.length > ATTACHMENT_DELETE_BATCH_SIZE) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    for (const attachmentId of new Set(attachmentIds)) {
      const attachment = await ctx.db.get("chat_attachments", attachmentId);
      if (!attachment || attachment.userId !== userId) {
        continue;
      }
      await r2.deleteObject(ctx, attachment.key);
      await ctx.db.delete("chat_attachments", attachment._id);
    }
    return null;
  },
});

/**
 * Deletes pending uploads (issued an upload URL but never attached to a chat) older than
 * PENDING_UPLOAD_TTL_MS, with their R2 objects. Runs from crons.ts and continues itself while
 * full batches remain.
 */
export const cleanupPendingUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - PENDING_UPLOAD_TTL_MS;
    const expired = await ctx.db
      .query("chat_attachments")
      .withIndex("by_chatId", (q) => q.eq("chatId", undefined).lt("_creationTime", cutoff))
      .take(PENDING_CLEANUP_BATCH_SIZE);

    for (const row of expired) {
      await r2.deleteObject(ctx, row.key);
      await ctx.db.delete("chat_attachments", row._id);
    }
    if (expired.length === PENDING_CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.files.cleanupPendingUploads, {});
    }
    return null;
  },
});

/**
 * Re-syncs an attachment's R2 metadata after its upload URL expired (scheduled by internalSave),
 * catching objects replaced with a policy-breaking file after they were attached.
 */
export const recheckAttachment = internalAction({
  args: { attachmentId: v.id("chat_attachments"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await r2.syncMetadata(ctx, args.key);
    } catch (error) {
      // Leave the attachment as saved; the object may already be deleted with its chat.
      console.error("R2 metadata re-check failed", { key: args.key, error });
      return null;
    }
    await ctx.runMutation(internal.files.enforceAttachmentPolicy, args);
    return null;
  },
});

/** Deletes an attachment and its object when its re-synced R2 metadata breaks the upload policy. */
export const enforceAttachmentPolicy = internalMutation({
  args: { attachmentId: v.id("chat_attachments"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("chat_attachments", args.attachmentId);
    const meta = row?.key === args.key ? await r2.getMetadata(ctx, args.key) : null;
    if (!(row && meta)) {
      return null;
    }
    if (getStoredObjectPolicyError(meta, row.isGenerated === true)) {
      console.warn("Deleting attachment replaced after upload", { key: args.key });
      await r2.deleteObject(ctx, args.key);
      await ctx.db.delete("chat_attachments", row._id);
    }
    return null;
  },
});
