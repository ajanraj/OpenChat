import { v } from "convex/values";

export const ScheduledTask = v.object({
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  title: v.string(),
  prompt: v.string(),
  scheduleType: v.union(v.literal("onetime"), v.literal("daily"), v.literal("weekly")),
  scheduledTime: v.string(), // "HH:MM"; weekly tasks use "D:HH:MM" (D: 0 = Sunday ... 6 = Saturday)
  scheduledDate: v.optional(v.string()), // "YYYY-MM-DD" format for onetime tasks
  timezone: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("archived"),
    v.literal("running"),
  ),
  enableSearch: v.optional(v.boolean()),
  enabledToolSlugs: v.optional(v.array(v.string())),
  emailNotifications: v.optional(v.boolean()),
  lastExecuted: v.optional(v.number()), // Start of the latest run; while "running", when the run was claimed
  nextExecution: v.optional(v.number()),
  scheduledFunctionId: v.optional(v.string()), // Convex scheduled function ID
  createdAt: v.number(),
  chatId: v.optional(v.id("chats")), // Chat created by the most recent execution (server-managed)
});
