import { httpRouter } from "convex/server";
import type Stripe from "stripe";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { handleStripeEvent, stripeApi } from "./stripe";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe webhook: verify the signature, then sync via handleStripeEvent. Non-2xx responses make
// Stripe redeliver, so every handler is safe to run more than once.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set; Stripe webhook can't be verified");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    const stripe = stripeApi();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        await request.text(),
        signature,
        webhookSecret,
      );
    } catch (error) {
      // Log only the message: the error object can carry the raw (customer) payload
      console.error("Stripe webhook signature verification failed:", errorMessage(error));
      return new Response("Invalid Stripe signature", { status: 400 });
    }

    try {
      await handleStripeEvent(ctx, stripe, event);
    } catch (error) {
      console.error(`Failed to process Stripe event ${event.id} (${event.type}):`, error);
      return new Response("Error processing webhook", { status: 500 });
    }
    return Response.json({ received: true });
  }),
});

export default http;
