import { v } from "convex/values";

export const ScheduledTask = v.object({
  userId: v.id("users"),
  profileId: v.optional(v.id("profiles")),
  title: v.string(),
  prompt: v.string(),
  scheduleType: v.union(
    v.literal("onetime"),
    v.literal("daily"),
    v.literal("weekly")
  ),
  // "HH:MM"; weekly tasks use "D:HH:MM" (D: 0 = Sunday ... 6 = Saturday)
  scheduledTime: v.string(),
  // "YYYY-MM-DD" format for onetime tasks
  scheduledDate: v.optional(v.string()),
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
  // Start of the latest run; while "running", when the run was claimed
  lastExecuted: v.optional(v.number()),
  nextExecution: v.optional(v.number()),
  // Convex scheduled function ID
  scheduledFunctionId: v.optional(v.string()),
  createdAt: v.number(),
  // Chat of the latest run that got as far as creating one (server-managed)
  chatId: v.optional(v.id("chats")),
});
