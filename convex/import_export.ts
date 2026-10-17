import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { ERROR_CODES } from "../src/lib/error-codes";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { forEachInOrder } from "./lib/sequence";
import { resolveChatProfileId } from "./profiles";

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
        // Use any to allow any part structure
        parts: v.optional(v.array(v.any())),
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
      // Imports go to the user's active profile
      profileId: await resolveChatProfileId(ctx, userId),
      createdAt: now,
      updatedAt: now,
      // Always set explicit boolean defaults (never undefined)
      public: false,
      shareAttachments: false,
    });

    // Create ID mapping for threading
    const idMap = new Map<string, Id<"messages">>();

    // Insert all messages in order (preserving threading). Each insert must
    // finish before the next one, because a reply looks up its parent's new id.
    await forEachInOrder(args.messages, async (msg) => {
      const parentMessageId =
        msg.parentOriginalId !== undefined && msg.parentOriginalId !== ""
          ? idMap.get(msg.parentOriginalId)
          : undefined;

      const messageId = await ctx.db.insert("messages", {
        chatId,
        // Always attribute imported messages to the importing user for consistency
        userId,
        role: msg.role,
        content: msg.content,
        parts: msg.parts,
        metadata: msg.metadata ?? {},
        parentMessageId,
        createdAt: msg.createdAt ?? now,
      });

      if (msg.originalId !== undefined && msg.originalId !== "") {
        idMap.set(msg.originalId, messageId);
      }
    });

    // Update chat timestamp to reflect last message
    await ctx.db.patch("chats", chatId, { updatedAt: now });

    return { chatId, messageCount: args.messages.length };
  },
});
