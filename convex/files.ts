import { getAuthUserId } from "@convex-dev/auth/server";
import { R2, type R2Callbacks } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";
import { UPLOAD_ALLOWED_MIME, UPLOAD_MAX_BYTES } from "@/lib/config/upload";
import { sanitizeAndValidateFileName } from "@/lib/filename";
import { ERROR_CODES } from "../lib/error-codes";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";

// R2 client and client API exports (used by React upload hook and server routes)
const r2 = new R2(components.r2);
const callbacks: R2Callbacks = internal.files;

const TRAILING_SLASH_RE = /\/$/;

export const { generateUploadUrl, syncMetadata, onSyncMetadata } = r2.clientApi(
  {
    // Provide callbacks reference so the component can invoke onSyncMetadata
    callbacks,
    checkUpload: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
      }
    },
    // Create a pending attachment row on upload start
    onUpload: async (ctx, _bucket, key) => {
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
      }

      // If a row for this key already exists for this user, skip insert
      const existing = await ctx.db
        .query("chat_attachments")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (existing) {
        return;
      }
      await ctx.db.insert("chat_attachments", {
        userId,
        key,
      });
    },
    // Sync metadata from R2 to our pending row
    onSyncMetadata: async (ctx, args) => {
      // args received from syncMetadata
      const meta = await r2.getMetadata(ctx, args.key);
      // metadata synced from R2
      const contentType = meta?.contentType ?? "application/octet-stream";
      const contentLength = meta?.size ?? 0;

      const row = await ctx.db
        .query("chat_attachments")
        .withIndex("by_key", (q) => q.eq("key", args.key))
        .first();
      if (!row) {
        return;
      }

      const rowId = row._id as Id<"chat_attachments">;
      await ctx.db.patch(rowId, {
        fileType: contentType,
        fileSize: contentLength,
      });
    },
  }
);

// Allowed MIME types and file size limit (centralized config)

// Only these models currently support file inputs. Update as new ones roll out.
const FILE_UPLOAD_MODELS = [
  // Anthropic models
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-reasoning",
  "claude-4-opus",
  "claude-4-sonnet",
  "claude-4-sonnet-reasoning",

  // OpenAI models
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
  "o3",
  "o3-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.5",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",

  "glm-4.5v",

  // Google models
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-thinking",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-thinking",
  "gemini-2.5-pro",

  // Meta models
  "meta-llama/llama-4-maverick:free",
  "meta-llama/llama-4-scout:free",

  // Mistral models
  "pixtral-large-latest",

  // Grok models
  "grok-3",
  "grok-3-mini",
] as const;

type AllowedMimeType = (typeof UPLOAD_ALLOWED_MIME)[number];
type FileUploadModel = (typeof FILE_UPLOAD_MODELS)[number];

type SavedAttachment = {
  _id: Id<"chat_attachments">;
  _creationTime: number;
  userId: Id<"users">;
  chatId: Id<"chats">;
  key: string; // R2 object key
  fileName: string; // display name
  fileType: string;
  fileSize: number;
  url?: string;
};

/**
 * Saves the metadata of a successfully uploaded file to the database.
 * Returns storage ID instead of temporary URL for permanent reference.
 */
export const saveFileAttachment = action({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<SavedAttachment> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    // Ensure we have fresh metadata from R2
    // await ctx.runMutation(api.files.syncMetadata, { key: args.key });

    // Load server-side row to verify ownership (available immediately)
    const row = await ctx.runQuery(api.files.findAttachmentByKey, {
      key: args.key,
    });
    if (!row || row.userId !== userId) {
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }
    // Poll R2 metadata briefly until synced by onSyncMetadata
    const maxAttempts = 10;
    let attempts = 0;
    let meta = await r2.getMetadata(ctx, args.key);
    while (
      attempts < maxAttempts &&
      (!meta || meta.size == null || !meta.contentType)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      meta = await r2.getMetadata(ctx, args.key);
      attempts += 1;
    }
    // Require metadata from R2 (do not use row for type/size)
    if (!meta || meta.size == null || !meta.contentType) {
      // Metadata still not available; ask client to retry shortly
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }
    const derivedType = meta.contentType ?? "application/octet-stream";
    const derivedSize = meta.size ?? 0;
    const safeName = sanitizeAndValidateFileName(args.fileName);
    // derived metadata assembled above

    const publicBase = process.env.R2_PUBLIC_URL_BASE;
    const publicUrl = publicBase
      ? `${publicBase.replace(TRAILING_SLASH_RE, "")}/${args.key}`
      : undefined;

    const attachmentId = await ctx.runMutation(internal.files.internalSave, {
      chatId: args.chatId,
      key: args.key,
      fileName: safeName,
      fileType: derivedType,
      fileSize: derivedSize,
      url: publicUrl,
    });
    const attachment = await ctx.runQuery(api.files.getAttachment, {
      attachmentId,
    });
    if (!attachment) {
      throw new ConvexError(ERROR_CODES.FILE_NOT_FOUND);
    }
    return { ...attachment } as SavedAttachment;
  },
});

/**
 * Saves a generated image to the attachments table with isGenerated flag
 */
export const saveGeneratedImage = action({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    url: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SavedAttachment> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Sync metadata and read it
    await ctx.runMutation(api.files.syncMetadata, { key: args.key });
    const meta = await r2.getMetadata(ctx, args.key);
    const mime = meta?.contentType ?? "application/octet-stream";
    const size = meta?.size ?? 0;

    // Compute default filename if not provided
    const epochMs = Date.now();
    const subtype = mime.split("/")[1] ?? "";
    const defaultExt = (subtype.split("+")[0] || "bin").toLowerCase();
    const fileName = args.fileName ?? `gen-${epochMs}.${defaultExt}`;

    const publicUrl =
      args.url ??
      (process.env.R2_PUBLIC_URL_BASE
        ? `${process.env.R2_PUBLIC_URL_BASE.replace(TRAILING_SLASH_RE, "")}/${args.key}`
        : undefined);

    const attachmentId = await ctx.runMutation(
      internal.files.internalSaveGenerated,
      {
        chatId: args.chatId,
        key: args.key,
        fileName,
        fileType: mime,
        fileSize: size,
        url: publicUrl,
      }
    );
    const attachment = await ctx.runQuery(api.files.getAttachment, {
      attachmentId,
    });
    if (!attachment) {
      throw new ConvexError(ERROR_CODES.FILE_NOT_FOUND);
    }
    return { ...attachment } as SavedAttachment;
  },
});

export const internalSave = internalMutation({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Verify that the key belongs to the current user via the pending row.
    const existing = await ctx.db
      .query("chat_attachments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!existing || existing.userId !== userId) {
      // Do NOT delete here; key belongs to another user or not tracked
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }

    // Verify ownership of the chat before attaching the file
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      await r2.deleteObject(ctx, args.key);
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }

    // Check that the chat's model can accept file uploads
    const modelName = chat.model ?? undefined;
    if (
      !(modelName && FILE_UPLOAD_MODELS.includes(modelName as FileUploadModel))
    ) {
      await r2.deleteObject(ctx, args.key);
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_MODEL);
    }

    // Enforce MIME type allow-list
    if (!UPLOAD_ALLOWED_MIME.includes(args.fileType as AllowedMimeType)) {
      // At this point we know the key belongs to this user; safe to delete
      await r2.deleteObject(ctx, args.key);
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_FILE_TYPE);
    }

    // Enforce maximum size
    if (args.fileSize > UPLOAD_MAX_BYTES) {
      await r2.deleteObject(ctx, args.key);
      throw new ConvexError(ERROR_CODES.FILE_TOO_LARGE);
    }

    // Validate R2 object key is non-empty
    if (!args.key || args.key.trim().length === 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const safeName = sanitizeAndValidateFileName(args.fileName);

    // Patch the existing pending row instead of creating a duplicate
    await ctx.db.patch(existing._id, {
      chatId: args.chatId,
      fileName: safeName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      url: args.url,
    });
    return existing._id;
  },
});

export const internalSaveGenerated = internalMutation({
  args: {
    chatId: v.id("chats"),
    key: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Verify ownership of the key to this user
    const existing = await ctx.db
      .query("chat_attachments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!existing || existing.userId !== userId) {
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }

    // Verify ownership of the chat before attaching the file
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      await r2.deleteObject(ctx, args.key);
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }

    // Generated images don't need model validation since they're created by our system
    // Also don't need MIME type validation since we control the generation

    // Validate R2 object key is non-empty
    if (!args.key || args.key.trim().length === 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const safeName = sanitizeAndValidateFileName(args.fileName);

    await ctx.db.patch(existing._id, {
      chatId: args.chatId,
      fileName: safeName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      isGenerated: true,
      url: args.url,
    });
    return existing._id;
  },
});

export const getAttachment = query({
  args: { attachmentId: v.id("chat_attachments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment || attachment.userId !== userId) {
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }
    return attachment;
  },
});

// Helper query to find a pending/partial attachment by key
export const findAttachmentByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const row = await ctx.db
      .query("chat_attachments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row || row.userId !== userId) {
      return null;
    }
    return row;
  },
});

/**
 * Generates a fresh URL for a storage ID
 */
export const getStorageUrl = query({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    try {
      const base = process.env.R2_PUBLIC_URL_BASE;
      if (!base) {
        return null;
      }
      return `${base.replace(TRAILING_SLASH_RE, "")}/${args.key}`;
    } catch {
      // Silently handle URL generation errors
      return null;
    }
  },
});

/**
 * Fetches all attachments for a given chat, including their download URLs.
 */
export const getAttachmentsForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const attachments = await ctx.db
      .query("chat_attachments")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        url: attachment.url,
      }))
    );
  },
});

export const deleteAttachments = mutation({
  args: { attachmentIds: v.array(v.id("chat_attachments")) },
  handler: async (ctx, { attachmentIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Create a Set for O(1) lookup of attachment IDs to delete
    const attachmentIdsToDelete = new Set(attachmentIds);

    // Fetch all user attachments in a single query using the by_userId index
    const userAttachments = await ctx.db
      .query("chat_attachments")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Filter to only include attachments that are in the deletion list
    const validAttachments = userAttachments.filter((attachment) =>
      attachmentIdsToDelete.has(attachment._id)
    );

    // Delete files from storage and database records in parallel
    const keysToDelete = validAttachments.map((a) => a.key);
    const docIdsToDelete = validAttachments.map((a) => a._id);

    await Promise.all([
      ...keysToDelete.map((key) => r2.deleteObject(ctx, key)),
      ...docIdsToDelete.map((id) => ctx.db.delete(id)),
    ]);
  },
});

export const getAttachmentsForChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Verify ownership of the chat
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
    }

    const attachments = await ctx.db
      .query("chat_attachments")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .collect();

    return Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        url: attachment.url,
      }))
    );
  },
});
// no-op
