import { tool } from "ai";
import type { Redis } from "@upstash/redis";
import type { ModelMessage, Tool } from "ai";
import { z } from "zod";

const HISTORY_PREFIX = "agent:history:";
const MEMORY_PREFIX = "agent:memory:";
const HISTORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MEMORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_WORKING_MEMORY_SIZE = 4096; // ~4KB cap

const WORKING_MEMORY_TEMPLATE = `# Working Memory

## Key Facts
- [Important information]

## Current Focus
- [What the user is working on]

## Preferences
- [User preferences and settings]
`;

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export class ScheduledAgentMemory {
  constructor(private redis: Redis) {}

  async loadHistory(taskId: string, limit: number): Promise<ModelMessage[]> {
    const raw = await this.redis.get<HistoryEntry[]>(`${HISTORY_PREFIX}${taskId}`);
    if (!raw) return [];
    const entries = raw.slice(-limit * 2); // limit is turns, each turn = 2 messages
    return entries.map((e) => ({
      role: e.role,
      content: e.content,
    }));
  }

  async saveHistory(taskId: string, userPrompt: string, assistantResponse: string): Promise<void> {
    const key = `${HISTORY_PREFIX}${taskId}`;
    const existing = (await this.redis.get<HistoryEntry[]>(key)) ?? [];
    existing.push(
      { role: "user", content: userPrompt },
      { role: "assistant", content: assistantResponse },
    );
    const trimmed = existing.slice(-40); // Keep last 40 entries (20 turns)
    await this.redis.set(key, trimmed, { ex: HISTORY_TTL_SECONDS });
  }

  async loadWorkingMemory(userId: string): Promise<string | null> {
    return this.redis.get<string>(`${MEMORY_PREFIX}${userId}`);
  }

  async saveWorkingMemory(userId: string, content: string): Promise<void> {
    const trimmed = content.trim().slice(0, MAX_WORKING_MEMORY_SIZE);
    await this.redis.set(`${MEMORY_PREFIX}${userId}`, trimmed, { ex: MEMORY_TTL_SECONDS });
  }

  createUpdateTool(userId: string): Tool {
    return tool({
      description:
        "Update your persistent working memory. Call this whenever you learn important facts, user preferences, context, or corrections that should persist across future task executions.",
      inputSchema: z.object({
        memory: z
          .string()
          .describe(
            "The full updated working memory content in markdown format. Always include ALL existing facts plus any new information — this replaces the entire memory.",
          ),
      }),
      execute: async ({ memory }) => {
        await this.saveWorkingMemory(userId, memory);
        return "Working memory updated successfully.";
      },
    });
  }
}

export function formatWorkingMemoryPrompt(workingMemory: string | null): string {
  const memoryContent = workingMemory ?? WORKING_MEMORY_TEMPLATE;

  return `
## Working Memory

You have access to persistent working memory that stores user preferences, context, and important facts across task executions.

**ALWAYS call updateWorkingMemory when:**
- You learn new facts about the user, their tasks, or preferences
- The user corrects previous information
- Important context changes that should persist for future executions
- You complete a task and want to remember the outcome

**Current working memory:**
${memoryContent}

**Template structure to follow:**
\`\`\`
${WORKING_MEMORY_TEMPLATE}
\`\`\`
`.trim();
}
