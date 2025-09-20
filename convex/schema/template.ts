import { v } from 'convex/values';

// Template Instance - tracks user's instantiation of a template
export const TemplateInstance = v.object({
  userId: v.id('users'),
  templateId: v.string(), // Reference to template in TEMPLATE_REGISTRY
  scheduledTaskId: v.id('scheduled_tasks'), // Link to the created scheduled task

  // User customizations override template defaults
  customizations: v.optional(v.object({
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
    schedule: v.optional(v.object({
      type: v.union(v.literal('daily'), v.literal('weekly')),
      time: v.string(), // HH:MM format
      weekday: v.optional(v.number()), // 0-6 for weekly
    })),
    emailNotifications: v.optional(v.boolean()),
  })),

  // Template metadata snapshot (for historical tracking)
  templateMetadata: v.object({
    name: v.string(),
    description: v.string(),
    category: v.string(),
    requiredConnectors: v.array(v.string()),
    optionalConnectors: v.optional(v.array(v.string())),
    version: v.optional(v.string()),
  }),

  createdAt: v.number(),
  updatedAt: v.number(),
  status: v.union(
    v.literal('active'),
    v.literal('paused'),
    v.literal('archived')
  ),
});

// Template Execution Results - specialized results for template-based agents
export const TemplateResult = v.object({
  userId: v.id('users'),
  templateInstanceId: v.id('template_instances'),
  scheduledTaskId: v.id('scheduled_tasks'),
  taskHistoryId: v.id('task_history'), // Link to the general task execution
  templateId: v.string(),

  // Template-specific structured results
  findings: v.array(v.object({
    id: v.string(), // Unique identifier for this finding
    type: v.string(), // e.g., "email", "meeting", "document", "issue"
    title: v.string(),
    description: v.string(),
    source: v.optional(v.object({
      platform: v.string(), // "gmail", "calendar", "linear", etc.
      id: v.optional(v.string()), // Platform-specific ID
      url: v.optional(v.string()), // Direct link to item
    })),
    metadata: v.optional(v.record(v.string(), v.any())), // Flexible metadata
    priority: v.union(
      v.literal('high'),
      v.literal('medium'),
      v.literal('low')
    ),
    actionItems: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
  })),

  // Overall summary and insights
  summary: v.string(),
  insights: v.optional(v.array(v.string())),
  recommendations: v.optional(v.array(v.string())),

  // Metrics
  totalFindings: v.number(),
  findingsByPriority: v.object({
    high: v.number(),
    medium: v.number(),
    low: v.number(),
  }),

  // Execution metadata
  executionTime: v.number(), // Duration in milliseconds
  connectors: v.array(v.string()), // Which connectors were used
  modelUsed: v.optional(v.string()),
  tokenUsage: v.optional(v.object({
    input: v.number(),
    output: v.number(),
    total: v.number(),
  })),

  createdAt: v.number(),

  // Status tracking
  status: v.union(
    v.literal('success'),
    v.literal('partial'), // Some connectors failed
    v.literal('failed')
  ),
  errors: v.optional(v.array(v.string())),
  warnings: v.optional(v.array(v.string())),
});