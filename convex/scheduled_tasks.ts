import { ConvexError, v } from "convex/values";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { ERROR_CODES } from "../lib/error-codes";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezonePlugin);

// Constants for task limits
const TASK_LIMITS = {
  daily: 5,
  weekly: 10,
  total: 10,
} as const;

// Helper function to parse scheduled time and convert to next execution timestamp
export function calculateNextExecution(
  scheduleType: "onetime" | "daily" | "weekly",
  scheduledTime: string,
  timezone: string,
  scheduledDate?: string
): number {
  const now = Date.now();

  if (scheduleType === "onetime") {
    // For one-time tasks, scheduledTime is "HH:MM" format
    const [hours, minutes] = scheduledTime.split(":").map(Number);

    let utcDate: Date;

    if (scheduledDate) {
      // Use the provided date in "YYYY-MM-DD" format and create directly in user timezone
      const [year, month, day] = scheduledDate.split("-").map(Number);
      // Build a zero-padded ISO 8601 local datetime to avoid ambiguous parsing
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const HH = String(hours).padStart(2, "0");
      const MM = String(minutes).padStart(2, "0");
      const isoLocal = `${year}-${mm}-${dd}T${HH}:${MM}`;
      utcDate = dayjs.tz(isoLocal, timezone).utc().toDate();
    } else {
      // Fallback to tomorrow if no date provided (backward compatibility)
      // Create tomorrow's date directly in user timezone
      const tomorrow = dayjs().tz(timezone).add(1, "day");
      utcDate = tomorrow
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0)
        .utc()
        .toDate();
    }

    if (!utcDate || Number.isNaN(utcDate.getTime())) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return utcDate.getTime();
  }

  // For recurring tasks, always calculate from the scheduled time
  // This ensures consistent timing regardless of execution delays

  if (scheduleType === "daily") {
    // scheduledTime format: "HH:MM"
    const [hours, minutes] = scheduledTime.split(":").map(Number);

    // Create today's date at the specified time directly in user timezone
    const today = dayjs().tz(timezone);
    let utcDate = today
      .hour(hours)
      .minute(minutes)
      .second(0)
      .millisecond(0)
      .utc()
      .toDate();

    if (!utcDate || Number.isNaN(utcDate.getTime())) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    // Keep adding days until we find the next future occurrence
    let currentDay = today;
    while (utcDate.getTime() <= now) {
      currentDay = currentDay.add(1, "day");
      utcDate = currentDay
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0)
        .utc()
        .toDate();

      if (!utcDate || Number.isNaN(utcDate.getTime())) {
        throw new Error(`Invalid timezone: ${timezone}`);
      }
    }

    return utcDate.getTime();
  }

  if (scheduleType === "weekly") {
    // scheduledTime format: "day:HH:MM" where day is 0-6 (Sunday-Saturday)
    const parts = scheduledTime.split(":");
    const targetDay = Number.parseInt(parts[0], 10);
    const hours = Number.parseInt(parts[1], 10);
    const minutes = Number.parseInt(parts[2], 10);

    // Create target date directly in the user's timezone
    const nowInUserTz = dayjs().tz(timezone);
    const currentDay = nowInUserTz.day();
    const daysToTarget = (targetDay - currentDay + 7) % 7;

    const targetDate = nowInUserTz.add(daysToTarget, "day");
    let utcDate = targetDate
      .hour(hours)
      .minute(minutes)
      .second(0)
      .millisecond(0)
      .utc()
      .toDate();

    if (!utcDate || Number.isNaN(utcDate.getTime())) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    // If this week's occurrence is in the past, add 7 days
    const nowTimestamp = Date.now();
    if (utcDate.getTime() <= nowTimestamp) {
      const nextWeekDate = targetDate.add(7, "day");
      utcDate = nextWeekDate
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0)
        .utc()
        .toDate();

      if (!utcDate || Number.isNaN(utcDate.getTime())) {
        throw new Error(`Invalid timezone: ${timezone}`);
      }
    }

    return utcDate.getTime();
  }

  throw new Error("Invalid schedule type");
}

// Create a new scheduled task
export const createScheduledTask = mutation({
  args: {
    title: v.string(),
    prompt: v.string(),
    scheduleType: v.union(
      v.literal("onetime"),
      v.literal("daily"),
      v.literal("weekly")
    ),
    scheduledTime: v.string(),
    scheduledDate: v.optional(v.string()), // For onetime tasks, format: "YYYY-MM-DD"
    timezone: v.string(),
    enableSearch: v.optional(v.boolean()),
    enabledToolSlugs: v.optional(v.array(v.string())),
    emailNotifications: v.optional(v.boolean()),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.id("scheduled_tasks"),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // Validate user limits - only count 'active' tasks
    const activeTasks = await ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const counts = {
      daily: activeTasks.filter((t) => t.scheduleType === "daily").length,
      weekly: activeTasks.filter((t) => t.scheduleType === "weekly").length,
      total: activeTasks.length,
    };

    // Check limits
    if (args.scheduleType === "daily" && counts.daily >= TASK_LIMITS.daily) {
      throw new ConvexError("Daily task limit reached (max 5)");
    }
    if (args.scheduleType === "weekly" && counts.weekly >= TASK_LIMITS.weekly) {
      throw new ConvexError("Weekly task limit reached (max 10)");
    }
    if (counts.total >= TASK_LIMITS.total) {
      throw new ConvexError("Total task limit reached (max 10)");
    }

    const now = Date.now();
    const nextExecution = calculateNextExecution(
      args.scheduleType,
      args.scheduledTime,
      args.timezone,
      args.scheduledDate
    );

    // Insert the task
    const taskId = await ctx.db.insert("scheduled_tasks", {
      userId,
      title: args.title,
      prompt: args.prompt,
      scheduleType: args.scheduleType,
      scheduledTime: args.scheduledTime,
      scheduledDate: args.scheduledDate,
      timezone: args.timezone,
      status: "active",
      enableSearch: args.enableSearch,
      enabledToolSlugs: args.enabledToolSlugs,
      emailNotifications: args.emailNotifications,
      chatId: args.chatId,
      createdAt: now,
      nextExecution,
    });

    // Schedule the function
    const scheduledFunctionId = await ctx.scheduler.runAt(
      nextExecution,
      internal.scheduled_ai.executeTask,
      { taskId }
    );

    // Update task with scheduled function ID
    await ctx.db.patch(taskId, { scheduledFunctionId });

    return taskId;
  },
});

// List user's scheduled tasks
export const listScheduledTasks = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("scheduled_tasks"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      prompt: v.string(),
      scheduleType: v.union(
        v.literal("onetime"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      scheduledTime: v.string(),
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
      lastExecuted: v.optional(v.number()),
      nextExecution: v.optional(v.number()),
      scheduledFunctionId: v.optional(v.string()),
      createdAt: v.number(),
      chatId: v.optional(v.id("chats")),
    })
  ),
  handler: async (ctx) => {
    const userId = await ensureAuthenticated(ctx);

    return await ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// Update a scheduled task
export const updateScheduledTask = mutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
    scheduleType: v.optional(
      v.union(v.literal("onetime"), v.literal("daily"), v.literal("weekly"))
    ),
    scheduledTime: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    timezone: v.optional(v.string()),
    enableSearch: v.optional(v.boolean()),
    enabledToolSlugs: v.optional(v.array(v.string())),
    emailNotifications: v.optional(v.boolean()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("archived"),
        v.literal("running")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Scheduled task not found",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    // Prepare update object
    const updates: Partial<Doc<"scheduled_tasks">> = {};
    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.prompt !== undefined) {
      updates.prompt = args.prompt;
    }
    if (args.timezone !== undefined) {
      updates.timezone = args.timezone;
    }
    if (args.enableSearch !== undefined) {
      updates.enableSearch = args.enableSearch;
    }
    if (args.enabledToolSlugs !== undefined) {
      updates.enabledToolSlugs = args.enabledToolSlugs;
    }
    if (args.emailNotifications !== undefined) {
      updates.emailNotifications = args.emailNotifications;
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.scheduledDate !== undefined) {
      updates.scheduledDate = args.scheduledDate;
    }
    if (args.scheduleType !== undefined) {
      updates.scheduleType = args.scheduleType;
    }

    // If scheduledTime, scheduledDate, timezone, or scheduleType changed, recalculate next execution
    if (
      args.scheduledTime !== undefined ||
      args.scheduledDate !== undefined ||
      args.timezone !== undefined ||
      args.scheduleType !== undefined
    ) {
      const newScheduledTime = args.scheduledTime ?? task.scheduledTime;
      const newScheduledDate = args.scheduledDate ?? task.scheduledDate;
      const newScheduleType = args.scheduleType ?? task.scheduleType;

      // Cancel existing scheduled function if any
      if (task.scheduledFunctionId) {
        await ctx.scheduler.cancel(
          task.scheduledFunctionId as Id<"_scheduled_functions">
        );
      }

      // Only reschedule if task status is active (or becoming active)
      if (
        args.status !== "paused" &&
        args.status !== "archived" &&
        task.status === "active"
      ) {
        const nextExecution = calculateNextExecution(
          newScheduleType,
          newScheduledTime,
          args.timezone ?? task.timezone,
          newScheduledDate
        );

        const scheduledFunctionId = await ctx.scheduler.runAt(
          nextExecution,
          internal.scheduled_ai.executeTask,
          { taskId: args.taskId }
        );

        updates.scheduledTime = newScheduledTime;
        updates.nextExecution = nextExecution;
        updates.scheduledFunctionId = scheduledFunctionId;
      } else {
        updates.scheduledTime = newScheduledTime;
        updates.scheduledFunctionId = undefined;
        updates.nextExecution = undefined;
      }
    }

    // Handle status transitions (pause/resume/archive)
    if (
      args.status !== undefined &&
      args.scheduledTime === undefined &&
      args.scheduledDate === undefined &&
      args.timezone === undefined &&
      args.scheduleType === undefined
    ) {
      if (args.status === "active" && task.status !== "active") {
        // Reactivating from paused/archived - schedule next execution
        const nextExecution = calculateNextExecution(
          task.scheduleType,
          task.scheduledTime,
          task.timezone,
          task.scheduledDate
        );

        const scheduledFunctionId = await ctx.scheduler.runAt(
          nextExecution,
          internal.scheduled_ai.executeTask,
          { taskId: args.taskId }
        );

        updates.nextExecution = nextExecution;
        updates.scheduledFunctionId = scheduledFunctionId;
      } else if (
        (args.status === "paused" || args.status === "archived") &&
        task.status === "active"
      ) {
        // Pausing or archiving - cancel scheduled function
        if (task.scheduledFunctionId) {
          await ctx.scheduler.cancel(
            task.scheduledFunctionId as Id<"_scheduled_functions">
          );
        }
        updates.scheduledFunctionId = undefined;
        updates.nextExecution = undefined;
      }
    }

    await ctx.db.patch(args.taskId, updates);
    return null;
  },
});

// Delete a scheduled task
export const deleteScheduledTask = mutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Scheduled task not found",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    // Cancel scheduled function if any
    if (task.scheduledFunctionId) {
      await ctx.scheduler.cancel(
        task.scheduledFunctionId as Id<"_scheduled_functions">
      );
    }

    await ctx.db.delete(args.taskId);
    return null;
  },
});

// Internal query to get task details
export const getTask = internalQuery({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("scheduled_tasks"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      prompt: v.string(),
      scheduleType: v.union(
        v.literal("onetime"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      scheduledTime: v.string(),
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
      lastExecuted: v.optional(v.number()),
      nextExecution: v.optional(v.number()),
      scheduledFunctionId: v.optional(v.string()),
      createdAt: v.number(),
      chatId: v.optional(v.id("chats")),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

// Internal mutation to update task after execution
export const updateTaskAfterExecution = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    lastExecuted: v.number(),
    nextExecution: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.string()),
    newStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("archived"),
        v.literal("running")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: Partial<Doc<"scheduled_tasks">> = {
      lastExecuted: args.lastExecuted,
    };

    if (args.nextExecution !== undefined) {
      updates.nextExecution = args.nextExecution;
    }

    if (args.scheduledFunctionId !== undefined) {
      updates.scheduledFunctionId = args.scheduledFunctionId;
    }

    if (args.newStatus) {
      updates.status = args.newStatus;
      // If archiving, clear scheduling info
      if (args.newStatus === "archived") {
        updates.scheduledFunctionId = undefined;
        updates.nextExecution = undefined;
      }
    }

    await ctx.db.patch(args.taskId, updates);
    return null;
  },
});

// Internal mutation to update task chat ID
export const updateTaskChatId = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    chatId: v.id("chats"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, { chatId: args.chatId });
    return null;
  },
});

// Get task counts and remaining limits for the current user
export const getTaskLimits = query({
  args: {},
  returns: v.object({
    daily: v.object({
      current: v.number(),
      limit: v.number(),
      remaining: v.number(),
    }),
    weekly: v.object({
      current: v.number(),
      limit: v.number(),
      remaining: v.number(),
    }),
    total: v.object({
      current: v.number(),
      limit: v.number(),
      remaining: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const userId = await ensureAuthenticated(ctx);

    // Get all active tasks for the user (only 'active' status counts toward limits)
    const activeTasks = await ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const counts = {
      daily: activeTasks.filter((t) => t.scheduleType === "daily").length,
      weekly: activeTasks.filter((t) => t.scheduleType === "weekly").length,
      total: activeTasks.length,
    };

    return {
      daily: {
        current: counts.daily,
        limit: TASK_LIMITS.daily,
        remaining: TASK_LIMITS.daily - counts.daily,
      },
      weekly: {
        current: counts.weekly,
        limit: TASK_LIMITS.weekly,
        remaining: TASK_LIMITS.weekly - counts.weekly,
      },
      total: {
        current: counts.total,
        limit: TASK_LIMITS.total,
        remaining: TASK_LIMITS.total - counts.total,
      },
    };
  },
});

// Manual trigger for testing
export const triggerScheduledTask = mutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Scheduled task not found",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    // Schedule immediate execution with manual trigger flag
    await ctx.scheduler.runAfter(0, internal.scheduled_ai.executeTask, {
      taskId: args.taskId,
      isManualTrigger: true,
    });

    return null;
  },
});
