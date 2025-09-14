import { v } from "convex/values";

export const Message = v.object({
  chatId: v.id("chats"),
  userId: v.optional(v.id("users")),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(), // Keeping content for search compatibility
  parts: v.optional(v.any()), // New parts system
  createdAt: v.optional(v.number()),
  parentMessageId: v.optional(v.id("messages")), // Keeping for threading
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
});
