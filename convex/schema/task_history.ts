import { v } from "convex/values";

export const TaskHistory = v.object({
  taskId: v.id("scheduled_tasks"),
  // Unique identifier for this execution
  executionId: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("success"),
    v.literal("failure"),
    v.literal("cancelled"),
    v.literal("timeout")
  ),
  // Execution start timestamp
  startTime: v.number(),
  // Execution end timestamp
  endTime: v.optional(v.number()),
  // Link to generated chat (if successful)
  chatId: v.optional(v.id("chats")),
  // Capture failures and exceptions
  errorMessage: v.optional(v.string()),
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
  // Track manual vs scheduled executions
  isManualTrigger: v.optional(v.boolean()),
  createdAt: v.number(),
});
