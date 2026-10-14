import { v } from "convex/values";

export const Chat = v.object({
  userId: v.id("users"),
  title: v.optional(v.string()),
  model: v.optional(v.string()),
  personaId: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  // Last activity; orders the chat list. Every writer sets it, so only legacy chats lack it
  // (they sort last in the chat list).
  updatedAt: v.optional(v.number()),
  originalChatId: v.optional(v.id("chats")),
  isPinned: v.optional(v.boolean()),
  // The profile the chat is listed under. Every writer sets it; legacy chats get their owner's
  // default profile from chats:backfillChatProfiles.
  profileId: v.optional(v.id("profiles")),
  // Public sharing controls (undefined = false, but never write undefined again)
  public: v.optional(v.boolean()),
  shareAttachments: v.optional(v.boolean()),
});
