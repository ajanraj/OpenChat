import { v } from "convex/values";

export const Chat = v.object({
  userId: v.id("users"),
  title: v.optional(v.string()),
  model: v.optional(v.string()),
  personaId: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  originalChatId: v.optional(v.id("chats")),
  isPinned: v.optional(v.boolean()),
  // Public sharing controls (undefined = false, but never write undefined again)
  public: v.optional(v.boolean()),
  shareAttachments: v.optional(v.boolean()),
});
