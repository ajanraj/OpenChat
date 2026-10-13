import { ConvexError, v } from "convex/values";
import { MODELS_MAP } from "../src/lib/config";
import { SCHEDULED_AGENT_MODEL_ID } from "../src/lib/config/models/minimax";
import { ERROR_CODES } from "../src/lib/error-codes";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";
import { calculateNextExecution, type TaskSchedule, validateSchedule } from "./lib/schedule_helper";
import { ScheduledTask } from "./schema/scheduled_task";
import { TaskHistory } from "./schema/task_history";
import { hasActivePremium } from "./stripe";
import { deleteExecutionHistory, pruneExecutionHistory } from "./task_history";

// Task lifecycle: create/update/resume schedule runs of scheduled_ai:executeTask. Each run first
// claims the task (claimTaskExecution) and ends through finishTaskExecution, or through
// expireTaskExecution if the action dies before it can finish.

// Constants for task limits ("active" and "running" tasks count)
const TASK_LIMITS = {
  daily: 5,
  weekly: 10,
  total: 10,
} as const;

// A claimed run still unfinished after this long is dead: actions are killed after 10 minutes.
const STALE_RUN_MS = 15 * 60 * 1000;

const scheduledTaskDoc = v.object({
  _id: v.id("scheduled_tasks"),
  _creationTime: v.number(),
  ...ScheduledTask.fields,
});

type ScheduleType = Doc<"scheduled_tasks">["scheduleType"];

async function assertScheduledAgentAccess(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const scheduledModel = MODELS_MAP[SCHEDULED_AGENT_MODEL_ID];
  if (!scheduledModel) {
    throw new ConvexError(ERROR_CODES.UNSUPPORTED_MODEL);
  }
  if (!scheduledModel.premium) {
    return;
  }

  if (!(await hasActivePremium(ctx, userId))) {
    throw new ConvexError(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
  }
}

/** Counts the user's tasks that hold a schedule ("active" or "running"), optionally excluding one. */
async function getTaskCounts(
  ctx: QueryCtx,
  userId: Id<"users">,
  excludeTaskId?: Id<"scheduled_tasks">,
): Promise<Record<keyof typeof TASK_LIMITS, number>> {
  // Reading past the total limit is unnecessary: at that point every schedule type is blocked.
  const withStatus = (status: "active" | "running") =>
    ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", status))
      .take(TASK_LIMITS.total + 1);
  const tasks = (await Promise.all([withStatus("active"), withStatus("running")]))
    .flat()
    .filter((task) => task._id !== excludeTaskId);

  return {
    daily: tasks.filter((t) => t.scheduleType === "daily").length,
    weekly: tasks.filter((t) => t.scheduleType === "weekly").length,
    total: tasks.length,
  };
}

/**
 * Throws when one more active task of `scheduleType` would exceed TASK_LIMITS. Used on create,
 * on resume/reactivation, and when an active task changes its schedule type (pass that task as
 * `excludeTaskId` so it is not counted twice).
 */
async function assertWithinTaskLimits(
  ctx: MutationCtx,
  userId: Id<"users">,
  scheduleType: ScheduleType,
  excludeTaskId?: Id<"scheduled_tasks">,
): Promise<void> {
  const counts = await getTaskCounts(ctx, userId, excludeTaskId);
  if (scheduleType === "daily" && counts.daily >= TASK_LIMITS.daily) {
    throw new ConvexError(`Daily task limit reached (max ${TASK_LIMITS.daily})`);
  }
  if (scheduleType === "weekly" && counts.weekly >= TASK_LIMITS.weekly) {
    throw new ConvexError(`Weekly task limit reached (max ${TASK_LIMITS.weekly})`);
  }
  if (counts.total >= TASK_LIMITS.total) {
    throw new ConvexError(`Total task limit reached (max ${TASK_LIMITS.total})`);
  }
}

async function assertOwnedProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  profileId: Id<"profiles">,
): Promise<void> {
  const profile = await ctx.db.get("profiles", profileId);
  if (!profile || profile.userId !== userId) {
    throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
  }
}

/** Returns the scheduled job while it is still waiting to run, otherwise null. */
async function getPendingRun(ctx: MutationCtx, scheduledFunctionId: string | undefined) {
  if (!scheduledFunctionId) {
    return null;
  }
  const job = await ctx.db.system.get(
    "_scheduled_functions",
    scheduledFunctionId as Id<"_scheduled_functions">,
  );
  return job?.state.kind === "pending" ? job : null;
}

/**
 * Cancels a scheduled run only while it is pending: cancelling a finished job throws, and an
 * in-progress run must keep the work it schedules (e.g. its summary email).
 */
async function cancelPendingRun(
  ctx: MutationCtx,
  scheduledFunctionId: string | undefined,
): Promise<void> {
  const job = await getPendingRun(ctx, scheduledFunctionId);
  if (job) {
    await ctx.scheduler.cancel(job._id);
  }
}

/** Schedules the task's next run and returns the scheduling fields to store on the task. */
async function scheduleRun(
  ctx: MutationCtx,
  taskId: Id<"scheduled_tasks">,
  schedule: TaskSchedule,
  now?: number,
): Promise<Pick<Doc<"scheduled_tasks">, "nextExecution" | "scheduledFunctionId">> {
  const nextExecution = calculateNextExecution(schedule, now);
  const scheduledFunctionId = await ctx.scheduler.runAt(
    nextExecution,
    internal.scheduled_ai.executeTask,
    { taskId },
  );
  return { nextExecution, scheduledFunctionId };
}

/** True while a claimed run is younger than STALE_RUN_MS. */
function hasLiveRun(task: Doc<"scheduled_tasks">, now: number): boolean {
  return task.status === "running" && (task.lastExecuted ?? 0) > now - STALE_RUN_MS;
}

const RUN_OUTCOME_HISTORY_STATUS = {
  success: "success",
  failure: "failure",
  timeout: "timeout",
  paused: "cancelled",
} as const;

type RunOutcome = keyof typeof RUN_OUTCOME_HISTORY_STATUS;

/**
 * Records a run's outcome on its history row and releases the task the run holds:
 * one-time tasks are archived (also after a failure), recurring tasks return to "active"
 * (their next run was booked at claim time), and "paused" (usage limit) pauses the task.
 * No-op if the run was already resolved, so finish and expiry can race safely.
 */
async function resolveRun(
  ctx: MutationCtx,
  run: {
    taskId: Id<"scheduled_tasks">;
    executionId: string;
    outcome: RunOutcome;
    chatId?: Id<"chats">;
    errorMessage?: string;
    metadata?: Doc<"task_history">["metadata"];
  },
): Promise<void> {
  const row = await ctx.db
    .query("task_history")
    .withIndex("by_execution_id", (q) => q.eq("executionId", run.executionId))
    .unique();
  if (!row || row.status !== "running") {
    return;
  }
  await ctx.db.patch("task_history", row._id, {
    status: RUN_OUTCOME_HISTORY_STATUS[run.outcome],
    endTime: Date.now(),
    chatId: run.chatId,
    errorMessage: run.errorMessage,
    metadata: run.metadata,
  });

  const task = await ctx.db.get("scheduled_tasks", run.taskId);
  // The claim stamps task.lastExecuted and row.startTime with the same value, so a task
  // taken over by a later claim is left alone.
  if (task?.status === "running" && task.lastExecuted === row.startTime) {
    if (run.outcome === "paused" || task.scheduleType === "onetime") {
      // Also drops a still-pending run: the one booked at claim time, or a one-time task's
      // scheduled run after a manual "run now".
      await cancelPendingRun(ctx, task.scheduledFunctionId);
      await ctx.db.patch("scheduled_tasks", task._id, {
        status: run.outcome === "paused" ? "paused" : "archived",
        nextExecution: undefined,
        scheduledFunctionId: undefined,
      });
    } else {
      await ctx.db.patch("scheduled_tasks", task._id, { status: "active" });
    }
  }

  await pruneExecutionHistory(ctx, run.taskId);
}

// Create a new scheduled task
export const createScheduledTask = mutation({
  args: {
    title: v.string(),
    prompt: v.string(),
    scheduleType: v.union(v.literal("onetime"), v.literal("daily"), v.literal("weekly")),
    scheduledTime: v.string(),
    scheduledDate: v.optional(v.string()), // For onetime tasks, format: "YYYY-MM-DD"
    timezone: v.string(),
    enableSearch: v.optional(v.boolean()),
    enabledToolSlugs: v.optional(v.array(v.string())),
    emailNotifications: v.optional(v.boolean()),
    profileId: v.optional(v.id("profiles")),
  },
  returns: v.id("scheduled_tasks"),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);
    validateSchedule(args);
    await assertScheduledAgentAccess(ctx, userId);
    await assertWithinTaskLimits(ctx, userId, args.scheduleType);
    if (args.profileId) {
      await assertOwnedProfile(ctx, userId, args.profileId);
    }

    const taskId = await ctx.db.insert("scheduled_tasks", {
      ...args,
      userId,
      status: "active",
      createdAt: Date.now(),
    });
    await ctx.db.patch("scheduled_tasks", taskId, await scheduleRun(ctx, taskId, args));
    return taskId;
  },
});

// List user's scheduled tasks
export const listScheduledTasks = query({
  args: {},
  returns: v.array(scheduledTaskDoc),
  handler: async (ctx) => {
    const userId = await ensureAuthenticated(ctx);

    return await ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// Update a scheduled task (edit, pause, resume, archive). Rejected while a run is in progress.
export const updateScheduledTask = mutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
    scheduleType: v.optional(
      v.union(v.literal("onetime"), v.literal("daily"), v.literal("weekly")),
    ),
    scheduledTime: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    timezone: v.optional(v.string()),
    enableSearch: v.optional(v.boolean()),
    enabledToolSlugs: v.optional(v.array(v.string())),
    emailNotifications: v.optional(v.boolean()),
    profileId: v.optional(v.id("profiles")),
    // "running" is set only by claimTaskExecution
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("archived"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }
    // The in-flight run owns the task status until it finishes.
    if (task.status === "running") {
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_OPERATION);
    }

    const schedule: TaskSchedule = {
      scheduleType: args.scheduleType ?? task.scheduleType,
      scheduledTime: args.scheduledTime ?? task.scheduledTime,
      scheduledDate: args.scheduledDate ?? task.scheduledDate,
      timezone: args.timezone ?? task.timezone,
    };
    const scheduleChanged =
      args.scheduleType !== undefined ||
      args.scheduledTime !== undefined ||
      args.scheduledDate !== undefined ||
      args.timezone !== undefined;
    if (scheduleChanged) {
      validateSchedule(schedule);
    }

    const wasActive = task.status === "active";
    const willBeActive = (args.status ?? task.status) === "active";
    if (willBeActive && !wasActive) {
      await assertScheduledAgentAccess(ctx, userId);
    }
    if (willBeActive && (!wasActive || schedule.scheduleType !== task.scheduleType)) {
      await assertWithinTaskLimits(ctx, userId, schedule.scheduleType, task._id);
    }
    if (args.profileId !== undefined) {
      await assertOwnedProfile(ctx, userId, args.profileId);
    }

    const { taskId: _taskId, ...changes } = args;
    const updates: Partial<Doc<"scheduled_tasks">> = changes;

    if (wasActive && (!willBeActive || scheduleChanged)) {
      await cancelPendingRun(ctx, task.scheduledFunctionId);
    }
    if (willBeActive && (!wasActive || scheduleChanged)) {
      Object.assign(updates, await scheduleRun(ctx, task._id, schedule));
    } else if (!willBeActive) {
      updates.nextExecution = undefined;
      updates.scheduledFunctionId = undefined;
    }

    await ctx.db.patch("scheduled_tasks", task._id, updates);
    return null;
  },
});

// Delete a scheduled task with its pending run and execution history
export const deleteScheduledTask = mutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    await cancelPendingRun(ctx, task.scheduledFunctionId);
    await deleteExecutionHistory(ctx, task._id);
    await ctx.db.delete("scheduled_tasks", task._id);
    return null;
  },
});

/**
 * Atomically starts a run of scheduled_ai:executeTask. Returns the claimed task, or null when
 * the run must not happen.
 *
 * - A scheduled (non-manual) run of a recurring task books the next occurrence first, so a
 *   failure, timeout, or skip never breaks the chain. A scheduled run whose task points at a
 *   pending job due in the future (so not this run) is a stray duplicate, e.g. from a second
 *   chain, and is dropped without rescheduling; the first claim of duplicates due together
 *   rebooks the chain, which makes the rest strays.
 * - A run arriving while another one is live (e.g. a scheduled run during a manual run) is
 *   skipped. A "running" claim older than STALE_RUN_MS is treated as dead and taken over.
 * - A successful claim sets status "running" and lastExecuted, inserts the "running" history
 *   row, and schedules expireTaskExecution in case the action dies without finishing.
 */
export const claimTaskExecution = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    executionId: v.string(),
    isManualTrigger: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), scheduledTaskDoc),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.status === "paused" || task.status === "archived") {
      return null;
    }
    const now = Date.now();

    if (!args.isManualTrigger) {
      const pendingRun = await getPendingRun(ctx, task.scheduledFunctionId);
      if (pendingRun && pendingRun.scheduledTime > now) {
        return null;
      }
      if (task.scheduleType !== "onetime") {
        await ctx.db.patch(
          "scheduled_tasks",
          task._id,
          await scheduleRun(ctx, task._id, task, now),
        );
      }
    }

    if (hasLiveRun(task, now)) {
      return null;
    }

    await ctx.db.patch("scheduled_tasks", task._id, { status: "running", lastExecuted: now });
    await ctx.db.insert("task_history", {
      taskId: task._id,
      executionId: args.executionId,
      status: "running",
      startTime: now,
      isManualTrigger: args.isManualTrigger,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(STALE_RUN_MS, internal.scheduled_tasks.expireTaskExecution, {
      taskId: task._id,
      executionId: args.executionId,
    });
    return await ctx.db.get("scheduled_tasks", task._id);
  },
});

// Ends a claimed run. "paused" means the run stopped on a usage limit and pauses the task.
export const finishTaskExecution = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    executionId: v.string(),
    outcome: v.union(v.literal("success"), v.literal("failure"), v.literal("paused")),
    chatId: v.optional(v.id("chats")),
    errorMessage: v.optional(v.string()),
    metadata: TaskHistory.fields.metadata,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resolveRun(ctx, args);
    return null;
  },
});

// Scheduled by claimTaskExecution: marks a run that never finished as "timeout".
export const expireTaskExecution = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    executionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resolveRun(ctx, {
      ...args,
      outcome: "timeout",
      errorMessage: "The run did not finish within the time limit.",
    });
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
    await ctx.db.patch("scheduled_tasks", args.taskId, { chatId: args.chatId });
    return null;
  },
});

/**
 * One-off repair for tasks broken by the previous executor; run manually, e.g.
 * `npx convex run scheduled_tasks:pauseDeadTasks`. Pauses (does not reschedule) "active" tasks
 * with no pending or in-progress run and "running" tasks whose run is stale, marking their
 * dangling "running" history rows as "timeout". Handles 100 tasks per batch and schedules
 * itself until the table is exhausted. Run it at least STALE_RUN_MS (15 minutes) after deploying
 * the new executor, once every run the old code started has finished or died; run it again if
 * it ran sooner.
 */
export const pauseDeadTasks = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ scanned: v.number(), paused: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("scheduled_tasks")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    let paused = 0;
    for (const task of page.page) {
      let dead = task.status === "running" && !hasLiveRun(task, now);
      if (task.status === "active") {
        const job = task.scheduledFunctionId
          ? await ctx.db.system.get(
              "_scheduled_functions",
              task.scheduledFunctionId as Id<"_scheduled_functions">,
            )
          : null;
        dead = job?.state.kind !== "pending" && job?.state.kind !== "inProgress";
      }
      if (!dead) {
        continue;
      }

      const history = await ctx.db
        .query("task_history")
        .withIndex("by_task_and_time", (q) => q.eq("taskId", task._id))
        .collect();
      for (const row of history) {
        if (row.status === "running") {
          await ctx.db.patch("task_history", row._id, {
            status: "timeout",
            endTime: now,
            errorMessage: "The run did not finish within the time limit.",
          });
        }
      }
      await ctx.db.patch("scheduled_tasks", task._id, {
        status: "paused",
        nextExecution: undefined,
        scheduledFunctionId: undefined,
      });
      paused += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.scheduled_tasks.pauseDeadTasks, {
        cursor: page.continueCursor,
      });
    }
    console.log(`pauseDeadTasks: scanned ${page.page.length}, paused ${paused}`);
    return { scanned: page.page.length, paused, isDone: page.isDone };
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
    const counts = await getTaskCounts(ctx, userId);

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

// Run an active task once now; its regular schedule is unchanged
export const triggerScheduledTask = mutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }
    // Paused, archived, and already-running tasks cannot be triggered
    if (task.status !== "active") {
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_OPERATION);
    }

    await assertScheduledAgentAccess(ctx, userId);

    await ctx.scheduler.runAfter(0, internal.scheduled_ai.executeTask, {
      taskId: args.taskId,
      isManualTrigger: true,
    });

    return null;
  },
});
