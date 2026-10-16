import { v } from "convex/values";

export const TaskHistory = v.object({
  taskId: v.id("scheduled_tasks"),
  executionId: v.string(), // Unique identifier for this execution
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("success"),
    v.literal("failure"),
    v.literal("cancelled"),
    v.literal("timeout")
  ),
  startTime: v.number(), // Execution start timestamp
  endTime: v.optional(v.number()), // Execution end timestamp
  chatId: v.optional(v.id("chats")), // Link to generated chat (if successful)
  errorMessage: v.optional(v.string()), // Capture failures and exceptions
  metadata: v.optional(
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
  ),
  isManualTrigger: v.optional(v.boolean()), // Track manual vs scheduled executions
  createdAt: v.number(),
});
