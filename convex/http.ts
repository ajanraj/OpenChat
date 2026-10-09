import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe webhook at /stripe/webhook; the component syncs customers, subscriptions and invoices
registerRoutes(http, components.stripe, {
  events: {
    // A paid invoice starts a new billing period, so reset the user's credits
    "invoice.paid": async (ctx, event) => {
      const userId = event.data.object.parent?.subscription_details?.metadata?.userId;
      if (!userId) {
        return;
      }
      await ctx.runMutation(internal.subscription.onInvoicePaid, { userId });
    },
  },
});

export default http;
