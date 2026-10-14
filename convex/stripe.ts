import { getAuthUserId } from "@convex-dev/auth/server";
import { processEvent, StripeSubscriptions } from "@convex-dev/stripe";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { ERROR_CODES } from "../src/lib/error-codes";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx, type QueryCtx } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe);

// Stripe statuses that grant premium access
const PREMIUM_STATUSES = new Set(["active", "trialing"]);
// Statuses of a subscription that can still bill or be recovered in the portal; a new checkout
// would create a second billable subscription
const CHECKOUT_BLOCKING_STATUSES = new Set([...PREMIUM_STATUSES, "past_due", "unpaid", "paused"]);

const siteUrl = () => process.env.SITE_URL || "https://oschat.ai";

/** Stripe API client from STRIPE_SECRET_KEY; throws (so webhooks get retried) when unset. */
export function stripeApi(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(secretKey);
}

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
 * webhook order, so event snapshots are never stored directly; each read reserves a revision
 * first, so an older read can't overwrite a newer one.
 */
export async function syncSubscriptionFromStripe(
  ctx: Pick<ActionCtx, "runMutation">,
  stripe: Stripe,
  stripeSubscriptionId: string,
): Promise<void> {
  const revision: number = await ctx.runMutation(internal.subscription.reserveSubscriptionSync, {
    stripeSubscriptionId,
  });
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const item = subscription.items.data[0];
  await ctx.runMutation(internal.subscription.applySubscriptionSnapshot, {
    revision,
    snapshot: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      status: subscription.status,
      currentPeriodEnd: item?.current_period_end ?? 0,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at ?? undefined,
      quantity: item?.quantity ?? 1,
      priceId: item?.price.id,
      metadata: subscription.metadata,
    },
  });
}

// Statuses after which a subscription can never bill again
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Immediately cancels every subscription of the user that can still bill, and stores the new
 * state. Used on account deletion; the Stripe and billing records themselves are kept.
 *
 * Subscriptions are read from Stripe through the user's customer (its row survives deletion), so
 * one whose webhook hasn't been synced yet is canceled too. The customer's open checkouts are
 * expired first, so none can be paid into a new subscription afterwards. Subscriptions synced
 * for the user without a customer row come from the component's table. Safe to retry; every
 * step is attempted, then an AggregateError is thrown if any failed.
 */
export async function cancelBillableSubscriptions(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  userId: Id<"users">,
): Promise<void> {
  const [customer, synced] = await Promise.all([
    ctx.runQuery(components.stripe.public.getCustomerByUserId, { userId }),
    ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, { userId }),
  ]);
  const billable = new Set(
    synced
      .filter((subscription) => !ENDED_STATUSES.has(subscription.status))
      .map((subscription) => subscription.stripeSubscriptionId),
  );
  if (!customer && billable.size === 0) {
    return;
  }
  const stripe = stripeApi();
  const failures: unknown[] = [];
  const attempt = async (step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  };

  if (customer) {
    const { stripeCustomerId } = customer;
    // Expired before subscriptions are listed: a checkout paid before its expiry shows up in the
    // list, and none can be paid after it
    await attempt(async () => {
      for await (const session of stripe.checkout.sessions.list({
        customer: stripeCustomerId,
        status: "open",
      })) {
        await stripe.checkout.sessions.expire(session.id);
      }
    });
    await attempt(async () => {
      for await (const subscription of stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
      })) {
        if (!ENDED_STATUSES.has(subscription.status)) {
          billable.add(subscription.id);
        }
      }
    });
  }

  // Stripe's live status decides whether to cancel, so a retry after a failed sync doesn't
  // re-cancel an already canceled subscription (cancel is a DELETE, which ignores idempotency
  // keys).
  for (const stripeSubscriptionId of billable) {
    await attempt(async () => {
      const live = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (!ENDED_STATUSES.has(live.status)) {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      }
      await syncSubscriptionFromStripe(ctx, stripe, stripeSubscriptionId);
    });
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} billing step(s) failed`);
  }
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
 * Handles a verified Stripe webhook event. Subscription events re-read the subscription from
 * Stripe; everything else uses the component's default syncing, plus credit resets on paid
 * new-period invoices (once per invoice).
 */
export async function handleStripeEvent(
  ctx: ActionCtx,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscriptionFromStripe(ctx, stripe, event.data.object.id);
      return;
    case "invoice.paid": {
      await processEvent(ctx, components.stripe, event, stripe);
      const invoice = event.data.object;
      const userId = getCreditResetUserId(invoice);
      if (userId && invoice.id) {
        await ctx.runMutation(internal.subscription.onInvoicePaid, {
          userId,
          stripeInvoiceId: invoice.id,
        });
      }
      return;
    }
    default:
      await processEvent(ctx, components.stripe, event, stripe);
  }
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

async function createPortalUrl(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const customer = await ctx.runQuery(components.stripe.public.getCustomerByUserId, { userId });
  if (!customer) {
    throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
  }
  const { url } = await stripeClient.createCustomerPortalSession(ctx, {
    customerId: customer.stripeCustomerId,
    returnUrl: `${siteUrl()}/settings`,
  });
  return url;
}

/**
 * Returns where to send the user to upgrade: a hosted Stripe Checkout for the premium plan, an
 * already-open checkout of theirs, or the billing portal if they already have a subscription
 * (so a stale UI can't start a second one and past-due users can recover).
 */
export const createCheckout = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx): Promise<{ url: string }> => {
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }
    const user: Doc<"users"> | null = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.email || user.isAnonymous) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    if (await hasSubscriptionWithStatus(ctx, user._id, CHECKOUT_BLOCKING_STATUSES)) {
      return { url: await createPortalUrl(ctx, user._id) };
    }

    const customerId = await getOrCreateCustomerId(ctx, {
      _id: user._id,
      email: user.email,
      name: user.preferredName || user.name || "User",
    });
    // Reuse a checkout the user already has open instead of starting a parallel one
    const open = await stripeApi().checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 1,
    });
    const openUrl = open.data[0]?.url;
    if (openUrl) {
      return { url: openUrl };
    }

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
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    return { url: await createPortalUrl(ctx, userId) };
  },
});
