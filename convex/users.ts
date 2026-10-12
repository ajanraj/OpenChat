import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { ConvexError, v, type Infer } from "convex/values";
import { ERROR_CODES } from "../src/lib/error-codes";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { assertServerSecret, ensureAuthenticated, getCurrentUserOrNull } from "./lib/auth_helper";
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
    return await ctx.db.get(userId);
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
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    // Apply the updates
    await ctx.db.patch(userId, { ...updates });

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

    const user = await ctx.db.get(userId);
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

// Charges one message credit when /api/chat starts a platform-key generation.
// Throws DAILY/MONTHLY/PREMIUM_LIMIT_REACHED when the user is out of credits.
export const consumeMessageCredit = mutation({
  args: {
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { usesPremiumCredits }) => {
    const userId = await ensureAuthenticated(ctx);
    await credits.consumeMessageCredit(ctx, userId, { usesPremiumCredits });
    return null;
  },
});

// Refunds a consumeMessageCredit charge when the generation itself failed.
// Server routes only: without SERVER_ROUTE_SECRET a user could mint credits for themselves.
export const refundMessageCredit = mutation({
  args: {
    serverSecret: v.string(),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { serverSecret, usesPremiumCredits }) => {
    assertServerSecret(serverSecret);
    const userId = await ensureAuthenticated(ctx);
    await credits.refundMessageCredit(ctx, userId, { usesPremiumCredits });
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

// Delete account and all associated data
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // --- Step 1: Fetch all documents that need to be deleted in parallel ---
    const [
      attachments,
      messages,
      chats,
      feedback,
      usage,
      authAccounts,
      authSessions,
      profiles,
      scheduledTasks,
      connectors,
      apiKeys,
    ] = await Promise.all([
      ctx.db
        .query("chat_attachments")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("feedback")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("usage_history")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("scheduled_tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("connectors")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("user_api_keys")
        .withIndex("by_user_provider", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    // Fetch task history for each scheduled task (no userId index on task_history)
    const taskHistoryEntries = (
      await Promise.all(
        scheduledTasks.map((task) =>
          ctx.db
            .query("task_history")
            .withIndex("by_task_and_time", (q) => q.eq("taskId", task._id))
            .collect(),
        ),
      )
    ).flat();

    // --- Step 2: Collect all deletion promises and execute them concurrently ---
    const deletionPromises: Promise<unknown>[] = [];

    // Delete attachments and their files
    const r2 = new R2(components.r2);
    for (const att of attachments) {
      deletionPromises.push(
        r2.deleteObject(ctx, att.key).catch(() => {
          // Silently handle storage deletion errors
        }),
      );
      deletionPromises.push(
        ctx.db.delete(att._id).catch(() => {
          // Silently handle database deletion errors
        }),
      );
    }

    // Delete messages
    deletionPromises.push(...messages.map((msg) => ctx.db.delete(msg._id)));

    // Delete chats
    deletionPromises.push(...chats.map((chat) => ctx.db.delete(chat._id)));

    // Delete feedback
    deletionPromises.push(...feedback.map((f) => ctx.db.delete(f._id)));

    // Delete usage history
    deletionPromises.push(...usage.map((u) => ctx.db.delete(u._id)));

    // Delete auth accounts
    deletionPromises.push(...authAccounts.map((acc) => ctx.db.delete(acc._id)));

    // Delete auth sessions
    deletionPromises.push(...authSessions.map((sess) => ctx.db.delete(sess._id)));

    // Delete profiles
    deletionPromises.push(...profiles.map((p) => ctx.db.delete(p._id)));

    // Cancel active scheduled functions, then delete tasks + history
    for (const task of scheduledTasks) {
      if (task.scheduledFunctionId) {
        deletionPromises.push(
          ctx.scheduler
            .cancel(task.scheduledFunctionId as Id<"_scheduled_functions">)
            .catch(() => {}),
        );
      }
    }
    deletionPromises.push(...scheduledTasks.map((t) => ctx.db.delete(t._id)));
    deletionPromises.push(...taskHistoryEntries.map((h) => ctx.db.delete(h._id)));

    // Delete connectors
    deletionPromises.push(...connectors.map((c) => ctx.db.delete(c._id)));

    // Delete API keys
    deletionPromises.push(...apiKeys.map((k) => ctx.db.delete(k._id)));

    // Execute all deletions concurrently
    await Promise.allSettled(deletionPromises);

    // Finally delete user record
    await ctx.db.delete(userId);
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
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

// Charges one message credit for a scheduled run before it generates (internal variant of
// consumeMessageCredit). Also enforces subscription access with requiresPremium.
export const consumeMessageCreditInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
    requiresPremium: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, ...options }) => {
    await credits.consumeMessageCredit(ctx, userId, options);
    return null;
  },
});

// Refunds a consumeMessageCreditInternal charge when the scheduled generation failed.
export const refundMessageCreditInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, usesPremiumCredits }) => {
    await credits.refundMessageCredit(ctx, userId, { usesPremiumCredits });
    return null;
  },
});

// Legacy check-then-charge pair still used by scheduled_ai.ts. The check does not reserve
// the credit; move scheduled runs to consumeMessageCreditInternal (plus
// refundMessageCreditInternal on failure) and delete both.
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

export const incrementMessageCountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, usesPremiumCredits }) => {
    await credits.consumeMessageCredit(ctx, userId, { usesPremiumCredits });
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

    const user = await ctx.db.get(userId);
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
