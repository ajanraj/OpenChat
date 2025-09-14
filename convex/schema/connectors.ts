import { v } from "convex/values";

export const Connector = v.object({
  userId: v.id("users"),
  type: v.union(
    v.literal("gmail"),
    v.literal("googlecalendar"),
    v.literal("googledrive"),
    v.literal("notion"),
    v.literal("googledocs"),
    v.literal("googlesheets"),
    v.literal("slack"),
    v.literal("linear"),
    v.literal("github"),
    v.literal("twitter")
  ),
  connectionId: v.string(),
  isConnected: v.boolean(),
  // Enable/disable connector without removing OAuth connection
  // Optional for backward-compatibility with existing records
  enabled: v.optional(v.boolean()),
  displayName: v.optional(v.string()),
});
