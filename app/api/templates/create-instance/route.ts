import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { checkTemplatePrerequisites } from '@/lib/templates/prerequisites';
import { getTemplateById } from '@/lib/templates/registry';

const CreateInstanceSchema = z.object({
  templateId: z.string(),
  customizations: z.optional(z.object({
    title: z.optional(z.string()),
    prompt: z.optional(z.string()),
    schedule: z.optional(z.object({
      type: z.enum(['daily', 'weekly']),
      time: z.string(), // HH:MM format
      weekday: z.optional(z.number()), // 0-6 for weekly
    })),
    emailNotifications: z.optional(z.boolean()),
  })),
});

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { templateId, customizations } = CreateInstanceSchema.parse(body);

    // Verify template exists
    const template = getTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get user's connectors and check prerequisites
    const userConnectors = await fetchQuery(
      api.connectors.listUserConnectors,
      {},
      { token }
    );

    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);
    if (!prerequisites.canUse) {
      return NextResponse.json(
        {
          error: 'Prerequisites not met',
          missingConnectors: prerequisites.missingRequired
        },
        { status: 400 }
      );
    }

    // Get current user for timezone
    const user = await fetchQuery(api.users.getCurrentUser, {}, { token });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare task data with template defaults + customizations
    const taskTitle = customizations?.title || template.name;
    const taskPrompt = customizations?.prompt || template.defaultPrompt;
    const schedule = customizations?.schedule || template.defaultSchedule;
    const enableEmailNotifications = customizations?.emailNotifications ?? true;

    // Convert template schedule to task format
    const scheduleType = schedule.type;
    const scheduledTime = schedule.time;
    const timezone = user.timezone || 'UTC';

    // Get enabled connector slugs
    const enabledToolSlugs = prerequisites.availableRequired
      .concat(prerequisites.availableOptional)
      .map(connector => connector.toUpperCase());

    // Create scheduled task
    const scheduledTaskId = await fetchMutation(
      api.scheduled_tasks.createScheduledTask,
      {
        title: taskTitle,
        prompt: taskPrompt,
        scheduleType,
        scheduledTime,
        timezone,
        enableSearch: false, // Templates can override this in prompt
        enabledToolSlugs,
        emailNotifications: enableEmailNotifications,
      },
      { token }
    );

    // Create template instance record
    const templateInstanceId = await fetchMutation(
      api.templates.createTemplateInstance,
      {
        templateId,
        scheduledTaskId: scheduledTaskId as Id<'scheduled_tasks'>,
        customizations,
        templateMetadata: {
          name: template.name,
          description: template.description,
          category: template.category,
          requiredConnectors: template.requiredConnectors,
          optionalConnectors: template.optionalConnectors,
        },
      },
      { token }
    );

    return NextResponse.json({
      success: true,
      templateInstanceId,
      scheduledTaskId,
      message: 'Template instance created successfully',
    });
  } catch (error) {
    console.error('Template instance creation failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}