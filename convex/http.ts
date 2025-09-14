import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { polar } from "./polar";

const http = httpRouter();

auth.addHttpRoutes(http);

// Register Polar webhook with subscription event callbacks
polar.registerRoutes(http, {
  onSubscriptionUpdated: async (ctx, event) => {
    // Only process active subscriptions
    if (event.data.status !== "active") {
      return;
    }

    // Extract user ID from customer metadata
    const userId = event.data.customer?.metadata?.userId;

    // Handle subscription updates, like cancellations or status changes
    await ctx.runMutation(internal.subscription.onSubscriptionUpdated, {
      directUserId: typeof userId === "string" ? userId : null,
    });
  },
});

export default http;
