import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

/**
 * Handle Stripe invoice.paid webhook event: reset the user's credits for the new billing period
 */
export const onInvoicePaid = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const normalizedUserId = ctx.db.normalizeId("users", userId);
    const user = normalizedUserId ? await ctx.db.get(normalizedUserId) : null;
    if (user) {
      await resetUserRateLimits(ctx, user._id, user.isAnonymous ?? false);
    }
    return null;
  },
});

/**
 * Helper function to reset all rate limits for a user
 */
async function resetUserRateLimits(ctx: MutationCtx, userId: Id<"users">, isAnonymous: boolean) {
  // Reset daily limits (for non-premium tracking)
  const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";

  // Run all rate limiter operations concurrently
  const operations = [
    rateLimiter.reset(ctx, dailyLimitName, { key: userId }),
    rateLimiter.limit(ctx, dailyLimitName, { key: userId, count: 0 }),
    rateLimiter.reset(ctx, "standardMonthly", { key: userId }),
    rateLimiter.limit(ctx, "standardMonthly", { key: userId, count: 0 }),
    rateLimiter.reset(ctx, "premiumMonthly", { key: userId }),
    rateLimiter.limit(ctx, "premiumMonthly", { key: userId, count: 0 }),
  ];

  // Use Promise.allSettled to ensure all operations complete independently
  await Promise.allSettled(operations);
}
