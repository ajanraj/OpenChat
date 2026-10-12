import { calculateRateLimit } from "@convex-dev/rate-limiter";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

/** Raw credit buckets returned by users.getRateLimitStatus for a signed-in user. */
export type RateLimitState = NonNullable<FunctionReturnType<typeof api.users.getRateLimitStatus>>;

type RateLimitBucket = RateLimitState["monthly"];

/** Credit usage at a point in time, as shown in the UI and checked before sending. */
export interface RateLimitStatus {
  isPremium: boolean;
  dailyCount: number;
  dailyLimit: number;
  dailyRemaining: number;
  monthlyCount: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  premiumCount: number;
  premiumLimit: number;
  premiumRemaining: number;
  /** Messages the user can still send with standard credits. */
  effectiveRemaining: number;
  dailyReset?: number;
  monthlyReset?: number;
  premiumReset?: number;
}

interface BucketStatus {
  limit: number;
  count: number;
  remaining: number;
  reset?: number;
}

const UNUSED_BUCKET: BucketStatus = { limit: 0, count: 0, remaining: 0 };

/**
 * Projects a stored fixed-window bucket to `now` with the rate limiter's own math, so
 * windows that ended since the last write count as refilled.
 */
function resolveBucket(bucket: RateLimitBucket, now: number): BucketStatus {
  const { value, ts } = calculateRateLimit(
    { value: bucket.value, ts: bucket.ts },
    { kind: "fixed window", rate: bucket.rate, period: bucket.period, capacity: bucket.capacity },
    // A client clock behind the server must not count back into an earlier window
    Math.max(now, bucket.ts),
  );
  const remaining = Math.max(0, Math.min(value, bucket.capacity));
  return {
    limit: bucket.capacity,
    count: bucket.capacity - remaining,
    remaining,
    // ts 0 means the bucket was never used, so it has no window to reset yet
    reset: bucket.ts === 0 ? undefined : ts + bucket.period,
  };
}

/** Derives credit usage at `now` (epoch ms) from the raw buckets. */
export function resolveRateLimitStatus(state: RateLimitState, now: number): RateLimitStatus {
  const daily = state.daily ? resolveBucket(state.daily, now) : UNUSED_BUCKET;
  const monthly = resolveBucket(state.monthly, now);
  const premium = state.premium ? resolveBucket(state.premium, now) : UNUSED_BUCKET;

  return {
    isPremium: state.isPremium,
    dailyCount: daily.count,
    dailyLimit: daily.limit,
    dailyRemaining: daily.remaining,
    monthlyCount: monthly.count,
    monthlyLimit: monthly.limit,
    monthlyRemaining: monthly.remaining,
    premiumCount: premium.count,
    premiumLimit: premium.limit,
    premiumRemaining: premium.remaining,
    effectiveRemaining: state.isPremium
      ? monthly.remaining
      : Math.min(daily.remaining, monthly.remaining),
    dailyReset: daily.reset,
    monthlyReset: monthly.reset,
    premiumReset: premium.reset,
  };
}

/** Earliest upcoming window reset, after which the status must be resolved again. */
export function getNextRateLimitReset(status: RateLimitStatus): number | undefined {
  const resets = [status.dailyReset, status.monthlyReset, status.premiumReset].filter(
    (reset): reset is number => reset !== undefined,
  );
  return resets.length > 0 ? Math.min(...resets) : undefined;
}
