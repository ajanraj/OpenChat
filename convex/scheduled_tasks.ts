import { ConvexError, v } from "convex/values";

import { MODELS_MAP } from "../src/lib/config/models";
import { SCHEDULED_AGENT_MODEL_ID } from "../src/lib/config/models/minimax";
import { ERROR_CODES } from "../src/lib/error-codes";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";
import {
  calculateNextExecution,
  validateSchedule,
} from "./lib/schedule_helper";
import type { TaskSchedule } from "./lib/schedule_helper";
import { forEachInOrder } from "./lib/sequence";
import { ScheduledTask } from "./schema/scheduled_task";
import { TaskHistory } from "./schema/task_history";
import { hasActivePremium } from "./stripe";
import { deleteExecutionHistory, pruneExecutionHistory } from "./task_history";

// Task lifecycle: create/update/resume book a task's next timed run as a startScheduledRun job, a
// mutation, so it runs exactly once and is retried on transient errors (a scheduled action is
// not). That job claims the run (claimRun), which also books a recurring task's following run,
// and schedules scheduled_ai:executeTask to perform it; triggerScheduledTask ("run now") claims
// the same way. Each claimed run ends through finishTaskExecution, or through
// expireTaskExecution if the action dies before it can finish.

// Constants for task limits ("active" and "running" tasks count)
const TASK_LIMITS = {
  daily: 5,
  weekly: 10,
  total: 10,
} as const;

// A claimed run still unfinished after this long is dead: scheduled_ai:executeTask ends at once
// unless it starts within 8 minutes of the claim, and Convex kills Node actions after 10 minutes.
const STALE_RUN_MS = 20 * 60 * 1000;

const scheduledTaskDoc = v.object({
  _id: v.id("scheduled_tasks"),
  _creationTime: v.number(),
  ...ScheduledTask.fields,
});

type ScheduleType = Doc<"scheduled_tasks">["scheduleType"];

const assertScheduledAgentAccess = async (
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> => {
  if (!(SCHEDULED_AGENT_MODEL_ID in MODELS_MAP)) {
    throw new ConvexError(ERROR_CODES.UNSUPPORTED_MODEL);
  }
  const scheduledModel = MODELS_MAP[SCHEDULED_AGENT_MODEL_ID];
  if (!scheduledModel.premium) {
    return;
  }

  if (!(await hasActivePremium(ctx, userId))) {
    throw new ConvexError(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
  }
};

/** Counts the user's tasks that hold a schedule ("active" or "running"), optionally excluding one. */
const getTaskCounts = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  excludeTaskId?: Id<"scheduled_tasks">
): Promise<Record<keyof typeof TASK_LIMITS, number>> => {
  // Reading past the total limit is unnecessary: at that point every schedule type is blocked.
  const withStatus = async (status: "active" | "running") =>
    await ctx.db
      .query("scheduled_tasks")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", status)
      )
      .take(TASK_LIMITS.total + 1);
  const [activeTasks, runningTasks] = await Promise.all([
    withStatus("active"),
    withStatus("running"),
  ]);
  const tasks = [...activeTasks, ...runningTasks].filter(
    (task) => task._id !== excludeTaskId
  );

  return {
    daily: tasks.filter((t) => t.scheduleType === "daily").length,
    weekly: tasks.filter((t) => t.scheduleType === "weekly").length,
    total: tasks.length,
  };
};

/**
 * Throws when one more active task of `scheduleType` would exceed TASK_LIMITS. Used on create,
 * on resume/reactivation, and when an active task changes its schedule type (pass that task as
 * `excludeTaskId` so it is not counted twice).
 */
const assertWithinTaskLimits = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  scheduleType: ScheduleType,
  excludeTaskId?: Id<"scheduled_tasks">
): Promise<void> => {
  const counts = await getTaskCounts(ctx, userId, excludeTaskId);
  if (scheduleType === "daily" && counts.daily >= TASK_LIMITS.daily) {
    throw new ConvexError(
      `Daily task limit reached (max ${TASK_LIMITS.daily})`
    );
  }
  if (scheduleType === "weekly" && counts.weekly >= TASK_LIMITS.weekly) {
    throw new ConvexError(
      `Weekly task limit reached (max ${TASK_LIMITS.weekly})`
    );
  }
  if (counts.total >= TASK_LIMITS.total) {
    throw new ConvexError(
      `Total task limit reached (max ${TASK_LIMITS.total})`
    );
  }
};

const assertOwnedProfile = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  profileId: Id<"profiles">
): Promise<void> => {
  const profile = await ctx.db.get("profiles", profileId);
  if (!profile || profile.userId !== userId) {
    throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
  }
};

/** Returns a task's scheduled job, or null when it has none or the stored id isn't a job id. */
const getScheduledJob = async (
  ctx: MutationCtx,
  scheduledFunctionId: string | undefined
) => {
  if (scheduledFunctionId === undefined || scheduledFunctionId === "") {
    return null;
  }
  const jobId = ctx.db.system.normalizeId(
    "_scheduled_functions",
    scheduledFunctionId
  );
  return jobId === null
    ? null
    : await ctx.db.system.get("_scheduled_functions", jobId);
};

/** Returns the scheduled job while it is still waiting to run, otherwise null. */
const getPendingRun = async (
  ctx: MutationCtx,
  scheduledFunctionId: string | undefined
) => {
  const job = await getScheduledJob(ctx, scheduledFunctionId);
  return job?.state.kind === "pending" ? job : null;
};

/**
 * Cancels a scheduled run only while it is pending: cancelling a finished job throws, and an
 * in-progress run must keep the work it schedules (e.g. its summary email).
 */
const cancelPendingRun = async (
  ctx: MutationCtx,
  scheduledFunctionId: string | undefined
): Promise<void> => {
  const job = await getPendingRun(ctx, scheduledFunctionId);
  if (job) {
    await ctx.scheduler.cancel(job._id);
  }
};

/** Schedules the task's next run and returns the scheduling fields to store on the task. */
const scheduleRun = async (
  ctx: MutationCtx,
  taskId: Id<"scheduled_tasks">,
  schedule: TaskSchedule,
  now?: number
): Promise<
  Pick<Doc<"scheduled_tasks">, "nextExecution" | "scheduledFunctionId">
> => {
  const nextExecution = calculateNextExecution(schedule, now);
  const scheduledFunctionId = await ctx.scheduler.runAt(
    nextExecution,
    internal.scheduled_tasks.startScheduledRun,
    { taskId }
  );
  return { nextExecution, scheduledFunctionId };
};

/** True while a claimed run is younger than STALE_RUN_MS. */
const hasLiveRun = (task: Doc<"scheduled_tasks">, now: number): boolean =>
  task.status === "running" && (task.lastExecuted ?? 0) > now - STALE_RUN_MS;

/**
 * Atomically starts a run of an "active" or "running" task and schedules
 * scheduled_ai:executeTask to perform it. Used by startScheduledRun (timed runs) and
 * triggerScheduledTask (manual runs).
 *
 * - A timed run of a recurring task books the next occurrence first, so a failure, timeout, or
 *   skip never breaks the chain. A timed run whose task points at a pending job due in the future
 *   (so not this run) is a stray duplicate, e.g. from a second chain, and is dropped without
 *   rescheduling; the first claim of duplicates due together rebooks the chain, which makes the
 *   rest strays. Manual runs neither book nor get dropped.
 * - A run arriving while another one is live (e.g. a timed run during a manual run) is skipped.
 *   A "running" claim older than STALE_RUN_MS is treated as dead and taken over.
 * - A successful claim sets status "running" and lastExecuted, inserts the "running" history
 *   row, and schedules expireTaskExecution in case the action dies without finishing.
 */
const claimRun = async (
  ctx: MutationCtx,
  task: Doc<"scheduled_tasks">,
  isManualTrigger: boolean
): Promise<void> => {
  const now = Date.now();
  let booking = {};

  if (!isManualTrigger) {
    const pendingRun = await getPendingRun(ctx, task.scheduledFunctionId);
    if (pendingRun && pendingRun.scheduledTime > now) {
      return;
    }
    if (task.scheduleType !== "onetime") {
      booking = await scheduleRun(ctx, task._id, task, now);
      await ctx.db.patch("scheduled_tasks", task._id, booking);
    }
  }

  if (hasLiveRun(task, now)) {
    return;
  }

  const claim = { status: "running" as const, lastExecuted: now };
  const executionId = `exec_${now}_${Math.random().toString(36).slice(2, 15)}`;
  await ctx.db.patch("scheduled_tasks", task._id, claim);
  await ctx.db.insert("task_history", {
    taskId: task._id,
    executionId,
    status: "running",
    startTime: now,
    isManualTrigger,
    createdAt: now,
  });
  await ctx.scheduler.runAfter(
    STALE_RUN_MS,
    internal.scheduled_tasks.expireTaskExecution,
    {
      taskId: task._id,
      executionId,
    }
  );
  await ctx.scheduler.runAfter(0, internal.scheduled_ai.executeTask, {
    task: { ...task, ...booking, ...claim },
    executionId,
  });
};

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
const resolveRun = async (
  ctx: MutationCtx,
  run: {
    taskId: Id<"scheduled_tasks">;
    executionId: string;
    outcome: RunOutcome;
    chatId?: Id<"chats">;
    errorMessage?: string;
    metadata?: Doc<"task_history">["metadata"];
  }
): Promise<void> => {
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
};

/** The task's schedule with any schedule fields of an update applied over it. */
const mergeSchedule = (
  update: Partial<TaskSchedule>,
  task: Doc<"scheduled_tasks">
): TaskSchedule => ({
  scheduleType: update.scheduleType ?? task.scheduleType,
  scheduledTime: update.scheduledTime ?? task.scheduledTime,
  scheduledDate: update.scheduledDate ?? task.scheduledDate,
  timezone: update.timezone ?? task.timezone,
});

/**
 * Checks an update that leaves `task` active: premium access when it (re)activates, and task
 * limits when it (re)activates or changes its schedule type.
 */
const assertCanStayActive = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  task: Doc<"scheduled_tasks">,
  scheduleType: ScheduleType
): Promise<void> => {
  const wasActive = task.status === "active";
  if (!wasActive) {
    await assertScheduledAgentAccess(ctx, userId);
  }
  if (!wasActive || scheduleType !== task.scheduleType) {
    await assertWithinTaskLimits(ctx, userId, scheduleType, task._id);
  }
};

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
    // For onetime tasks, format: "YYYY-MM-DD"
    scheduledDate: v.optional(v.string()),
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
    await ctx.db.patch(
      "scheduled_tasks",
      taskId,
      await scheduleRun(ctx, taskId, args)
    );
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
      v.union(v.literal("onetime"), v.literal("daily"), v.literal("weekly"))
    ),
    scheduledTime: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    timezone: v.optional(v.string()),
    enableSearch: v.optional(v.boolean()),
    enabledToolSlugs: v.optional(v.array(v.string())),
    emailNotifications: v.optional(v.boolean()),
    profileId: v.optional(v.id("profiles")),
    // "running" is set only by claimRun
    status: v.optional(
      v.union(v.literal("active"), v.literal("paused"), v.literal("archived"))
    ),
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

    const schedule = mergeSchedule(args, task);
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
    if (willBeActive) {
      await assertCanStayActive(ctx, userId, task, schedule.scheduleType);
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

// Delete a scheduled task with its pending run and execution history. A run in progress can't be
// stopped, so the task can't be deleted until it finishes (or expires).
export const deleteScheduledTask = mutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }
    if (task.status === "running") {
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_OPERATION);
    }

    await cancelPendingRun(ctx, task.scheduledFunctionId);
    await deleteExecutionHistory(ctx, task._id);
    await ctx.db.delete("scheduled_tasks", task._id);
    return null;
  },
});

/**
 * The scheduled job of a timed run, booked by scheduleRun at the task's next occurrence. Claims
 * the run (see claimRun); paused, archived, and deleted tasks are ignored.
 */
export const startScheduledRun = internalMutation({
  args: { taskId: v.id("scheduled_tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (task?.status === "active" || task?.status === "running") {
      await claimRun(ctx, task, false);
    }
    return null;
  },
});

// Ends a claimed run. "paused" means the run stopped on a usage limit and pauses the task.
export const finishTaskExecution = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    executionId: v.string(),
    outcome: v.union(
      v.literal("success"),
      v.literal("failure"),
      v.literal("paused")
    ),
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

// Scheduled by claimRun: marks a run that never finished as "timeout".
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

// Timed runs used to be jobs of this action. _scheduled_functions names carry the module's ".js"
// extension ("scheduled_ai.js:executeTask"), which is dropped before comparing.
const LEGACY_RUN_FUNCTION = "scheduled_ai:executeTask";

/** Migrates or pauses one task for migrateScheduledRuns (see there) and reports which it did. */
const migrateTaskRun = async (
  ctx: MutationCtx,
  task: Doc<"scheduled_tasks">,
  now: number,
  pauseAll: boolean
): Promise<"migrated" | "paused" | "unchanged"> => {
  if (task.status === "paused" || task.status === "archived") {
    return "unchanged";
  }
  const job = await getScheduledJob(ctx, task.scheduledFunctionId);
  const liveRun = hasLiveRun(task, now);
  const dead =
    task.status === "running"
      ? !liveRun
      : job?.state.kind !== "pending" && job?.state.kind !== "inProgress";

  if (pauseAll || dead) {
    await cancelPendingRun(ctx, task.scheduledFunctionId);
    const history = await ctx.db
      .query("task_history")
      .withIndex("by_task_and_time", (q) => q.eq("taskId", task._id))
      .collect();
    // Only a live claim's row (its startTime is the claim time) can still be resolved, by
    // finishTaskExecution or expireTaskExecution; a run the old code started never will be
    const unresolvable = history.filter(
      (row) =>
        row.status === "running" &&
        !(liveRun && row.startTime === task.lastExecuted)
    );
    await Promise.all(
      unresolvable.map(async (row) => {
        await ctx.db.patch("task_history", row._id, {
          status: "timeout",
          endTime: now,
          errorMessage: "The run did not finish within the time limit.",
        });
      })
    );
    await ctx.db.patch("scheduled_tasks", task._id, {
      status: "paused",
      nextExecution: undefined,
      scheduledFunctionId: undefined,
    });
    return "paused";
  }
  if (
    job?.state.kind === "pending" &&
    job.name.replace(".js:", ":") === LEGACY_RUN_FUNCTION
  ) {
    await ctx.scheduler.cancel(job._id);
    const scheduledFunctionId = await ctx.scheduler.runAt(
      job.scheduledTime,
      internal.scheduled_tasks.startScheduledRun,
      { taskId: task._id }
    );
    await ctx.db.patch("scheduled_tasks", task._id, { scheduledFunctionId });
    return "migrated";
  }
  return "unchanged";
};

/**
 * One-off migration of timed runs from scheduled_ai:executeTask jobs to startScheduledRun jobs.
 * Pending old jobs can no longer run (executeTask now requires a claimed run), so run it right
 * after deploying Convex: `npx convex run scheduled_tasks:migrateScheduledRuns --prod`. For each
 * task whose scheduledFunctionId is a pending old job, it cancels that job and books
 * startScheduledRun at the same time. It then pauses (does not reschedule) dead tasks: "active"
 * tasks with no pending or in-progress run and "running" tasks whose run is stale, marking their
 * dangling "running" history rows as "timeout". Run it again STALE_RUN_MS (20 minutes) later to
 * catch runs the old code was still starting during the deploy.
 *
 * With `'{"pauseAll": true}'` it pauses every task that is not paused or archived instead,
 * cancelling its pending run. A live claim is left to finish and record its outcome (resolveRun
 * keeps the task paused); every other "running" history row becomes "timeout", including that of
 * a run the old code was still performing, which can no longer record its outcome.
 *
 * Handles 100 tasks per batch and schedules itself until the table is exhausted.
 */
export const migrateScheduledRuns = internalMutation({
  args: {
    pauseAll: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    scanned: v.number(),
    migrated: v.number(),
    paused: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("scheduled_tasks")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    // One task at a time: tasks sharing a scheduledFunctionId must not both cancel its job
    const outcomes: Awaited<ReturnType<typeof migrateTaskRun>>[] = [];
    await forEachInOrder(page.page, async (task) => {
      outcomes.push(
        await migrateTaskRun(ctx, task, now, args.pauseAll === true)
      );
    });
    const migrated = outcomes.filter((o) => o === "migrated").length;
    const paused = outcomes.filter((o) => o === "paused").length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.scheduled_tasks.migrateScheduledRuns,
        {
          pauseAll: args.pauseAll,
          cursor: page.continueCursor,
        }
      );
    }
    console.log(
      `migrateScheduledRuns: scanned ${page.page.length}, migrated ${migrated}, paused ${paused}`
    );
    return { scanned: page.page.length, migrated, paused, isDone: page.isDone };
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

// Run an active task once now (claimed here, so it shows as running at once); its regular
// schedule is unchanged
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
    await claimRun(ctx, task, true);
    return null;
  },
});
