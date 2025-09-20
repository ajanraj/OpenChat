import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

// Create a new template instance
export const createTemplateInstance = mutation({
  args: {
    templateId: v.string(),
    scheduledTaskId: v.id('scheduled_tasks'),
    customizations: v.optional(v.object({
      title: v.optional(v.string()),
      prompt: v.optional(v.string()),
      schedule: v.optional(v.object({
        type: v.union(v.literal('daily'), v.literal('weekly')),
        time: v.string(),
        weekday: v.optional(v.number()),
      })),
      emailNotifications: v.optional(v.boolean()),
    })),
    templateMetadata: v.object({
      name: v.string(),
      description: v.string(),
      category: v.string(),
      requiredConnectors: v.array(v.string()),
      optionalConnectors: v.optional(v.array(v.string())),
      version: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const now = Date.now();

    return await ctx.db.insert('template_instances', {
      userId,
      templateId: args.templateId,
      scheduledTaskId: args.scheduledTaskId,
      customizations: args.customizations,
      templateMetadata: args.templateMetadata,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    });
  },
});

// Get template instances for a user
export const getUserTemplateInstances = query({
  args: {
    status: v.optional(v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('archived')
    )),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    let query = ctx.db
      .query('template_instances')
      .withIndex('by_user', (q) => q.eq('userId', userId));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field('status'), args.status));
    }

    const instances = await query.collect();

    // Get associated scheduled tasks
    const instancesWithTasks = await Promise.all(
      instances.map(async (instance) => {
        const scheduledTask = await ctx.db.get(instance.scheduledTaskId);
        return {
          ...instance,
          scheduledTask,
        };
      })
    );

    return instancesWithTasks;
  },
});

// Get a specific template instance
export const getTemplateInstance = query({
  args: { instanceId: v.id('template_instances') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.userId !== userId) {
      return null;
    }

    const scheduledTask = await ctx.db.get(instance.scheduledTaskId);

    return {
      ...instance,
      scheduledTask,
    };
  },
});

// Update template instance status
export const updateTemplateInstanceStatus = mutation({
  args: {
    instanceId: v.id('template_instances'),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('archived')
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.userId !== userId) {
      throw new Error('Template instance not found');
    }

    // Update the instance status
    await ctx.db.patch(args.instanceId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    // Also update the associated scheduled task status
    const taskStatus = args.status === 'active' ? 'active' :
                      args.status === 'paused' ? 'paused' : 'archived';

    await ctx.db.patch(instance.scheduledTaskId, {
      status: taskStatus,
    });

    return { success: true };
  },
});

// Delete template instance
export const deleteTemplateInstance = mutation({
  args: { instanceId: v.id('template_instances') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.userId !== userId) {
      throw new Error('Template instance not found');
    }

    // Delete associated scheduled task
    await ctx.db.delete(instance.scheduledTaskId);

    // Delete template results
    const results = await ctx.db
      .query('template_results')
      .withIndex('by_template_instance', (q) =>
        q.eq('templateInstanceId', args.instanceId))
      .collect();

    for (const result of results) {
      await ctx.db.delete(result._id);
    }

    // Delete template instance
    await ctx.db.delete(args.instanceId);

    return { success: true };
  },
});

// Save template execution results
export const saveTemplateResult = mutation({
  args: {
    templateInstanceId: v.id('template_instances'),
    scheduledTaskId: v.id('scheduled_tasks'),
    taskHistoryId: v.id('task_history'),
    templateId: v.string(),
    findings: v.array(v.object({
      id: v.string(),
      type: v.string(),
      title: v.string(),
      description: v.string(),
      source: v.optional(v.object({
        platform: v.string(),
        id: v.optional(v.string()),
        url: v.optional(v.string()),
      })),
      metadata: v.optional(v.record(v.string(), v.any())),
      priority: v.union(
        v.literal('high'),
        v.literal('medium'),
        v.literal('low')
      ),
      actionItems: v.optional(v.array(v.string())),
      tags: v.optional(v.array(v.string())),
    })),
    summary: v.string(),
    insights: v.optional(v.array(v.string())),
    recommendations: v.optional(v.array(v.string())),
    executionTime: v.number(),
    connectors: v.array(v.string()),
    modelUsed: v.optional(v.string()),
    tokenUsage: v.optional(v.object({
      input: v.number(),
      output: v.number(),
      total: v.number(),
    })),
    status: v.union(
      v.literal('success'),
      v.literal('partial'),
      v.literal('failed')
    ),
    errors: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    // Verify template instance belongs to user
    const instance = await ctx.db.get(args.templateInstanceId);
    if (!instance || instance.userId !== userId) {
      throw new Error('Template instance not found');
    }

    // Calculate findings by priority
    const findingsByPriority = args.findings.reduce(
      (counts, finding) => {
        counts[finding.priority]++;
        return counts;
      },
      { high: 0, medium: 0, low: 0 }
    );

    return await ctx.db.insert('template_results', {
      userId,
      templateInstanceId: args.templateInstanceId,
      scheduledTaskId: args.scheduledTaskId,
      taskHistoryId: args.taskHistoryId,
      templateId: args.templateId,
      findings: args.findings,
      summary: args.summary,
      insights: args.insights,
      recommendations: args.recommendations,
      totalFindings: args.findings.length,
      findingsByPriority,
      executionTime: args.executionTime,
      connectors: args.connectors,
      modelUsed: args.modelUsed,
      tokenUsage: args.tokenUsage,
      createdAt: Date.now(),
      status: args.status,
      errors: args.errors,
      warnings: args.warnings,
    });
  },
});

// Get template results for a user
export const getTemplateResults = query({
  args: {
    templateInstanceId: v.optional(v.id('template_instances')),
    templateId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    let query = ctx.db
      .query('template_results')
      .withIndex('by_user', (q) => q.eq('userId', userId));

    if (args.templateInstanceId) {
      query = ctx.db
        .query('template_results')
        .withIndex('by_template_instance', (q) =>
          q.eq('templateInstanceId', args.templateInstanceId));
    } else if (args.templateId) {
      query = ctx.db
        .query('template_results')
        .withIndex('by_template', (q) =>
          q.eq('templateId', args.templateId));
    }

    const results = await query
      .order('desc')
      .take(args.limit || 50);

    return results;
  },
});

// Get template instance by scheduled task ID
export const getTemplateInstanceByTaskId = query({
  args: { scheduledTaskId: v.id('scheduled_tasks') },
  handler: async (ctx, args) => {
    const instance = await ctx.db
      .query('template_instances')
      .withIndex('by_scheduled_task', (q) =>
        q.eq('scheduledTaskId', args.scheduledTaskId))
      .first();

    return instance;
  },
});