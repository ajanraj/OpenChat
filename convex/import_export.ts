import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

export const bulkImportChat = mutation({
  args: {
    chat: v.object({
      title: v.optional(v.string()),
      model: v.optional(v.string()),
      personaId: v.optional(v.string()),
    }),
    messages: v.array(
      v.object({
        role: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system")
        ),
        content: v.string(),
        parts: v.optional(v.array(v.any())), // Use any to allow any part structure
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
        createdAt: v.optional(v.number()),
        parentMessageId: v.optional(v.id("messages")),
        originalId: v.optional(v.string()),
        parentOriginalId: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({
    chatId: v.id("chats"),
    messageCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Create chat
    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      userId,
      title: args.chat.title ?? "Imported Chat",
      model: args.chat.model,
      personaId: args.chat.personaId,
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });

    // Create ID mapping for threading
    const idMap = new Map<string, Id<"messages">>();

    // Insert all messages in order (preserving threading)
    for (const msg of args.messages) {
      const parentMessageId = msg.parentOriginalId
        ? idMap.get(msg.parentOriginalId)
        : undefined;

      const messageId = await ctx.db.insert("messages", {
        chatId,
        userId, // Always attribute imported messages to the importing user for consistency
        role: msg.role,
        content: msg.content,
        parts: msg.parts,
        metadata: msg.metadata ?? {},
        parentMessageId,
        createdAt: msg.createdAt ?? now,
      });

      if (msg.originalId) {
        idMap.set(msg.originalId, messageId);
      }
    }

    // Update chat timestamp to reflect last message
    await ctx.db.patch(chatId, { updatedAt: now });

    return { chatId, messageCount: args.messages.length };
  },
});
