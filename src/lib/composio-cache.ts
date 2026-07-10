import { Redis } from "@upstash/redis";

// Initialize Redis client using environment variables
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// Cache TTL values (in seconds)
const CACHE_TTL = {
  SESSION: 48 * 60 * 60,
} as const;

// Cache key prefixes
const CACHE_PREFIX = {
  SESSION: "composio:session:",
} as const;

const SESSION_STRATEGY = "router-meta-v1";

interface CachedComposioSession {
  sessionId: string;
  strategy: typeof SESSION_STRATEGY;
}

const createToolkitsCacheKey = (toolkitSlugs: string[]): string =>
  [...toolkitSlugs].sort().join(",");

const createSessionCacheKey = (userId: string, toolkitSlugs: string[]): string =>
  `${CACHE_PREFIX.SESSION}${userId}:${createToolkitsCacheKey(toolkitSlugs)}`;

const isCachedComposioSession = (value: unknown): value is CachedComposioSession =>
  typeof value === "object" &&
  value !== null &&
  "sessionId" in value &&
  typeof value.sessionId === "string" &&
  value.sessionId.length > 0 &&
  "strategy" in value &&
  value.strategy === SESSION_STRATEGY;

/**
 * Get cached Composio Tool Router session id from Redis.
 */
export async function getCachedSessionId(
  userId: string,
  toolkitSlugs: string[],
): Promise<string | null> {
  const cacheKey = createSessionCacheKey(userId, toolkitSlugs);
  const cached = await redis.json.get<unknown>(cacheKey, "$");

  if (!(cached && Array.isArray(cached)) || cached.length === 0) {
    return null;
  }

  const [record] = cached;
  return isCachedComposioSession(record) ? record.sessionId : null;
}

/**
 * Set Composio Tool Router session id in Redis cache.
 */
export async function setCachedSessionId(
  userId: string,
  toolkitSlugs: string[],
  sessionId: string,
): Promise<void> {
  try {
    const cacheKey = createSessionCacheKey(userId, toolkitSlugs);
    await redis.json.set(cacheKey, "$", { sessionId, strategy: SESSION_STRATEGY });
    await redis.expire(cacheKey, CACHE_TTL.SESSION);
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
    const pattern = `${CACHE_PREFIX.SESSION}${userId}:*`;
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
