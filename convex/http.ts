import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { auth } from "./auth";
import { getCreditResetUserId, syncSubscriptionFromStripe } from "./stripe";

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe webhook at /stripe/webhook; the component syncs customers, subscriptions and invoices.
// Custom handlers run after the component's default processing.
registerRoutes(http, components.stripe, {
  events: {
    // Overwrite the event snapshot with Stripe's current state (events can arrive out of order)
    "customer.subscription.created": (ctx, event) =>
      syncSubscriptionFromStripe(ctx, event.data.object.id),
    "customer.subscription.updated": (ctx, event) =>
      syncSubscriptionFromStripe(ctx, event.data.object.id),
    "customer.subscription.deleted": (ctx, event) =>
      syncSubscriptionFromStripe(ctx, event.data.object.id),
    // A paid invoice for a new billing period resets the user's credits
    "invoice.paid": async (ctx, event) => {
      const userId = getCreditResetUserId(event.data.object);
      if (userId) {
        await ctx.runMutation(internal.subscription.onInvoicePaid, { userId });
      }
    },
  },
});

export default http;
