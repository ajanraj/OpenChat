import { v } from 'convex/values';
import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { getComposioTools } from '@/lib/composio-server';

// Gmail agent for finding "waiting on" emails
export const executeGmailWaitingOnAgent = action({
  args: {
    userId: v.id('users'),
    templateInstanceId: v.id('template_instances'),
    scheduledTaskId: v.id('scheduled_tasks'),
    taskHistoryId: v.id('task_history'),
    prompt: v.string(),
    enabledConnectors: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    try {
      // Get Composio tools for Gmail
      const composioTools = await getComposioTools(args.userId, ['GMAIL']);

      if (!composioTools || Object.keys(composioTools).length === 0) {
        throw new Error('Gmail tools not available - please check your Gmail connection');
      }

      // Define the search patterns for "waiting on" emails
      const searchQueries = [
        'waiting on',
        'waiting for',
        'following up',
        'please let me know',
        'looking forward to hearing',
        'pending your response',
        'when you get a chance',
        'awaiting your reply',
        'any update on',
        'checking in on',
      ];

      const findings: any[] = [];
      const warnings: string[] = [];

      // Search for emails with each pattern
      for (const query of searchQueries) {
        try {
          // Use Gmail search tool to find emails with the pattern
          // Note: The exact tool name depends on the Composio Gmail integration
          const searchTool = Object.keys(composioTools).find(name =>
            name.toLowerCase().includes('search') && name.toLowerCase().includes('gmail')
          );

          if (!searchTool) {
            warnings.push(`No Gmail search tool found for pattern "${query}"`);
            continue;
          }

          const searchResult = await (composioTools as any)[searchTool]({
            query: `"${query}" in:sent after:${getDaysAgo(7)}`,
            maxResults: 20,
          });

          if (searchResult?.emails) {
            for (const email of searchResult.emails) {
              // Skip if we already have this email
              const existingFinding = findings.find(f => f.source?.id === email.id);
              if (existingFinding) continue;

              // Analyze the email content to determine if it's truly a "waiting on" situation
              const analysis = analyzeEmailForWaitingOn(email, query);

              if (analysis.isWaitingOn) {
                findings.push({
                  id: `email-${email.id}`,
                  type: 'email',
                  title: email.subject || 'No Subject',
                  description: analysis.description,
                  source: {
                    platform: 'gmail',
                    id: email.id,
                    url: email.webLink || undefined,
                  },
                  metadata: {
                    sender: email.from,
                    recipient: email.to?.[0],
                    date: email.date,
                    snippet: email.snippet,
                    threadId: email.threadId,
                    labels: email.labels,
                    pattern: query,
                  },
                  priority: analysis.priority,
                  actionItems: analysis.actionItems,
                  tags: ['email', 'follow-up', analysis.priority],
                });
              }
            }
          }
        } catch (error) {
          warnings.push(`Failed to search for "${query}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Sort findings by priority and date
      findings.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 0;
        const bPriority = priorityOrder[b.priority] || 0;

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // High priority first
        }

        // If same priority, sort by date (newest first)
        const aDate = new Date(a.metadata.date || 0).getTime();
        const bDate = new Date(b.metadata.date || 0).getTime();
        return bDate - aDate;
      });

      // Generate summary and insights
      const summary = generateSummary(findings);
      const insights = generateInsights(findings);
      const recommendations = generateRecommendations(findings);

      // Create a saveTemplateResult action that will be defined in templates.ts
      await ctx.runMutation(internal.templates.saveTemplateResult, {
        templateInstanceId: args.templateInstanceId,
        scheduledTaskId: args.scheduledTaskId,
        taskHistoryId: args.taskHistoryId,
        templateId: 'gmail-waiting-on-agent',
        findings,
        summary,
        insights,
        recommendations,
        executionTime: Date.now() - startTime,
        connectors: ['GMAIL'],
        status: findings.length > 0 ? 'success' : (warnings.length > 0 ? 'partial' : 'success'),
        warnings: warnings.length > 0 ? warnings : undefined,
      });

      return {
        success: true,
        findingsCount: findings.length,
        summary,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      // Save error result
      await ctx.runMutation(internal.templates.saveTemplateResult, {
        templateInstanceId: args.templateInstanceId,
        scheduledTaskId: args.scheduledTaskId,
        taskHistoryId: args.taskHistoryId,
        templateId: 'gmail-waiting-on-agent',
        findings: [],
        summary: 'Agent execution failed',
        executionTime: Date.now() - startTime,
        connectors: ['GMAIL'],
        status: 'failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });

      throw error;
    }
  },
});

// Helper function to get date string for N days ago
function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Analyze email content to determine if it's a waiting situation
function analyzeEmailForWaitingOn(email: any, pattern: string): {
  isWaitingOn: boolean;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionItems: string[];
} {
  const content = (email.body || email.snippet || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const daysOld = getDaysOld(email.date);

  // Check if this is truly a "waiting on" situation
  const waitingIndicators = [
    'waiting on',
    'waiting for',
    'pending',
    'following up',
    'any update',
    'checking in',
    'still waiting',
    'haven\'t heard',
  ];

  const hasWaitingIndicator = waitingIndicators.some(indicator =>
    content.includes(indicator) || subject.includes(indicator)
  );

  if (!hasWaitingIndicator) {
    return {
      isWaitingOn: false,
      description: '',
      priority: 'low',
      actionItems: [],
    };
  }

  // Determine priority based on content and age
  let priority: 'high' | 'medium' | 'low' = 'medium';

  // High priority indicators
  const highPriorityWords = ['urgent', 'asap', 'deadline', 'important', 'critical', 'emergency'];
  const hasHighPriority = highPriorityWords.some(word =>
    content.includes(word) || subject.includes(word)
  );

  if (hasHighPriority || daysOld >= 5) {
    priority = 'high';
  } else if (daysOld >= 2) {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  // Generate description
  const sender = email.from?.name || email.from?.email || 'Unknown sender';
  const ageText = daysOld === 0 ? 'today' :
                 daysOld === 1 ? 'yesterday' :
                 `${daysOld} days ago`;

  const description = `Email from ${sender} sent ${ageText}. ${email.snippet || 'No preview available.'}`;

  // Generate action items
  const actionItems = [
    `Follow up with ${sender}`,
  ];

  if (daysOld >= 3) {
    actionItems.push('Consider escalating or setting a deadline');
  }

  if (content.includes('meeting') || content.includes('call')) {
    actionItems.push('Schedule a follow-up meeting or call');
  }

  return {
    isWaitingOn: true,
    description,
    priority,
    actionItems,
  };
}

// Get the number of days old an email is
function getDaysOld(dateString: string): number {
  if (!dateString) return 0;

  const emailDate = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - emailDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

// Generate summary text
function generateSummary(findings: any[]): string {
  if (findings.length === 0) {
    return 'No "waiting on" emails found in your recent messages. You\'re all caught up!';
  }

  const priorityCounts = findings.reduce(
    (counts, finding) => {
      counts[finding.priority]++;
      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const parts = [];

  if (priorityCounts.high > 0) {
    parts.push(`${priorityCounts.high} high priority item${priorityCounts.high === 1 ? '' : 's'}`);
  }
  if (priorityCounts.medium > 0) {
    parts.push(`${priorityCounts.medium} medium priority item${priorityCounts.medium === 1 ? '' : 's'}`);
  }
  if (priorityCounts.low > 0) {
    parts.push(`${priorityCounts.low} low priority item${priorityCounts.low === 1 ? '' : 's'}`);
  }

  const summary = `Found ${findings.length} email${findings.length === 1 ? '' : 's'} requiring follow-up: ${parts.join(', ')}.`;

  return summary;
}

// Generate insights
function generateInsights(findings: any[]): string[] {
  const insights = [];

  if (findings.length === 0) {
    insights.push('Great job staying on top of your communications!');
    return insights;
  }

  const highPriorityCount = findings.filter(f => f.priority === 'high').length;
  const oldestDays = Math.max(...findings.map(f => getDaysOld(f.metadata.date)));

  if (highPriorityCount > 0) {
    insights.push(`${highPriorityCount} high priority items need immediate attention`);
  }

  if (oldestDays >= 7) {
    insights.push(`Some items are over a week old - consider prioritizing follow-ups`);
  } else if (oldestDays >= 3) {
    insights.push(`Several items are 3+ days old - good time for gentle follow-ups`);
  }

  const senderCounts: Record<string, number> = {};
  findings.forEach(finding => {
    const sender = finding.metadata.sender?.name || finding.metadata.sender?.email || 'Unknown';
    senderCounts[sender] = (senderCounts[sender] || 0) + 1;
  });

  const frequentSenders = Object.entries(senderCounts)
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a);

  if (frequentSenders.length > 0) {
    const [topSender, count] = frequentSenders[0];
    insights.push(`${topSender} appears in ${count} items - might be worth a comprehensive follow-up`);
  }

  return insights;
}

// Generate recommendations
function generateRecommendations(findings: any[]): string[] {
  const recommendations = [];

  if (findings.length === 0) {
    recommendations.push('Continue your excellent communication habits');
    return recommendations;
  }

  const highPriorityItems = findings.filter(f => f.priority === 'high');
  if (highPriorityItems.length > 0) {
    recommendations.push('Start with high priority items - these may be time-sensitive');
  }

  const oldItems = findings.filter(f => getDaysOld(f.metadata.date) >= 5);
  if (oldItems.length > 0) {
    recommendations.push('Address items over 5 days old to maintain professional relationships');
  }

  if (findings.length >= 5) {
    recommendations.push('Consider batching similar follow-ups to save time');
  }

  recommendations.push('Set calendar reminders for important follow-ups to prevent future delays');

  return recommendations;
}