import { v } from "convex/values";

// Per-subscription revision counter that orders reads from Stripe: a revision is reserved before
// each read, and a read only applies if no higher revision was applied first. This keeps
// out-of-order or concurrent webhook deliveries from overwriting a newer state.
export const StripeSubscriptionSync = v.object({
  stripeSubscriptionId: v.string(),
  reservedRevision: v.number(),
  appliedRevision: v.number(),
});

// Paid invoices that already reset a user's credits, so webhook redeliveries don't reset twice.
export const StripeCreditReset = v.object({
  stripeInvoiceId: v.string(),
  userId: v.id("users"),
});
