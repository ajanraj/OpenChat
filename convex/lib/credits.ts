import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError, v, type Infer } from "convex/values";
import { ERROR_CODES, type ErrorCode } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimiter";
import { hasActivePremium } from "../stripe";

/**
 * Message credits for platform-key generations, backed by the rate limiter buckets
 * in convex/rateLimiter.ts (all fixed windows keyed by user id).
 *
 * A message draws one token from each bucket of getMessageCreditBuckets:
 * - premium user on a premium-credit model: premiumMonthly
 * - premium user otherwise: standardMonthly
 * - non-premium user: anonymousDaily or authenticatedDaily, plus standardMonthly
 *
 * Charge with consumeMessageCredit when a request starts and refund with
 * refundMessageCredit only when the generation itself fails, passing back the receipt
 * the charge returned.
 */

export const creditBucketValidator = v.union(
  v.literal("anonymousDaily"),
  v.literal("authenticatedDaily"),
  v.literal("standardMonthly"),
  v.literal("premiumMonthly"),
);

export type CreditBucketName = Infer<typeof creditBucketValidator>;

/** What a charge drew from: each bucket with the start of the window its token came from. */
export const creditReceiptValidator = v.array(
  v.object({ bucket: creditBucketValidator, windowStart: v.number() }),
);

export type CreditReceipt = Infer<typeof creditReceiptValidator>;

interface CreditBucket {
  name: CreditBucketName;
  /** Error thrown when this bucket has no tokens left. */
  limitReached: ErrorCode;
}

export interface MessageCreditOptions {
  /** The model bills premium credits (applies to premium users only). */
  usesPremiumCredits?: boolean;
  /** The model needs an active subscription; throws PREMIUM_MODEL_ACCESS_DENIED otherwise. */
  requiresPremium?: boolean;
}

async function getMessageCreditBuckets(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  { usesPremiumCredits, requiresPremium }: MessageCreditOptions,
): Promise<CreditBucket[]> {
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
  }

  const isPremium = await hasActivePremium(ctx, userId);
  if (requiresPremium && !isPremium) {
    throw new ConvexError(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
  }
  if (isPremium && usesPremiumCredits) {
    return [{ name: "premiumMonthly", limitReached: ERROR_CODES.PREMIUM_LIMIT_REACHED }];
  }

  const monthly: CreditBucket = {
    name: "standardMonthly",
    limitReached: ERROR_CODES.MONTHLY_LIMIT_REACHED,
  };
  if (isPremium) {
    return [monthly];
  }
  return [
    {
      name: user.isAnonymous ? "anonymousDaily" : "authenticatedDaily",
      limitReached: ERROR_CODES.DAILY_LIMIT_REACHED,
    },
    monthly,
  ];
}

async function assertBucketsHaveCredit(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  buckets: CreditBucket[],
): Promise<void> {
  for (const bucket of buckets) {
    const { ok } = await rateLimiter.check(ctx, bucket.name, { key: userId });
    if (!ok) {
      throw new ConvexError(bucket.limitReached);
    }
  }
}

/**
 * Throws DAILY/MONTHLY/PREMIUM_LIMIT_REACHED (or PREMIUM_MODEL_ACCESS_DENIED with
 * requiresPremium) when the user could not send a message right now. Charges nothing.
 */
export async function assertMessageCreditAvailable(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  options: MessageCreditOptions = {},
): Promise<void> {
  const buckets = await getMessageCreditBuckets(ctx, userId, options);
  await assertBucketsHaveCredit(ctx, userId, buckets);
}

/**
 * Charges one message credit and returns its refund receipt, throwing the same errors
 * as assertMessageCreditAvailable when the user is out of credits. Every bucket is
 * checked before any is charged, so a caller that catches the error never keeps a
 * partial charge. The writes join the calling mutation's transaction, so concurrent
 * requests serialize on the bucket documents and cannot spend the same credit twice.
 */
export async function consumeMessageCredit(
  ctx: MutationCtx,
  userId: Id<"users">,
  options: MessageCreditOptions = {},
): Promise<CreditReceipt> {
  const buckets = await getMessageCreditBuckets(ctx, userId, options);
  await assertBucketsHaveCredit(ctx, userId, buckets);
  const receipt: CreditReceipt = [];
  for (const { name } of buckets) {
    await rateLimiter.limit(ctx, name, { key: userId, throws: true });
    // The charge just wrote the bucket, so its stored ts is the start of the window charged
    const { ts } = await rateLimiter.getValue(ctx, name, { key: userId });
    receipt.push({ bucket: name, windowStart: ts });
  }
  return receipt;
}

/**
 * Returns a credit charged by consumeMessageCredit to exactly the buckets on its receipt,
 * whatever the user's subscription is now. Call it only when the generation itself
 * failed (provider or server error), never for user aborts or failed saves.
 * A negative count adds a token back, once per bucket. A bucket whose charged window has
 * since ended is skipped: that window's tokens are gone, and adding one now would grant
 * an extra credit in the new window.
 */
export async function refundMessageCredit(
  ctx: MutationCtx,
  userId: Id<"users">,
  receipt: CreditReceipt,
): Promise<void> {
  const now = Date.now();
  const windowStarts = new Map(receipt.map((entry) => [entry.bucket, entry.windowStart]));
  for (const [name, windowStart] of windowStarts) {
    const { value, ts, config } = await rateLimiter.getValue(ctx, name, { key: userId });
    if (calculateRateLimit({ value, ts }, config, now).ts !== windowStart) {
      continue;
    }
    await rateLimiter.limit(ctx, name, { key: userId, count: -1 });
  }
}
