import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import { detectRedactedContent } from "../lib/redacted-content-detector";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
// Import helper functions
import {
  ensureAuthenticated,
  ensureChatAccess,
  tryEnsureChatAccess,
  validateChatOwnership,
} from "./lib/auth_helper";
import {
  deleteChatCompletely,
  deleteMultipleChats,
} from "./lib/cleanup_helper";
import { sanitizeMessageParts } from "./lib/sanitization_helper";
import { Chat } from "./schema/chat";

// New: Publish a chat and set share policy
export const publishChat = mutation({
  args: { chatId: v.id("chats"), hideImages: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { chatId, hideImages }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }

    await ctx.db.patch(chatId, {
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
    await ctx.db.patch(chatId, {
      public: false,
      shareAttachments: false,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// New: Get minimal public chat metadata if chat is shared
export const getPublicChat = query({
  args: { chatId: v.id("chats") },
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
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
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

    const source = await ctx.db.get(sourceChatId);
    if (!(source && (source.public ?? false))) {
      throw new ConvexError(ERROR_CODES.CHAT_NOT_FOUND);
    }

    const now = Date.now();
    const newChatId = await ctx.db.insert("chats", {
      userId,
      title: source.title || "Forked Chat",
      model: source.model,
      personaId: source.personaId,
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
      parts: sanitizeMessageParts(m.parts, { hideFiles }),
    }));

    // Detect redactions (files or tool calls) that would make fork incomplete
    const redactedContentInfo = detectRedactedContent(sanitizedMsgs);
    if (redactedContentInfo.hasRedactedContent) {
      throw new ConvexError(ERROR_CODES.REDACTED_CONTENT);
    }

    // Create ID mapping for threading
    const idMap = new Map<Id<"messages">, Id<"messages">>();

    // Insert messages sequentially to preserve threading using sanitized parts
    for (const m of sanitizedMsgs) {
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
    }

    return { chatId: newChatId };
  },
});

export const createChat = mutation({
  args: {
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    personaId: v.optional(v.string()),
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
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });
    return { chatId };
  },
});

export const listChatsForUser = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("chats"),
      _creationTime: v.number(),
      ...Chat.fields,
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("chats"),
      _creationTime: v.number(),
      ...Chat.fields,
    })
  ),
  handler: async (ctx, { chatId }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    return result?.chat ?? null;
  },
});

export const updateChatModel = mutation({
  args: { chatId: v.id("chats"), model: v.string() },
  returns: v.null(),
  handler: async (ctx, { chatId, model }) => {
    const result = await tryEnsureChatAccess(ctx, chatId);
    if (!result) {
      return null;
    }
    await ctx.db.patch(chatId, { model, updatedAt: Date.now() });
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
    await ctx.db.patch(chatId, { title, updatedAt: Date.now() });
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

export const deleteAllChatsForUser = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    await deleteMultipleChats(ctx, chats, userId);
    return null;
  },
});

export const deleteBulkChats = mutation({
  args: { chatIds: v.array(v.id("chats")) },
  returns: v.null(),
  handler: async (ctx, { chatIds }) => {
    if (chatIds.length === 0) {
      return null;
    }

    // Validate all chats belong to the user
    const validChats = await validateChatOwnership(ctx, chatIds);
    if (validChats.length === 0) {
      return null;
    }

    // Get userId from the first valid chat (all have same owner)
    const userId = validChats[0].userId;
    await deleteMultipleChats(ctx, validChats, userId);
    return null;
  },
});

export const branchChat = mutation({
  args: {
    originalChatId: v.id("chats"),
    branchFromMessageId: v.id("messages"),
  },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, args) => {
    // Verify user owns the original chat
    const { chat: originalChat, userId } = await ensureChatAccess(
      ctx,
      args.originalChatId
    );

    // Verify the branch message exists and belongs to the chat
    const branchMessage = await ctx.db.get(args.branchFromMessageId);
    if (!branchMessage || branchMessage.chatId !== args.originalChatId) {
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
      title: originalChat.title || "New Chat",
      model: originalChat.model,
      personaId: originalChat.personaId,
      originalChatId: args.originalChatId,
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });

    // Get all messages up to and including the branch point
    const messagesToCopy = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_created", (q) =>
        q.eq("chatId", args.originalChatId)
      )
      .order("asc")
      .collect();

    // Copy messages up to and including the branch message in parallel
    const messageInsertPromises: Promise<Id<"messages">>[] = [];
    for (const message of messagesToCopy) {
      const messageTimestamp = message.createdAt ?? message._creationTime;

      // Include messages up to and including the branch message
      if (messageTimestamp <= branchTimestamp) {
        messageInsertPromises.push(
          ctx.db.insert("messages", {
            chatId: newChatId,
            userId: message.userId,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            parentMessageId: message.parentMessageId,
            parts: message.parts,
            metadata: message.metadata,
          })
        );
      }

      // Stop after we've processed the branch message
      if (message._id === args.branchFromMessageId) {
        break;
      }
    }

    // Execute all message insertions in parallel
    await Promise.all(messageInsertPromises);

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
    const newPinnedStatus = !chat.isPinned;

    await ctx.db.patch(chatId, {
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
  },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title ?? "New Chat",
      model: args.model,
      personaId: args.personaId,
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });
    return { chatId };
  },
});
