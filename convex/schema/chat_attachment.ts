import { v } from "convex/values";

export const ChatAttachment = v.object({
  userId: v.id("users"),
  // Allow creating a pending row before associating to a chat
  chatId: v.optional(v.id("chats")),
  key: v.string(), // R2 object key
  // These are filled after metadata sync / final save
  fileName: v.optional(v.string()), // display name
  fileType: v.optional(v.string()),
  fileSize: v.optional(v.number()),
  isGenerated: v.optional(v.boolean()), // Indicates if this is an AI-generated image
  url: v.optional(v.string()), // Permanent public storage URL
});
