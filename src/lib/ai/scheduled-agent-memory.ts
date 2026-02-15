import type { Redis } from "@upstash/redis";
import type { ModelMessage } from "ai";

const HISTORY_PREFIX = "agent:history:";
const MEMORY_PREFIX = "agent:memory:";
const WORKING_MEMORY_TAG = /<working_memory>([\s\S]*?)<\/working_memory>/;
const HISTORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MEMORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_WORKING_MEMORY_SIZE = 4096; // ~4KB cap

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

  async saveWorkingMemory(userId: string, responseText: string): Promise<void> {
    const match = WORKING_MEMORY_TAG.exec(responseText);
    if (match?.[1]) {
      const memory = match[1].trim().slice(0, MAX_WORKING_MEMORY_SIZE);
      await this.redis.set(`${MEMORY_PREFIX}${userId}`, memory, { ex: MEMORY_TTL_SECONDS });
    }
  }
}

export function stripWorkingMemoryTags(text: string): string {
  return text.replace(/<working_memory>[\s\S]*?<\/working_memory>/g, "").trim();
}
