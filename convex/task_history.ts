import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import { internalMutation, query } from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";

// Shared validator for task_history entity metadata
const taskHistoryMetadataValidator = v.optional(
  v.object({
    modelId: v.optional(v.string()),
    modelName: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),
    serverDurationMs: v.optional(v.number()),
    includeSearch: v.optional(v.boolean()),
    toolkitSlugs: v.optional(v.array(v.string())),
  })
);

// Shared validator for task_history entity status
const taskHistoryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failure"),
  v.literal("cancelled"),
  v.literal("timeout")
);

// Shared validator for complete task_history entity
const taskHistoryEntityValidator = v.object({
  _id: v.id("task_history"),
  _creationTime: v.number(),
  taskId: v.id("scheduled_tasks"),
  executionId: v.string(),
  status: taskHistoryStatusValidator,
  startTime: v.number(),
  endTime: v.optional(v.number()),
  chatId: v.optional(v.id("chats")),
  errorMessage: v.optional(v.string()),
  metadata: taskHistoryMetadataValidator,
  isManualTrigger: v.optional(v.boolean()),
  createdAt: v.number(),
});

// Create a new task execution history record
export const createExecutionHistory = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    executionId: v.string(),
    startTime: v.number(),
    isManualTrigger: v.optional(v.boolean()),
  },
  returns: v.id("task_history"),
  handler: async (ctx, args) => {
    const historyId = await ctx.db.insert("task_history", {
      taskId: args.taskId,
      executionId: args.executionId,
      status: "running", // Task is now running, will be updated on completion/failure
      startTime: args.startTime,
      isManualTrigger: args.isManualTrigger,
      createdAt: Date.now(),
    });

    return historyId;
  },
});

// Update execution history with results
export const updateExecutionHistory = internalMutation({
  args: {
    executionId: v.string(),
    status: taskHistoryStatusValidator,
    endTime: v.number(),
    chatId: v.optional(v.id("chats")),
    errorMessage: v.optional(v.string()),
    metadata: taskHistoryMetadataValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find the history record by executionId
    const historyRecord = await ctx.db
      .query("task_history")
      .withIndex("by_execution_id", (q) =>
        q.eq("executionId", args.executionId)
      )
      .unique();

    if (!historyRecord) {
      throw new ConvexError({
        message: "Execution history record not found",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    // Update the record
    await ctx.db.patch(historyRecord._id, {
      status: args.status,
      endTime: args.endTime,
      chatId: args.chatId,
      errorMessage: args.errorMessage,
      metadata: args.metadata,
    });

    return null;
  },
});

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
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Task not found or access denied",
        code: ERROR_CODES.INVALID_INPUT,
      });
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
        status: taskHistoryStatusValidator,
        startTime: v.number(),
        endTime: v.optional(v.number()),
        chatId: v.optional(v.id("chats")),
        isManualTrigger: v.optional(v.boolean()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // First verify the user owns this task
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Task not found or access denied",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    // Get all execution history for this task
    const allHistory = await ctx.db
      .query("task_history")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const totalExecutions = allHistory.length;
    const successfulExecutions = allHistory.filter(
      (h) => h.status === "success"
    ).length;
    const failedExecutions = allHistory.filter(
      (h) =>
        h.status === "failure" ||
        h.status === "cancelled" ||
        h.status === "timeout"
    ).length;
    const runningExecutions = allHistory.filter(
      (h) => h.status === "running" || h.status === "pending"
    ).length;
    const completedExecutions = successfulExecutions + failedExecutions;
    const successRate =
      completedExecutions > 0
        ? (successfulExecutions / completedExecutions) * 100
        : 0;

    // Calculate average duration for completed executions (only those with endTime)
    const executionsWithEndTime = allHistory.filter(
      (h) => h.endTime !== undefined
    );
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
            current.startTime > latest.startTime ? current : latest
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

// Get detailed execution information
export const getExecutionDetails = query({
  args: {
    executionId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      ...taskHistoryEntityValidator.fields,
      taskTitle: v.string(), // Include task title for context
    })
  ),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // Find the execution record
    const execution = await ctx.db
      .query("task_history")
      .withIndex("by_execution_id", (q) =>
        q.eq("executionId", args.executionId)
      )
      .unique();

    if (!execution) {
      return null;
    }

    // Verify the user owns the task
    const task = await ctx.db.get(execution.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError({
        message: "Task not found or access denied",
        code: ERROR_CODES.INVALID_INPUT,
      });
    }

    return {
      ...execution,
      taskTitle: task.title,
    };
  },
});

// Clean up old execution history (retention policy)
export const cleanupOldExecutions = internalMutation({
  args: {
    taskId: v.id("scheduled_tasks"),
    keepCount: v.optional(v.number()), // Default to 30
  },
  returns: v.object({
    deletedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const keepCount = args.keepCount || 30;

    // Get all executions for this task, ordered by most recent first
    const allExecutions = await ctx.db
      .query("task_history")
      .withIndex("by_task_and_time", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();

    // If we have more than keepCount, delete the oldest ones
    if (allExecutions.length > keepCount) {
      const executionsToDelete = allExecutions.slice(keepCount);

      // Delete executions in parallel for better performance
      await Promise.all(
        executionsToDelete.map((execution) => ctx.db.delete(execution._id))
      );
      const deletedCount = executionsToDelete.length;

      return { deletedCount };
    }

    return { deletedCount: 0 };
  },
});
