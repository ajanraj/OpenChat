import { v } from "convex/values";

export const Feedback = v.object({
  userId: v.id("users"),
  message: v.string(),
  createdAt: v.optional(v.number()),
});
