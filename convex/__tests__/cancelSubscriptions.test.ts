import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { cancelBillableSubscriptions } from "../stripe";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn<
    (id: string, params: unknown, options: { idempotencyKey: string }) => Promise<void>
  >(async () => undefined),
  retrieve: vi.fn<(id: string) => Promise<unknown>>(async (id) => ({
    id,
    customer: "cus_1",
    status: "canceled",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: {},
    items: { data: [{ current_period_end: 100, quantity: 1, price: { id: "price_1" } }] },
  })),
}));

vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel: mocks.cancel, retrieve: mocks.retrieve };
  },
}));

vi.mock("@convex-dev/stripe", () => ({
  processEvent: vi.fn<() => Promise<void>>(),
  StripeSubscriptions: class {},
}));

vi.mock("../_generated/server", () => ({
  action: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:deleted" as Id<"users">;

function ctxWithSubscriptions(
  subscriptions: Array<{ stripeSubscriptionId: string; status: string }>,
) {
  return {
    runQuery: vi.fn<() => Promise<typeof subscriptions>>(async () => subscriptions),
    // reserveSubscriptionSync returns revision 1; applySubscriptionSnapshot reports applied
    runMutation: vi.fn<(fn: unknown, args: Record<string, unknown>) => Promise<number | boolean>>(
      async (_fn, args) => ("revision" in args ? true : 1),
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("cancelBillableSubscriptions", () => {
  it("immediately cancels and re-syncs every subscription that can still bill", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    const ctx = ctxWithSubscriptions([
      { stripeSubscriptionId: "sub_active", status: "active" },
      { stripeSubscriptionId: "sub_past_due", status: "past_due" },
      { stripeSubscriptionId: "sub_canceled", status: "canceled" },
      { stripeSubscriptionId: "sub_expired", status: "incomplete_expired" },
    ]);

    await cancelBillableSubscriptions(ctx as unknown as ActionCtx, USER_ID);

    expect(mocks.cancel.mock.calls).toEqual([
      ["sub_active", undefined, { idempotencyKey: "account-deletion-cancel-sub_active" }],
      ["sub_past_due", undefined, { idempotencyKey: "account-deletion-cancel-sub_past_due" }],
    ]);
    // Each cancellation is stored through the revision-guarded sync
    expect(mocks.retrieve.mock.calls.map(([id]) => id)).toEqual(["sub_active", "sub_past_due"]);
    expect(ctx.runMutation).toHaveBeenCalledTimes(4);
  });

  it("does nothing (and needs no Stripe key) when no subscription can bill", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const ctx = ctxWithSubscriptions([
      { stripeSubscriptionId: "sub_canceled", status: "canceled" },
    ]);

    await cancelBillableSubscriptions(ctx as unknown as ActionCtx, USER_ID);

    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
