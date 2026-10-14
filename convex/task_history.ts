import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../src/lib/error-codes";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";
import { TaskHistory } from "./schema/task_history";

// Execution history rows are written by the run lifecycle in scheduled_tasks.ts
// (claimRun / finishTaskExecution / expireTaskExecution).

const taskHistoryEntityValidator = v.object({
  _id: v.id("task_history"),
  _creationTime: v.number(),
  ...TaskHistory.fields,
});

/** Keeps the newest `keepCount` execution rows of a task and deletes the rest. */
export async function pruneExecutionHistory(
  ctx: MutationCtx,
  taskId: Id<"scheduled_tasks">,
  keepCount = 30,
): Promise<void> {
  const rows = await ctx.db
    .query("task_history")
    .withIndex("by_task_and_time", (q) => q.eq("taskId", taskId))
    .order("desc")
    .collect();
  await Promise.all(rows.slice(keepCount).map((row) => ctx.db.delete("task_history", row._id)));
}

/** Deletes every execution row of a task; call before deleting the task itself. */
export async function deleteExecutionHistory(
  ctx: MutationCtx,
  taskId: Id<"scheduled_tasks">,
): Promise<void> {
  await pruneExecutionHistory(ctx, taskId, 0);
}

// Get execution history for a specific task
export const getTaskExecutionHistory = query({
  args: {
    taskId: v.id("scheduled_tasks"),
    limit: v.optional(v.number()),
  },
  returns: v.array(taskHistoryEntityValidator),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // First verify the user owns this task
    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    // Get execution history for this task, ordered by most recent first
    const limit = args.limit || 30;
    const history = await ctx.db
      .query("task_history")
      .withIndex("by_task_and_time", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(limit);

    return history;
  },
});

// Get execution statistics for a task
export const getTaskExecutionStats = query({
  args: {
    taskId: v.id("scheduled_tasks"),
  },
  returns: v.object({
    totalExecutions: v.number(),
    successfulExecutions: v.number(),
    failedExecutions: v.number(),
    runningExecutions: v.number(),
    completedExecutions: v.number(),
    successRate: v.number(),
    averageDuration: v.optional(v.number()),
    lastExecution: v.optional(
      v.object({
        _id: v.id("task_history"),
        status: TaskHistory.fields.status,
        startTime: v.number(),
        endTime: v.optional(v.number()),
        chatId: v.optional(v.id("chats")),
        isManualTrigger: v.optional(v.boolean()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // First verify the user owns this task
    const task = await ctx.db.get("scheduled_tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    // Get all execution history for this task
    const allHistory = await ctx.db
      .query("task_history")
      .withIndex("by_task_and_time", (q) => q.eq("taskId", args.taskId))
      .collect();

    const totalExecutions = allHistory.length;
    const successfulExecutions = allHistory.filter((h) => h.status === "success").length;
    const failedExecutions = allHistory.filter(
      (h) => h.status === "failure" || h.status === "cancelled" || h.status === "timeout",
    ).length;
    const runningExecutions = allHistory.filter(
      (h) => h.status === "running" || h.status === "pending",
    ).length;
    const completedExecutions = successfulExecutions + failedExecutions;
    const successRate =
      completedExecutions > 0 ? (successfulExecutions / completedExecutions) * 100 : 0;

    // Calculate average duration for completed executions (only those with endTime)
    const executionsWithEndTime = allHistory.filter((h) => h.endTime !== undefined);
    const averageDuration =
      executionsWithEndTime.length > 0
        ? executionsWithEndTime.reduce((sum, h) => {
            const duration = (h.endTime ?? 0) - h.startTime;
            return sum + duration;
          }, 0) / executionsWithEndTime.length
        : undefined;

    // Get most recent execution
    const lastExecution =
      allHistory.length > 0
        ? allHistory.reduce((latest, current) =>
            current.startTime > latest.startTime ? current : latest,
          )
        : undefined;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      runningExecutions,
      completedExecutions,
      successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
      averageDuration,
      lastExecution: lastExecution
        ? {
            _id: lastExecution._id,
            status: lastExecution.status,
            startTime: lastExecution.startTime,
            endTime: lastExecution.endTime,
            chatId: lastExecution.chatId,
            isManualTrigger: lastExecution.isManualTrigger,
          }
        : undefined,
    };
  },
});
