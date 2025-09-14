import { Redis } from "@upstash/redis";
import type { Tool } from "ai";

// Initialize Redis client using environment variables
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// Cache TTL values (in seconds)
const CACHE_TTL = {
  CONVERTED_TOOLS: 48 * 60 * 60, // 48 hours for converted v5 tools
} as const;

// Cache key prefixes
const CACHE_PREFIX = {
  CONVERTED_TOOLS: "composio:converted:",
} as const;

// Note: We cannot cache raw tools because they contain non-serializable functions
// We'll only cache the converted tools which are serializable

/**
 * Get cached converted tools from Redis
 */
export async function getCachedConvertedTools(
  userId: string,
  toolkitSlugs: string[]
): Promise<Record<string, Tool> | null> {
  const sortedSlugs = toolkitSlugs.sort().join(",");
  const cacheKey = `${CACHE_PREFIX.CONVERTED_TOOLS}${userId}:${sortedSlugs}`;
  const cached = await redis.json.get(cacheKey, "$");

  if (!(cached && Array.isArray(cached)) || cached.length === 0) {
    return null;
  }

  return cached[0] as Record<string, Tool>;
}

/**
 * Set converted tools in Redis cache
 */
export async function setCachedConvertedTools(
  userId: string,
  toolkitSlugs: string[],
  tools: Record<string, Tool>
): Promise<void> {
  try {
    const sortedSlugs = toolkitSlugs.sort().join(",");
    const cacheKey = `${CACHE_PREFIX.CONVERTED_TOOLS}${userId}:${sortedSlugs}`;
    await redis.json.set(cacheKey, "$", tools);
    await redis.expire(cacheKey, CACHE_TTL.CONVERTED_TOOLS);
  } catch {
    // Silently fail - caching is optional
  }
}

/**
 * Invalidate tools cache for a user
 */
export async function invalidateUserToolsCache(userId: string): Promise<void> {
  try {
    // Find all tools cache keys for this user
    const pattern = `${CACHE_PREFIX.CONVERTED_TOOLS}${userId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Silently fail - cache invalidation is optional
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
