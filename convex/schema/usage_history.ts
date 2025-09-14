import { v } from "convex/values";

export const UsageHistory = v.object({
  userId: v.id("users"),
  messageCount: v.number(),
  periodStart: v.number(),
  periodEnd: v.number(),
  createdAt: v.optional(v.number()),
});
