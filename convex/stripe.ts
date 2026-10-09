import { getAuthUserId } from "@convex-dev/auth/server";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { ERROR_CODES } from "../src/lib/error-codes";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx, type QueryCtx } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe);

// Stripe statuses that grant premium access
const PREMIUM_STATUSES = new Set(["active", "trialing"]);
// Statuses of a subscription that can still bill or be recovered in the portal; a new checkout
// would create a second billable subscription
const CHECKOUT_BLOCKING_STATUSES = new Set([...PREMIUM_STATUSES, "past_due", "unpaid", "paused"]);

const siteUrl = () => process.env.SITE_URL || "https://oschat.ai";

type RunQueryCtx = Pick<QueryCtx, "runQuery"> | Pick<ActionCtx, "runQuery">;

async function hasSubscriptionWithStatus(
  ctx: RunQueryCtx,
  userId: Id<"users">,
  statuses: Set<string>,
): Promise<boolean> {
  const subscriptions = await ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
    userId,
  });
  return subscriptions.some((subscription) => statuses.has(subscription.status));
}

/**
 * Whether the user has a premium subscription, based on the Stripe component's
 * webhook-synced subscriptions table. Usable from queries, mutations and actions.
 */
export function hasActivePremium(ctx: RunQueryCtx, userId: Id<"users">): Promise<boolean> {
  return hasSubscriptionWithStatus(ctx, userId, PREMIUM_STATUSES);
}

/**
 * Re-reads a subscription from Stripe and stores its current state. Stripe doesn't guarantee
 * webhook order and the component applies each event's snapshot as-is, so this runs after every
 * subscription event to stop an older snapshot (e.g. "active" delivered after "canceled") winning.
 */
export async function syncSubscriptionFromStripe(
  ctx: Pick<ActionCtx, "runMutation">,
  stripeSubscriptionId: string,
): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set; cannot sync subscription from Stripe");
  }
  const subscription = await new Stripe(secretKey).subscriptions.retrieve(stripeSubscriptionId);
  const item = subscription.items.data[0];
  await ctx.runMutation(components.stripe.private.handleSubscriptionUpdated, {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    status: subscription.status,
    currentPeriodEnd: item?.current_period_end ?? 0,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at ?? undefined,
    quantity: item?.quantity ?? 1,
    priceId: item?.price.id,
    metadata: subscription.metadata,
  });
}

// Invoice reasons that start a new billing period (not proration or manual invoices)
const NEW_PERIOD_BILLING_REASONS = new Set<Stripe.Invoice.BillingReason>([
  "subscription_create",
  "subscription_cycle",
]);

/**
 * The user whose credits a paid invoice should reset, or null if the invoice doesn't start a
 * new billing period or isn't linked to a user.
 */
export function getCreditResetUserId(invoice: Stripe.Invoice): string | null {
  if (!invoice.billing_reason || !NEW_PERIOD_BILLING_REASONS.has(invoice.billing_reason)) {
    return null;
  }
  return invoice.parent?.subscription_details?.metadata?.userId ?? null;
}

/**
 * Returns the Stripe customer linked to this user, creating one if needed. Looks up strictly by
 * userId (unlike the component's getOrCreateCustomer, which can reuse an email match from a
 * deleted account that the portal lookup would then never find).
 */
export async function getOrCreateCustomerId(
  ctx: ActionCtx,
  user: { _id: Id<"users">; email: string; name: string },
): Promise<string> {
  const existing = await ctx.runQuery(components.stripe.public.getCustomerByUserId, {
    userId: user._id,
  });
  if (existing) {
    return existing.stripeCustomerId;
  }
  const { customerId } = await stripeClient.createCustomer(ctx, {
    email: user.email,
    name: user.name,
    metadata: { userId: user._id },
    idempotencyKey: user._id,
  });
  return customerId;
}

/** Creates a hosted Stripe Checkout session for the premium plan and returns its URL. */
export const createCheckout = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.email || user.isAnonymous) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    // Server-side guard so a stale UI or direct call can't start a second subscription
    if (await hasSubscriptionWithStatus(ctx, user._id, CHECKOUT_BLOCKING_STATUSES)) {
      throw new ConvexError(ERROR_CODES.ALREADY_SUBSCRIBED);
    }

    const customerId = await getOrCreateCustomerId(ctx, {
      _id: user._id,
      email: user.email,
      name: user.preferredName || user.name || "User",
    });
    const { url } = await stripeClient.createCheckoutSession(ctx, {
      priceId,
      customerId,
      mode: "subscription",
      successUrl: `${siteUrl()}/settings?upgraded=true`,
      cancelUrl: `${siteUrl()}/settings`,
      // Webhooks use this to link the subscription and its invoices to the user
      subscriptionMetadata: { userId: user._id },
      // Stripe Managed Payments: Stripe is merchant of record and handles tax, fraud and disputes.
      // Tax is added on top of the price (the price's tax behavior is exclusive).
      params: { managed_payments: { enabled: true }, allow_promotion_codes: true },
    });
    if (!url) {
      throw new ConvexError(ERROR_CODES.UNSUPPORTED_OPERATION);
    }
    return { url };
  },
});

/** Creates a Stripe Customer Portal session so the user can manage billing. */
export const createPortalSession = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const customer = await ctx.runQuery(components.stripe.public.getCustomerByUserId, { userId });
    if (!customer) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }
    return await stripeClient.createCustomerPortalSession(ctx, {
      customerId: customer.stripeCustomerId,
      returnUrl: `${siteUrl()}/settings`,
    });
  },
});
