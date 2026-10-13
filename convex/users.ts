import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v, type Infer } from "convex/values";
import { ERROR_CODES } from "../src/lib/error-codes";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { assertServerSecret, ensureAuthenticated, getCurrentUserOrNull } from "./lib/auth_helper";
import { deleteAuthData, purgeRefreshTokensBatch, purgeUserDataBatch } from "./lib/cleanup_helper";
import * as credits from "./lib/credits";
import { hasActivePremium } from "./stripe";
import { rateLimiter } from "./rateLimiter";
import { User } from "./schema/user";

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      ...User.fields,
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get("users", userId);
  },
});

export const userHasPremium = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }

    try {
      return await hasActivePremium(ctx, userId);
    } catch {
      return false;
    }
  },
});

// Note: User initialization logic has been moved to convex/auth.ts
// in the createOrUpdateUser callback for better security and simplicity

// Note: storeCurrentUser mutation has been removed.
// User creation and initialization is now handled by the createOrUpdateUser
// callback in convex/auth.ts for better security and simplicity.

export const updateUserProfile = mutation({
  args: {
    updates: v.object({
      preferredModel: v.optional(v.string()),
      preferredName: v.optional(v.string()),
      occupation: v.optional(v.string()),
      traits: v.optional(v.string()),
      about: v.optional(v.string()),
      disabledModels: v.optional(v.array(v.string())),
      favoriteModels: v.optional(v.array(v.string())),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get("users", userId);
    if (!user) {
      return null;
    }

    // Apply the updates
    await ctx.db.patch("users", userId, { ...updates });

    return null;
  },
});

export const incrementStandardCredits = mutation({
  args: {
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { count }) => {
    const creditsToConsume = count ?? 1;

    if (!Number.isInteger(creditsToConsume) || creditsToConsume <= 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    if (!isPremium) {
      const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
      await rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: creditsToConsume,
        throws: true,
      });
    }

    await rateLimiter.limit(ctx, "standardMonthly", {
      key: userId,
      count: creditsToConsume,
      throws: true,
    });

    return null;
  },
});

// Pre-flight check used before creating a chat; charges nothing.
export const assertNotOverLimit = mutation({
  args: {
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { usesPremiumCredits }) => {
    const userId = await ensureAuthenticated(ctx);
    await credits.assertMessageCreditAvailable(ctx, userId, { usesPremiumCredits });
    return null;
  },
});

// Charges one message credit when /api/chat starts a platform-key generation and returns
// the charged bucket names for a refund. Throws DAILY/MONTHLY/PREMIUM_LIMIT_REACHED when
// the user is out of credits.
export const consumeMessageCredit = mutation({
  args: {
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.array(credits.creditBucketValidator),
  handler: async (ctx, { usesPremiumCredits }) => {
    const userId = await ensureAuthenticated(ctx);
    return await credits.consumeMessageCredit(ctx, userId, { usesPremiumCredits });
  },
});

// Refunds a consumeMessageCredit charge (the buckets it returned) when the generation itself
// failed. Server routes only: without SERVER_ROUTE_SECRET a user could mint credits for
// themselves.
export const refundMessageCredit = mutation({
  args: {
    serverSecret: v.string(),
    buckets: v.array(credits.creditBucketValidator),
  },
  returns: v.null(),
  handler: async (ctx, { serverSecret, buckets }) => {
    assertServerSecret(serverSecret);
    const userId = await ensureAuthenticated(ctx);
    await credits.refundMessageCredit(ctx, userId, buckets);
    return null;
  },
});

/**
 * Stored state of one fixed-window credit bucket. `ts` is the start of the window the
 * value was last written in (0 when the user never used the bucket). Clients project it
 * to the current time with calculateRateLimit (see src/lib/rate-limit-status.ts).
 */
const rateLimitBucket = v.object({
  value: v.number(),
  ts: v.number(),
  rate: v.number(),
  period: v.number(),
  capacity: v.number(),
});

async function getRateLimitBucket(
  ctx: QueryCtx,
  name: credits.CreditBucketName,
  userId: Id<"users">,
): Promise<Infer<typeof rateLimitBucket>> {
  const { value, ts, config } = await rateLimiter.getValue(ctx, name, { key: userId });
  return {
    value,
    ts,
    rate: config.rate,
    period: config.period,
    capacity: config.capacity ?? config.rate,
  };
}

// Raw credit buckets for the current user. Deliberately time-independent: remaining
// credits and reset times depend on "now", so clients derive them (a query reading
// the clock would serve stale values after a window rolls over).
export const getRateLimitStatus = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      isPremium: v.boolean(),
      daily: v.union(v.null(), rateLimitBucket),
      monthly: rateLimitBucket,
      premium: v.union(v.null(), rateLimitBucket),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return null;
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const dailyName = user.isAnonymous ? "anonymousDaily" : "authenticatedDaily";
    const [daily, monthly, premium] = await Promise.all([
      isPremium ? null : getRateLimitBucket(ctx, dailyName, user._id),
      getRateLimitBucket(ctx, "standardMonthly", user._id),
      isPremium ? getRateLimitBucket(ctx, "premiumMonthly", user._id) : null,
    ]);

    return { isPremium, daily, monthly, premium };
  },
});

// Note: mergeAnonymousToGoogleAccount mutation has been removed.
// The application no longer automatically merges anonymous accounts with Google accounts
// for security and simplicity. Users who sign in with Google will start with fresh accounts.

/**
 * Deletes the signed-in account. Auth accounts, sessions and the user record go right away, so no
 * device can sign back in to it or refresh its token; everything else (including the sessions'
 * refresh tokens) is purged in the background (purgeDeletedUserData), and open checkouts,
 * subscriptions that can still bill and Composio connected accounts are revoked
 * (account_deletion.revokeDeletedUserAccess). Stripe billing records are kept. Calling it again
 * after the user is gone is a no-op.
 */
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    if (!(await ctx.db.get("users", userId))) {
      return null;
    }

    const sessionIds = await deleteAuthData(ctx, userId);
    await ctx.db.delete("users", userId);
    await ctx.scheduler.runAfter(0, internal.users.purgeDeletedUserData, { userId, sessionIds });
    await ctx.scheduler.runAfter(0, internal.account_deletion.revokeDeletedUserAccess, { userId });
    return null;
  },
});

// A session token issued before the deletion stays valid for Convex Auth's default JWT lifetime
// (1 hour) and can still write rows, so the purge runs once more after it expires.
const FINAL_PURGE_DELAY_MS = 65 * 60 * 1000;

/**
 * Purges a deleted user's data one budget-bounded batch per run, rescheduling itself until
 * nothing is left, then once more (`final`) after the last session token expired. The refresh
 * tokens of the sessions deleteAccount removed (`sessionIds`) go first. If a run throws, re-run
 * it with the same args; it resumes where it stopped.
 */
export const purgeDeletedUserData = internalMutation({
  args: {
    userId: v.id("users"),
    sessionIds: v.optional(v.array(v.id("authSessions"))),
    final: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, sessionIds = [], final }): Promise<null> => {
    const pendingSessionIds = await purgeRefreshTokensBatch(ctx, sessionIds);
    if (pendingSessionIds.length > 0 || !(await purgeUserDataBatch(ctx, userId))) {
      await ctx.scheduler.runAfter(0, internal.users.purgeDeletedUserData, {
        userId,
        sessionIds: pendingSessionIds,
        final,
      });
    } else if (!final) {
      await ctx.scheduler.runAfter(FINAL_PURGE_DELAY_MS, internal.users.purgeDeletedUserData, {
        userId,
        final: true,
      });
    }
    return null;
  },
});

// Internal query to get user by ID
export const getUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      ...User.fields,
    }),
  ),
  handler: async (ctx, args) => await ctx.db.get("users", args.userId),
});

// Charges one message credit for a scheduled run before it generates (internal variant of
// consumeMessageCredit) and returns the charged bucket names. Also enforces subscription
// access with requiresPremium.
export const consumeMessageCreditInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
    requiresPremium: v.optional(v.boolean()),
  },
  returns: v.array(credits.creditBucketValidator),
  handler: async (ctx, { userId, ...options }) =>
    await credits.consumeMessageCredit(ctx, userId, options),
});

// Refunds a consumeMessageCreditInternal charge (the buckets it returned) when the scheduled
// generation failed.
export const refundMessageCreditInternal = internalMutation({
  args: {
    userId: v.id("users"),
    buckets: v.array(credits.creditBucketValidator),
  },
  returns: v.null(),
  handler: async (ctx, { userId, buckets }) => {
    await credits.refundMessageCredit(ctx, userId, buckets);
    return null;
  },
});

// Check-only access/limit gate for scheduled runs of models that skip rate limiting (charges
// nothing). Runs that use credits call consumeMessageCreditInternal instead.
export const assertNotOverLimitInternal = internalMutation({
  args: {
    userId: v.id("users"),
    requiresPremium: v.boolean(),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, ...options }) => {
    await credits.assertMessageCreditAvailable(ctx, userId, options);
    return null;
  },
});

export const incrementStandardCreditsInternal = internalMutation({
  args: {
    userId: v.id("users"),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, count }) => {
    const creditsToConsume = count ?? 1;

    if (!Number.isInteger(creditsToConsume) || creditsToConsume <= 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    if (!isPremium) {
      const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
      await rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: creditsToConsume,
        throws: true,
      });
    }

    await rateLimiter.limit(ctx, "standardMonthly", {
      key: userId,
      count: creditsToConsume,
      throws: true,
    });

    return null;
  },
});
