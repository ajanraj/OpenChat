import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

/**
 * Stores a subscription state read from Stripe at `fetchedAt`, unless a later read was already
 * stored. Runs as one transaction, so concurrent webhook deliveries apply in read order.
 */
export const applySubscriptionSnapshot = internalMutation({
  args: {
    fetchedAt: v.number(),
    snapshot: v.object({
      stripeSubscriptionId: v.string(),
      stripeCustomerId: v.string(),
      status: v.string(),
      currentPeriodEnd: v.number(),
      cancelAtPeriodEnd: v.boolean(),
      cancelAt: v.optional(v.number()),
      quantity: v.number(),
      priceId: v.optional(v.string()),
      metadata: v.record(v.string(), v.string()),
    }),
  },
  returns: v.boolean(),
  handler: async (ctx, { fetchedAt, snapshot }) => {
    const sync = await ctx.db
      .query("stripe_subscription_syncs")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", snapshot.stripeSubscriptionId),
      )
      .unique();
    if (sync && sync.fetchedAt >= fetchedAt) {
      return false;
    }
    if (sync) {
      await ctx.db.patch(sync._id, { fetchedAt });
    } else {
      await ctx.db.insert("stripe_subscription_syncs", {
        stripeSubscriptionId: snapshot.stripeSubscriptionId,
        fetchedAt,
      });
    }
    await ctx.runMutation(components.stripe.private.handleSubscriptionUpdated, snapshot);
    return true;
  },
});

/**
 * Handle Stripe invoice.paid webhook event: reset the user's credits for the new billing period,
 * at most once per invoice
 */
export const onInvoicePaid = internalMutation({
  args: {
    userId: v.string(),
    stripeInvoiceId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, stripeInvoiceId }) => {
    const normalizedUserId = ctx.db.normalizeId("users", userId);
    const user = normalizedUserId ? await ctx.db.get(normalizedUserId) : null;
    if (!user) {
      return null;
    }
    const alreadyReset = await ctx.db
      .query("stripe_credit_resets")
      .withIndex("by_stripe_invoice_id", (q) => q.eq("stripeInvoiceId", stripeInvoiceId))
      .unique();
    if (alreadyReset) {
      return null;
    }
    await ctx.db.insert("stripe_credit_resets", { stripeInvoiceId, userId: user._id });
    await resetUserRateLimits(ctx, user._id, user.isAnonymous ?? false);
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
