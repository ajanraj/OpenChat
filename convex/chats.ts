import { getAuthUserId } from "@convex-dev/auth/server";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

import { ERROR_CODES } from "../src/lib/error-codes";
import { detectRedactedContent } from "../src/lib/redacted-content-detector";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
// Import helper functions
import {
  ensureAuthenticated,
  ensureChatAccess,
  tryEnsureChatAccess,
} from "./lib/auth_helper";
import { deleteChatCompletely, purgeChatsBatch } from "./lib/cleanup_helper";
import { sanitizeMessageParts } from "./lib/sanitization_helper";
import { forEachInOrder } from "./lib/sequence";
import { getOrCreateDefaultProfileId, resolveChatProfileId } from "./profiles";
import { Chat } from "./schema/chat";

const chatDoc = v.object({
  _id: v.id("chats"),
  _creationTime: v.number(),
  ...Chat.fields,
});

// Caps for the separately listed pinned chats (shown even when their page isn't
// loaded) and for title-search results
const PINNED_CHATS_LIMIT = 100;
const CHAT_SEARCH_LIMIT = 50;

// New: Publish a chat and set share policy
export const publishChat = mutation({
  args: { chatId: v.id("chats"), hideImages: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { chatId, hideImages }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }

    await ctx.db.patch("chats", chatId, {
      public: true,
      shareAttachments: hideImages === false,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// New: Unpublish a chat
export const unpublishChat = mutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }
    await ctx.db.patch("chats", chatId, {
      public: false,
      shareAttachments: false,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// New: Get minimal public chat metadata if chat is shared
// `chatId` is the raw share-URL param, so a malformed id is treated like a missing or private chat
export const getPublicChat = query({
  args: { chatId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("chats"),
      _creationTime: v.number(),
      title: v.optional(v.string()),
      createdAt: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
      public: v.optional(v.boolean()),
      shareAttachments: v.optional(v.boolean()),
    })
  ),
  handler: async (ctx, args) => {
    const chatId = ctx.db.normalizeId("chats", args.chatId);
    if (chatId === null) {
      return null;
    }
    const chat = await ctx.db.get("chats", chatId);
    if (!(chat && (chat.public ?? false))) {
      return null;
    }
    return {
      _id: chat._id,
      _creationTime: chat._creationTime,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      public: chat.public,
      shareAttachments: chat.shareAttachments,
    };
  },
});

// New: Fork a shared chat to the current user's account with sanitized content
export const forkFromShared = mutation({
  args: { sourceChatId: v.id("chats") },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, { sourceChatId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const source = await ctx.db.get("chats", sourceChatId);
    if (!(source && (source.public ?? false))) {
      throw new ConvexError(ERROR_CODES.CHAT_NOT_FOUND);
    }

    const now = Date.now();
    const newChatId = await ctx.db.insert("chats", {
      userId,
      title:
        source.title === undefined || source.title === ""
          ? "Forked Chat"
          : source.title,
      model: source.model,
      personaId: source.personaId,
      // The user's active profile
      profileId: await resolveChatProfileId(ctx, userId),
      createdAt: now,
      updatedAt: now,
      // Do not mark fork as public by default
      public: false,
      shareAttachments: false,
    });

    const hideFiles = !(source.shareAttachments ?? false);

    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) => q.eq("chatId", sourceChatId))
      .order("asc")
      .collect();

    // Sanitize first so detection operates on the actual shared view
    const sanitizedMsgs = msgs.map((m) => ({
      ...m,
      // Stored parts are untyped; non-arrays sanitize as no parts
      parts: sanitizeMessageParts(Array.isArray(m.parts) ? m.parts : [], {
        hideFiles,
      }),
    }));

    // Detect redactions (files or tool calls) that would make fork incomplete
    const redactedContentInfo = detectRedactedContent(sanitizedMsgs);
    if (redactedContentInfo.hasRedactedContent) {
      throw new ConvexError(ERROR_CODES.REDACTED_CONTENT);
    }

    // Create ID mapping for threading
    const idMap = new Map<Id<"messages">, Id<"messages">>();

    // Insert messages sequentially to preserve threading using sanitized parts
    await forEachInOrder(sanitizedMsgs, async (m) => {
      const sanitizedParts = m.parts;

      // Map parentMessageId to new chat's message IDs
      const parentMessageId = m.parentMessageId
        ? idMap.get(m.parentMessageId)
        : undefined;

      const newMessageId = await ctx.db.insert("messages", {
        chatId: newChatId,
        userId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        parentMessageId,
        parts: sanitizedParts,
        metadata: m.metadata,
      });

      // Track the ID mapping for future parent references
      idMap.set(m._id, newMessageId);
    });

    return { chatId: newChatId };
  },
});

export const createChat = mutation({
  args: {
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    personaId: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
  },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      userId,
      title: args.title ?? "New Chat",
      model: args.model,
      personaId: args.personaId,
      // The given profile if it's the user's, else their active one
      profileId: await resolveChatProfileId(ctx, userId, args.profileId),
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });
    return { chatId };
  },
});

/**
 * Pages through the user's chats in a profile, or in every profile when `profileId` is null (the
 * settings history page), most recently active first. Includes pinned chats; the chat lists also
 * load listPinnedChatsForUser so pinned chats show before their page is loaded.
 */
export const listChatsForUser = query({
  args: {
    profileId: v.union(v.id("profiles"), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(chatDoc),
  handler: async (ctx, { profileId, paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const chats = profileId
      ? ctx.db
          .query("chats")
          .withIndex("by_user_and_profile_and_updated", (q) =>
            q.eq("userId", userId).eq("profileId", profileId)
          )
      : ctx.db
          .query("chats")
          .withIndex("by_user_and_updated", (q) => q.eq("userId", userId));
    return await chats.order("desc").paginate(paginationOpts);
  },
});

/** The user's pinned chats in a profile, newest first. */
export const listPinnedChatsForUser = query({
  args: { profileId: v.id("profiles") },
  returns: v.array(chatDoc),
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    return await ctx.db
      .query("chats")
      .withIndex("by_user_and_profile_and_pinned", (q) =>
        q.eq("userId", userId).eq("profileId", profileId).eq("isPinned", true)
      )
      .order("desc")
      .take(PINNED_CHATS_LIMIT);
  },
});

/** Full-text search over the titles of the user's chats in a profile, best matches first. */
export const searchChats = query({
  args: { query: v.string(), profileId: v.id("profiles") },
  returns: v.array(chatDoc),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const search = args.query.trim();
    if (!(userId && search)) {
      return [];
    }
    return await ctx.db
      .query("chats")
      .withSearchIndex("search_title", (q) =>
        q
          .search("title", search)
          .eq("userId", userId)
          .eq("profileId", args.profileId)
      )
      .take(CHAT_SEARCH_LIMIT);
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.null(), chatDoc),
  handler: async (ctx, { chatId }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    return result?.chat ?? null;
  },
});

// A malformed `chatId` throws (the client reports the failure); a missing or foreign chat is a no-op
export const updateChatModel = mutation({
  args: { chatId: v.string(), model: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chatId = ctx.db.normalizeId("chats", args.chatId);
    if (chatId === null) {
      throw new ConvexError(ERROR_CODES.CHAT_NOT_FOUND);
    }
    const { model } = args;
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }
    await ctx.db.patch("chats", chatId, { model, updatedAt: Date.now() });
    return null;
  },
});

export const updateChatTitle = mutation({
  args: { chatId: v.id("chats"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { chatId, title }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }
    await ctx.db.patch("chats", chatId, { title, updatedAt: Date.now() });
    return null;
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }
    const { userId } = result;
    await deleteChatCompletely(ctx, chatId, userId);
    return null;
  },
});

// Which chats a purge deletes: every chat created up to a time, or the listed chats
const chatPurgeScope = v.union(
  v.object({ createdBefore: v.number() }),
  v.object({ chatIds: v.array(v.id("chats")) })
);

/**
 * Deletes one budget-bounded batch of the user's chats in `scope` and schedules purgeChats for
 * the rest, so deleting many or large chats never exceeds a transaction's limits.
 */
const purgeChatsInScope = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  scope: Infer<typeof chatPurgeScope>
): Promise<void> => {
  if ("createdBefore" in scope) {
    // Chats created after the request (e.g. while the purge runs) are kept
    const { createdBefore } = scope;
    const done = await purgeChatsBatch(
      ctx,
      userId,
      ctx.db
        .query("chats")
        .withIndex("by_user", (q) =>
          q.eq("userId", userId).lte("_creationTime", createdBefore)
        ),
      true
    );
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.chats.purgeChats, {
        userId,
        scope,
      });
    }
    return;
  }

  const { chatIds } = scope;
  // Listed chats before `next` are deleted (or not the user's); a stopped run passes on the rest
  let next = 0;
  // Reads one chat per request (an async generator awaits each yielded read); `next` advances
  // past a chat only when the following one is requested
  const chatReads = async function* chatReads() {
    for (; next < chatIds.length; next += 1) {
      yield ctx.db.get("chats", chatIds[next]);
    }
  };
  const listedChats = async function* listedChats(): AsyncGenerator<
    Doc<"chats">
  > {
    for await (const chat of chatReads()) {
      if (chat?.userId === userId) {
        yield chat;
      }
    }
  };
  const done = await purgeChatsBatch(ctx, userId, listedChats(), true);
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.chats.purgeChats, {
      userId,
      scope: { chatIds: chatIds.slice(next) },
    });
  }
};

/** Continues a bulk chat deletion started by deleteAllChatsForUser or deleteBulkChats. */
export const purgeChats = internalMutation({
  args: { userId: v.id("users"), scope: chatPurgeScope },
  returns: v.null(),
  handler: async (ctx, { userId, scope }) => {
    await purgeChatsInScope(ctx, userId, scope);
    return null;
  },
});

/**
 * Deletes every chat the user has now. Most users' chats go in this call; the rest are deleted in
 * the background, and the chat list updates as they go.
 */
export const deleteAllChatsForUser = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    await purgeChatsInScope(ctx, userId, { createdBefore: Date.now() });
    return null;
  },
});

/** Deletes the listed chats the user owns (others are ignored), like deleteAllChatsForUser. */
export const deleteBulkChats = mutation({
  args: { chatIds: v.array(v.id("chats")) },
  returns: v.null(),
  handler: async (ctx, { chatIds }) => {
    if (chatIds.length === 0) {
      return null;
    }
    const userId = await ensureAuthenticated(ctx);
    await purgeChatsInScope(ctx, userId, { chatIds });
    return null;
  },
});

// Ids come from the client as plain strings; malformed ones throw like missing documents
export const branchChat = mutation({
  args: {
    originalChatId: v.string(),
    branchFromMessageId: v.string(),
  },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, args) => {
    const originalChatId = ctx.db.normalizeId("chats", args.originalChatId);
    if (originalChatId === null) {
      throw new ConvexError(ERROR_CODES.CHAT_NOT_FOUND);
    }
    const branchFromMessageId = ctx.db.normalizeId(
      "messages",
      args.branchFromMessageId
    );
    if (branchFromMessageId === null) {
      throw new ConvexError(ERROR_CODES.MESSAGE_NOT_FOUND);
    }
    // Verify user owns the original chat
    const { chat: originalChat, userId } = await ensureChatAccess(
      ctx,
      originalChatId
    );

    // Verify the branch message exists and belongs to the chat
    const branchMessage = await ctx.db.get("messages", branchFromMessageId);
    if (!branchMessage || branchMessage.chatId !== originalChatId) {
      throw new ConvexError(ERROR_CODES.MESSAGE_NOT_FOUND);
    }

    // Only allow branching from assistant messages
    if (branchMessage.role !== "assistant") {
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_OPERATION);
    }

    // Get the branch message creation time for filtering
    const branchTimestamp =
      branchMessage.createdAt ?? branchMessage._creationTime;

    // Create new chat with same properties as original but mark as branched
    const now = Date.now();
    const newChatId = await ctx.db.insert("chats", {
      userId,
      title:
        originalChat.title === undefined || originalChat.title === ""
          ? "New Chat"
          : originalChat.title,
      model: originalChat.model,
      personaId: originalChat.personaId,
      // The original's profile (legacy chats without one get the user's active profile)
      profileId: await resolveChatProfileId(
        ctx,
        userId,
        originalChat.profileId
      ),
      originalChatId,
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });

    // Copy messages up to and including the branch message, in order, remapping parent links to
    // the copies. Iterating lazily stops reading at the branch point.
    const idMap = new Map<Id<"messages">, Id<"messages">>();
    for await (const message of ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) => q.eq("chatId", originalChatId))
      .order("asc")) {
      if ((message.createdAt ?? message._creationTime) <= branchTimestamp) {
        // Stored parts are untyped; copy them as-is
        const parts: unknown = message.parts;
        const newMessageId = await ctx.db.insert("messages", {
          chatId: newChatId,
          userId: message.userId,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          parentMessageId: message.parentMessageId
            ? idMap.get(message.parentMessageId)
            : undefined,
          parts,
          metadata: message.metadata,
        });
        idMap.set(message._id, newMessageId);
      }

      if (message._id === branchFromMessageId) {
        break;
      }
    }

    return { chatId: newChatId };
  },
});

export const pinChatToggle = mutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }

    const { chat } = result;

    // Toggle the isPinned status
    const newPinnedStatus = chat.isPinned !== true;

    await ctx.db.patch("chats", chatId, {
      isPinned: newPinnedStatus,
    });

    return null;
  },
});

// Internal mutation to create a chat (for scheduled tasks)
export const createChatInternal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    personaId: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
  },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title ?? "New Chat",
      model: args.model,
      personaId: args.personaId,
      // The task's profile if it's the user's, else their active one
      profileId: await resolveChatProfileId(ctx, args.userId, args.profileId),
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });
    return { chatId };
  },
});

/**
 * One-off backfill that files every chat under a profile, since the chat list and title search
 * only show a profile's own chats. Run it right after deploying the profile-scoped chat indexes
 * (until it finishes, legacy chats are missing from the chat lists):
 * `npx convex run chats:backfillChatProfiles --prod`. Chats without a profile, or whose profile
 * was deleted or isn't the owner's, move to the owner's default profile (created if missing);
 * chats of deleted users are skipped. Handles 100 chats per batch and schedules itself until the
 * table is exhausted; safe to run again.
 */
export const backfillChatProfiles = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("chats")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    let updated = 0;
    let skipped = 0;
    // In order: a user's first chat may create the default profile the later ones reuse
    await forEachInOrder(page.page, async (chat) => {
      const profile = chat.profileId
        ? await ctx.db.get("profiles", chat.profileId)
        : null;
      if (profile?.userId === chat.userId) {
        return;
      }
      const user = await ctx.db.get("users", chat.userId);
      if (!user) {
        skipped += 1;
        return;
      }
      await ctx.db.patch("chats", chat._id, {
        profileId: await getOrCreateDefaultProfileId(ctx, user),
      });
      updated += 1;
    });

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.chats.backfillChatProfiles, {
        cursor: page.continueCursor,
      });
    }
    console.log(
      `backfillChatProfiles: scanned ${page.page.length}, updated ${updated}, skipped ${skipped}`
    );
    return { scanned: page.page.length, updated, skipped, isDone: page.isDone };
  },
});
