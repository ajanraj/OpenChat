import { v } from "convex/values";

// Last time each Stripe subscription was re-read from Stripe; older reads are discarded so
// out-of-order or concurrent webhook deliveries can't overwrite a newer state.
export const StripeSubscriptionSync = v.object({
  stripeSubscriptionId: v.string(),
  fetchedAt: v.number(),
});

// Paid invoices that already reset a user's credits, so webhook redeliveries don't reset twice.
export const StripeCreditReset = v.object({
  stripeInvoiceId: v.string(),
  userId: v.id("users"),
});
