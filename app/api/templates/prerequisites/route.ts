import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/convex/_generated/api';
import { checkTemplatePrerequisites } from '@/lib/templates/prerequisites';
import { getTemplateById } from '@/lib/templates/registry';

const PrerequisiteCheckSchema = z.object({
  templateId: z.string(),
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
    const { templateId } = PrerequisiteCheckSchema.parse(body);

    // Verify template exists
    const template = getTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get user's connectors
    const userConnectors = await fetchQuery(
      api.connectors.listUserConnectors,
      {},
      { token }
    );

    // Check prerequisites
    const prerequisites = checkTemplatePrerequisites(templateId, userConnectors);

    return NextResponse.json({
      success: true,
      prerequisites,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        requiredConnectors: template.requiredConnectors,
        optionalConnectors: template.optionalConnectors,
      },
    });
  } catch (error) {
    console.error('Prerequisites check failed:', error);

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