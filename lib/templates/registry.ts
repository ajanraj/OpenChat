import type { ConnectorType } from '../types';

export type TemplateSchedule = {
  type: 'daily' | 'weekly';
  time: string; // HH:MM format
  weekday?: number; // 0-6 for weekly, 0 = Sunday
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: 'productivity' | 'communication' | 'automation' | 'analysis';
  requiredConnectors: ConnectorType[];
  optionalConnectors?: ConnectorType[];
  defaultPrompt: string;
  defaultSchedule: TemplateSchedule;
  isActive: boolean;
  tags: string[];
  estimatedExecutionTime: string; // e.g., "2-3 minutes"
  icon: string; // Icon name or emoji
};

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  'gmail-waiting-on-agent': {
    id: 'gmail-waiting-on-agent',
    name: 'Gmail "Waiting On" Assistant',
    description: 'Daily review of Gmail to identify emails where you\'re waiting for responses',
    longDescription: 'This agent scans your Gmail inbox daily to find emails containing "waiting on", "follow up", or similar phrases that indicate you\'re expecting a response. It provides a clear summary of who you\'re waiting to hear from and helps you stay on top of important communications.',
    category: 'productivity',
    requiredConnectors: ['gmail'],
    optionalConnectors: ['googledocs'],
    defaultPrompt: `You are a Gmail assistant that helps identify emails where the user is waiting for responses.

Search through the user's Gmail for emails from the past 7 days that contain phrases like:
- "waiting on"
- "waiting for"
- "following up"
- "please let me know"
- "looking forward to hearing"
- "pending your response"
- "when you get a chance"

For each relevant email found:
1. Extract the sender's name and email
2. Identify what you're waiting for
3. Note the date of the last exchange
4. Assess urgency based on context and time elapsed
5. Suggest appropriate follow-up actions

Provide a structured summary with:
- Total emails requiring follow-up
- High priority items (urgent or time-sensitive)
- Medium priority items (business-related, 3+ days old)
- Low priority items (casual or recent)
- Suggested actions for each category

Be concise but thorough in your analysis.`,
    defaultSchedule: {
      type: 'daily',
      time: '09:00',
    },
    isActive: true,
    tags: ['email', 'follow-up', 'productivity', 'daily'],
    estimatedExecutionTime: '2-3 minutes',
    icon: '📧',
  },
  'content-publishing-agent': {
    id: 'content-publishing-agent',
    name: 'Content Publishing Assistant',
    description: 'Automatically schedules and publishes content from Google Docs to social platforms',
    longDescription: 'This agent monitors your Google Docs for content marked as "ready to publish" and automatically schedules it across your connected social media platforms. It can handle Twitter threads, LinkedIn posts, and more.',
    category: 'automation',
    requiredConnectors: ['googledocs'],
    optionalConnectors: ['twitter', 'linear'],
    defaultPrompt: `You are a content publishing assistant. Check Google Docs for documents tagged with "ready to publish" or in a specific "Publishing Queue" folder.

For each document:
1. Extract the content and any publishing instructions
2. Identify the target platform(s) mentioned
3. Check for optimal posting times
4. Format content appropriately for each platform
5. Schedule publication if authorized

Provide a summary of:
- Content pieces ready for publishing
- Publishing schedule recommendations
- Any formatting adjustments needed
- Success/failure status for scheduled posts`,
    defaultSchedule: {
      type: 'daily',
      time: '08:00',
    },
    isActive: true,
    tags: ['content', 'publishing', 'social-media', 'automation'],
    estimatedExecutionTime: '3-5 minutes',
    icon: '📝',
  },
  'meeting-prep-agent': {
    id: 'meeting-prep-agent',
    name: 'Meeting Preparation Assistant',
    description: 'Reviews upcoming meetings and prepares briefing documents',
    longDescription: 'This agent looks at your calendar for upcoming meetings, gathers relevant context from Gmail and Google Docs, and creates preparation briefs to help you be ready for important discussions.',
    category: 'productivity',
    requiredConnectors: ['googlecalendar'],
    optionalConnectors: ['gmail', 'googledocs', 'notion'],
    defaultPrompt: `You are a meeting preparation assistant. Review the user's calendar for meetings in the next 24-48 hours.

For each upcoming meeting:
1. Extract meeting details (attendees, agenda, location)
2. Search Gmail for related email threads
3. Look for relevant documents in Google Drive/Docs
4. Identify key topics and preparation needs
5. Create a brief summary with talking points

Provide:
- Meeting overview with attendees and objectives
- Key background information and context
- Suggested talking points or questions
- Action items from previous meetings (if found)
- Recommended preparation materials`,
    defaultSchedule: {
      type: 'daily',
      time: '18:00',
    },
    isActive: true,
    tags: ['meetings', 'calendar', 'preparation', 'productivity'],
    estimatedExecutionTime: '3-4 minutes',
    icon: '📅',
  },
  'project-status-agent': {
    id: 'project-status-agent',
    name: 'Project Status Reporter',
    description: 'Weekly roundup of project progress from Linear, GitHub, and other tools',
    longDescription: 'This agent compiles a comprehensive weekly report of your project progress by analyzing issues in Linear, pull requests in GitHub, and other connected project management tools.',
    category: 'analysis',
    requiredConnectors: ['linear'],
    optionalConnectors: ['github', 'slack', 'notion'],
    defaultPrompt: `You are a project status reporting assistant. Analyze project progress across connected tools.

Review:
1. Linear issues - completed, in progress, and blocked items
2. GitHub pull requests and commits (if connected)
3. Slack project channels for updates (if connected)
4. Notion project pages (if connected)

Provide a weekly status report with:
- Key accomplishments this week
- Current blockers and challenges
- Upcoming deliverables and deadlines
- Team velocity and progress trends
- Action items requiring attention`,
    defaultSchedule: {
      type: 'weekly',
      time: '17:00',
      weekday: 5, // Friday
    },
    isActive: true,
    tags: ['projects', 'status', 'reporting', 'weekly'],
    estimatedExecutionTime: '4-6 minutes',
    icon: '📊',
  },
};

export function getTemplateById(templateId: string): TemplateDefinition | null {
  return TEMPLATE_REGISTRY[templateId] || null;
}

export function getActiveTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(template => template.isActive);
}

export function getTemplatesByCategory(category: TemplateDefinition['category']): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(
    template => template.isActive && template.category === category
  );
}

export function getTemplatesByConnector(connectorType: ConnectorType): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(
    template =>
      template.isActive &&
      (template.requiredConnectors.includes(connectorType) ||
       template.optionalConnectors?.includes(connectorType))
  );
}