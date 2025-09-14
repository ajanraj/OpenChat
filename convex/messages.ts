import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
// Import helper functions
import { ensureChatAccess, ensureMessageAccess } from "./lib/auth_helper";
import { sanitizeMessageParts } from "./lib/sanitization_helper";

// Keep reusable regex at top-level per lint rule
const TRAILING_SLASH_RE = /\/$/;

// New: Get messages for public shared chat with optional redaction
export const getPublicChatMessages = query({
  args: {
    chatId: v.id("chats"),
  },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system")
      ),
      parts: v.optional(v.any()),
      metadata: v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      }),
    })
  ),
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
    if (!(chat && (chat.public ?? false))) {
      return [];
    }

    const hideFiles = !(chat.shareAttachments ?? false);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) => q.eq("chatId", chatId))
      .order("asc")
      .collect();

    // Sanitize parts if needed
    return messages.map((m) => {
      const sanitizedParts = sanitizeMessageParts(m.parts, { hideFiles });

      return {
        _id: m._id,
        role: m.role,
        parts: sanitizedParts,
        metadata: m.metadata,
      };
    });
  },
});

/**
 * Helper function to clean up attachments for messages
 */
async function cleanupMessageAttachments(
  ctx: MutationCtx,
  messagesToDelete: Doc<"messages">[],
  userId: Id<"users">
) {
  const attachmentCleanupPromises: Promise<void>[] = [];

  for (const msgToDelete of messagesToDelete) {
    if (msgToDelete.parts) {
      for (const part of msgToDelete.parts) {
        if (
          part &&
          part.type === "file" &&
          typeof part.url === "string" &&
          part.url
        ) {
          attachmentCleanupPromises.push(
            cleanupSingleAttachment(ctx, msgToDelete.chatId, part.url, userId)
          );
        }
      }
    }
  }

  await Promise.allSettled(attachmentCleanupPromises);
}

/**
 * Helper function to clean up a single attachment
 */
async function cleanupSingleAttachment(
  ctx: MutationCtx,
  chatId: Id<"chats">,
  fileUrl: string,
  userId: Id<"users">
) {
  const r2 = new R2(components.r2);
  try {
    // Derive R2 object key from the URL and use by_key index
    const configuredBase = process.env.R2_PUBLIC_URL_BASE;
    const base = configuredBase
      ? configuredBase.replace(TRAILING_SLASH_RE, "")
      : undefined;
    const canonicalUrl = fileUrl.split("?")[0];

    if (!(base && canonicalUrl.startsWith(`${base}/`))) {
      return; // URL doesn't match configured base; nothing to clean up
    }

    const key = canonicalUrl.slice(base.length + 1);
    if (!key) {
      return;
    }

    const attByKey = await ctx.db
      .query("chat_attachments")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (attByKey && attByKey.userId === userId && attByKey.chatId === chatId) {
      await r2.deleteObject(ctx, attByKey.key);
      await ctx.db.delete(attByKey._id);
    }
  } catch (_error) {
    // Silently continue with other cleanup if one attachment fails
  }
}

/**
 * Helper function to clean up branched chats
 */
async function cleanupBranchedChats(
  ctx: MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">
) {
  // This uses .filter() correctly - first narrows by index (by_user), then filters by originalChatId
  // See: https://docs.convex.dev/database/indexes/ - "For all other filtering you can use the .filter method"
  const branchedChats = await ctx.db
    .query("chats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("originalChatId"), chatId))
    .collect();

  const updatePromises = branchedChats.map((branchedChat: Doc<"chats">) =>
    ctx.db.patch(branchedChat._id, {
      originalChatId: undefined,
      updatedAt: Date.now(),
    })
  );

  await Promise.all(updatePromises);
}

/**
 * Helper function to clean up orphaned attachments
 */
async function cleanupOrphanedAttachments(
  ctx: MutationCtx,
  chatId: Id<"chats">
) {
  const r2 = new R2(components.r2);
  const orphanedAttachments = await ctx.db
    .query("chat_attachments")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .collect();

  const cleanupPromises = orphanedAttachments.map(
    async (attachment: Doc<"chat_attachments">) => {
      try {
        await r2.deleteObject(ctx, attachment.key);
        await ctx.db.delete(attachment._id);
      } catch (_error) {
        // Silently continue with other cleanup
      }
    }
  );

  await Promise.allSettled(cleanupPromises);
}

/**
 * Shared helper function to insert a message to chat
 * Used by both public mutations (with auth) and internal mutations (without auth)
 */
async function insertMessageToChat(
  ctx: MutationCtx,
  args: {
    chatId: Id<"chats">;
    role: "user" | "assistant" | "system";
    content: string;
    parentMessageId?: Id<"messages">;
    // biome-ignore lint/suspicious/noExplicitAny: <parts can be any>
    parts?: any;
    metadata?: {
      modelId?: string;
      modelName?: string;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      cachedInputTokens?: number;
      serverDurationMs?: number;
      includeSearch?: boolean;
      reasoningEffort?: string;
    };
  },
  userId: Id<"users">
): Promise<{ messageId: Id<"messages"> }> {
  const messageId = await ctx.db.insert("messages", {
    chatId: args.chatId,
    userId,
    role: args.role,
    content: args.content,
    parentMessageId: args.parentMessageId,
    parts: args.parts,
    metadata: args.metadata || {},
    createdAt: Date.now(),
  });

  await ctx.db.patch(args.chatId, { updatedAt: Date.now() });
  return { messageId };
}

export const sendUserMessageToChat = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    parentMessageId: v.optional(v.id("messages")),
    parts: v.optional(v.any()), // Allow any type for parts
    metadata: v.optional(
      v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    // Verify that the authenticated user owns the chat
    const { userId } = await ensureChatAccess(ctx, args.chatId);

    return await insertMessageToChat(ctx, args, userId);
  },
});

export const saveAssistantMessage = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    parentMessageId: v.optional(v.id("messages")),
    parts: v.optional(v.any()),
    metadata: v.optional(
      v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    // Verify that the authenticated user owns the chat
    const { userId } = await ensureChatAccess(ctx, args.chatId);

    return await insertMessageToChat(ctx, args, userId);
  },
});

export const getMessagesForChat = query({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      chatId: v.id("chats"),
      userId: v.optional(v.id("users")),
      role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system")
      ),
      content: v.string(),
      createdAt: v.optional(v.number()),
      parts: v.optional(v.any()),
      parentMessageId: v.optional(v.id("messages")),
      metadata: v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      }),
    })
  ),
  handler: async (ctx, { chatId }) => {
    // Verify user has access (but don't throw - return empty array)
    try {
      await ensureChatAccess(ctx, chatId);
    } catch {
      return [];
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) => q.eq("chatId", chatId))
      .order("asc")
      .collect();
  },
});

// Note: Single-message deletion is handled via deleteMessageAndDescendants

export const getMessageDetails = query({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({
      parentMessageId: v.optional(v.id("messages")),
      role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system")
      ),
    })
  ),
  handler: async (ctx, args) => {
    try {
      const { message } = await ensureMessageAccess(ctx, args.messageId);
      return {
        parentMessageId: message.parentMessageId,
        role: message.role,
      };
    } catch {
      return null;
    }
  },
});

export const deleteMessageAndDescendants = mutation({
  args: {
    messageId: v.id("messages"),
    deleteOnlyDescendants: v.optional(v.boolean()),
  },
  returns: v.object({ chatDeleted: v.boolean() }),
  handler: async (ctx, { messageId, deleteOnlyDescendants = false }) => {
    // Try to get message access
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { chatDeleted: false };
    }
    const message = await ctx.db.get(messageId);
    if (!message) {
      return { chatDeleted: false };
    }
    const chat = await ctx.db.get(message.chatId);
    if (!chat || chat.userId !== userId) {
      return { chatDeleted: false };
    }

    const threshold = message.createdAt ?? message._creationTime;

    // Fix: Use .collect() directly instead of async iteration
    // See: https://docs.convex.dev/database/reading-data
    const messagesToDelete = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) =>
        deleteOnlyDescendants
          ? q.eq("chatId", message.chatId).gt("createdAt", threshold)
          : q.eq("chatId", message.chatId).gte("createdAt", threshold)
      )
      .order("asc")
      .collect();

    const ids = messagesToDelete.map((m) => m._id);

    // Clean up attachments
    await cleanupMessageAttachments(ctx, messagesToDelete, userId);

    // Delete messages in batch
    const deletePromises = ids.map((id) => ctx.db.delete(id));
    await Promise.all(deletePromises);

    // Update chat timestamp
    await ctx.db.patch(chat._id, { updatedAt: Date.now() });

    const remaining = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) => q.eq("chatId", message.chatId))
      .first();

    if (!remaining) {
      // Clean up branched chats
      await cleanupBranchedChats(ctx, chat._id, userId);

      // Clean up any remaining orphaned attachments for this chat
      await cleanupOrphanedAttachments(ctx, chat._id);

      await ctx.db.delete(chat._id);
      return { chatDeleted: true };
    }
    return { chatDeleted: false };
  },
});

export const patchMessageContent = mutation({
  args: {
    messageId: v.id("messages"),
    newContent: v.string(),
    newParts: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, newContent, newParts }) => {
    // Verify that the authenticated user owns the message and get context
    const { message, chat, userId } = await ensureMessageAccess(ctx, messageId);

    // If parts were provided, compute removed file URLs and clean up attachments
    if (typeof newParts !== "undefined") {
      // Collect previous and next file URLs (ignore blob:)
      const prevUrls: string[] = [];
      const nextUrls: string[] = [];

      // biome-ignore lint/suspicious/noExplicitAny: parts can be any; we validate properties at runtime
      for (const part of (message.parts as any[]) ?? []) {
        const type = (part as { type?: string }).type;
        const url = (part as { url?: string }).url;
        if (
          type === "file" &&
          typeof url === "string" &&
          !url.startsWith("blob:")
        ) {
          prevUrls.push(url.split("?")[0]);
        }
      }
      // biome-ignore lint/suspicious/noExplicitAny: parts can be any; we validate properties at runtime
      for (const part of (newParts as any[]) ?? []) {
        const type = (part as { type?: string }).type;
        const url = (part as { url?: string }).url;
        if (
          type === "file" &&
          typeof url === "string" &&
          !url.startsWith("blob:")
        ) {
          nextUrls.push(url.split("?")[0]);
        }
      }

      // Compute removed URLs
      const nextSet = new Set(nextUrls);
      const removed = prevUrls.filter((u) => !nextSet.has(u));

      if (removed.length > 0) {
        // Best-effort cleanup; continue even if some deletions fail
        await Promise.allSettled(
          removed.map((url) =>
            cleanupSingleAttachment(ctx, chat._id, url, userId)
          )
        );
      }
    }

    // Patch existing message with new content/parts
    const patch: Partial<Doc<"messages">> = { content: newContent };
    if (typeof newParts !== "undefined") {
      patch.parts = newParts;
    }
    await ctx.db.patch(messageId, patch);
    // Update chat timestamp
    await ctx.db.patch(message.chatId, { updatedAt: Date.now() });
  },
});

export const searchMessages = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      chatId: v.id("chats"),
      content: v.string(),
      createdAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { query: search, limit = 20 }) => {
    const safeLimit = Math.min(Math.max(1, limit), 100); // Cap between 1-100
    const userId = await getAuthUserId(ctx);
    if (!userId || search.trim() === "") {
      return [];
    }

    const results = await ctx.db
      .query("messages")
      .withSearchIndex("by_user_content", (q) =>
        q.search("content", search).eq("userId", userId)
      )
      .take(safeLimit);

    return results.map((msg) => ({
      _id: msg._id,
      chatId: msg.chatId,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  },
});

// Internal mutation for scheduled tasks to send user messages
export const sendUserMessageToChatInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    parentMessageId: v.optional(v.id("messages")),
    parts: v.optional(v.any()),
    metadata: v.optional(
      v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    // Get the chat to find the userId (no auth in scheduled functions)
    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    return await insertMessageToChat(ctx, args, chat.userId);
  },
});

// Internal mutation for scheduled tasks to save assistant messages
export const saveAssistantMessageInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    parentMessageId: v.optional(v.id("messages")),
    parts: v.optional(v.any()),
    metadata: v.optional(
      v.object({
        modelId: v.optional(v.string()),
        modelName: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cachedInputTokens: v.optional(v.number()),
        serverDurationMs: v.optional(v.number()),
        includeSearch: v.optional(v.boolean()),
        reasoningEffort: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    // Get the chat to find the userId (no auth in scheduled functions)
    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    return await insertMessageToChat(ctx, args, chat.userId);
  },
});
