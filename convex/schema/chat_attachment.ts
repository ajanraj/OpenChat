import { v } from "convex/values";

export const ChatAttachment = v.object({
  userId: v.id("users"),
  // Allow creating a pending row before associating to a chat
  chatId: v.optional(v.id("chats")),
  // R2 object key
  key: v.string(),
  // These are filled after metadata sync / final save
  // Display name
  fileName: v.optional(v.string()),
  fileType: v.optional(v.string()),
  fileSize: v.optional(v.number()),
  // Indicates if this is an AI-generated image
  isGenerated: v.optional(v.boolean()),
  // Permanent public storage URL
  url: v.optional(v.string()),
});
