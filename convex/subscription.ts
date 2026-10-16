import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

async function getSubscriptionSync(
  ctx: MutationCtx,
  stripeSubscriptionId: string
) {
  return await ctx.db
    .query("stripe_subscription_syncs")
    .withIndex("by_stripe_subscription_id", (q) =>
      q.eq("stripeSubscriptionId", stripeSubscriptionId)
    )
    .unique();
}

/**
 * Reserves the next read revision for a subscription. Call before reading it from Stripe:
 * mutations on the same row are serialized, so a later reservation always reads Stripe later.
 */
export const reserveSubscriptionSync = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  returns: v.number(),
  handler: async (ctx, { stripeSubscriptionId }) => {
    const sync = await getSubscriptionSync(ctx, stripeSubscriptionId);
    if (!sync) {
      await ctx.db.insert("stripe_subscription_syncs", {
        stripeSubscriptionId,
        reservedRevision: 1,
        appliedRevision: 0,
      });
      return 1;
    }
    const revision = sync.reservedRevision + 1;
    await ctx.db.patch("stripe_subscription_syncs", sync._id, {
      reservedRevision: revision,
    });
    return revision;
  },
});

/**
 * Stores a subscription state read from Stripe under `revision`, unless a higher revision was
 * already applied. The highest reserved revision was read after the latest Stripe change, so
 * once it applies the stored state is current and no older read can replace it.
 */
export const applySubscriptionSnapshot = internalMutation({
  args: {
    revision: v.number(),
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
  handler: async (ctx, { revision, snapshot }) => {
    const sync = await getSubscriptionSync(ctx, snapshot.stripeSubscriptionId);
    if (!sync) {
      throw new Error(
        `No reserved sync for subscription ${snapshot.stripeSubscriptionId}`
      );
    }
    if (revision <= sync.appliedRevision) {
      return false;
    }
    await ctx.db.patch("stripe_subscription_syncs", sync._id, {
      appliedRevision: revision,
    });
    await ctx.runMutation(
      components.stripe.private.handleSubscriptionUpdated,
      snapshot
    );
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
    const user = normalizedUserId
      ? await ctx.db.get("users", normalizedUserId)
      : null;
    if (!user) {
      return null;
    }
    const alreadyReset = await ctx.db
      .query("stripe_credit_resets")
      .withIndex("by_stripe_invoice_id", (q) =>
        q.eq("stripeInvoiceId", stripeInvoiceId)
      )
      .unique();
    if (alreadyReset) {
      return null;
    }
    await ctx.db.insert("stripe_credit_resets", {
      stripeInvoiceId,
      userId: user._id,
    });
    await resetUserRateLimits(ctx, user._id, user.isAnonymous ?? false);
    return null;
  },
});

/**
 * Helper function to reset all rate limits for a user
 */
async function resetUserRateLimits(
  ctx: MutationCtx,
  userId: Id<"users">,
  isAnonymous: boolean
) {
  // Reset daily limits (for non-premium tracking)
  const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";

  // Run all rate limiter operations concurrently. Any failure must throw so the whole mutation
  // (including the invoice's reset marker) rolls back and Stripe redelivers the webhook.
  await Promise.all([
    rateLimiter.reset(ctx, dailyLimitName, { key: userId }),
    rateLimiter.limit(ctx, dailyLimitName, { key: userId, count: 0 }),
    rateLimiter.reset(ctx, "standardMonthly", { key: userId }),
    rateLimiter.limit(ctx, "standardMonthly", { key: userId, count: 0 }),
    rateLimiter.reset(ctx, "premiumMonthly", { key: userId }),
    rateLimiter.limit(ctx, "premiumMonthly", { key: userId, count: 0 }),
  ]);
}
