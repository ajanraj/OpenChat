import { v } from "convex/values";

export const UserApiKey = v.object({
  userId: v.id("users"),
  provider: v.string(),
  encryptedKey: v.string(),
  mode: v.optional(v.union(v.literal("priority"), v.literal("fallback"))),
  messageCount: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
});
