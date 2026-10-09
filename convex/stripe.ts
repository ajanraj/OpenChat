import { getAuthUserId } from "@convex-dev/auth/server";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../src/lib/error-codes";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx, type QueryCtx } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe);

// Stripe statuses that grant premium access
const PREMIUM_STATUSES = new Set(["active", "trialing"]);

const siteUrl = () => process.env.SITE_URL || "https://oschat.ai";

/**
 * Whether the user has a premium subscription, based on the Stripe component's
 * webhook-synced subscriptions table. Usable from queries and mutations.
 */
export async function hasActivePremium(
  ctx: Pick<QueryCtx, "runQuery">,
  userId: Id<"users">,
): Promise<boolean> {
  const subscriptions = await ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
    userId,
  });
  return subscriptions.some((subscription) => PREMIUM_STATUSES.has(subscription.status));
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
      params: { managed_payments: { enabled: true } },
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
