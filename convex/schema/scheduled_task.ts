import { v } from "convex/values";

export const ScheduledTask = v.object({
  userId: v.id("users"),
  title: v.string(),
  prompt: v.string(),
  scheduleType: v.union(
    v.literal("onetime"),
    v.literal("daily"),
    v.literal("weekly")
  ),
  scheduledTime: v.string(), // "HH:MM" format for all types
  scheduledDate: v.optional(v.string()), // "YYYY-MM-DD" format for onetime tasks
  timezone: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("archived"),
    v.literal("running")
  ),
  enableSearch: v.optional(v.boolean()),
  enabledToolSlugs: v.optional(v.array(v.string())),
  emailNotifications: v.optional(v.boolean()),
  lastExecuted: v.optional(v.number()),
  nextExecution: v.optional(v.number()),
  scheduledFunctionId: v.optional(v.string()), // Convex scheduled function ID
  createdAt: v.number(),
  chatId: v.optional(v.id("chats")), // Optional: link to specific chat
});
