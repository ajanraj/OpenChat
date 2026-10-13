import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { cancelBillableSubscriptions } from "../stripe";

// Subscription status as Stripe reports it; unknown ids are active until canceled
const liveStatus = new Map<string, string>();

const mocks = vi.hoisted(() => ({
  cancel: vi.fn<(id: string) => Promise<void>>(),
  retrieve: vi.fn<(id: string) => Promise<unknown>>(),
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

beforeEach(() => {
  liveStatus.clear();
  mocks.cancel.mockImplementation(async (id) => {
    liveStatus.set(id, "canceled");
  });
  mocks.retrieve.mockImplementation(async (id) => ({
    id,
    customer: "cus_1",
    status: liveStatus.get(id) ?? "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: {},
    items: { data: [{ current_period_end: 100, quantity: 1, price: { id: "price_1" } }] },
  }));
});

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

    expect(mocks.cancel.mock.calls).toEqual([["sub_active"], ["sub_past_due"]]);
    // Each cancellation is stored through the revision-guarded sync
    expect(ctx.runMutation).toHaveBeenCalledTimes(4);
  });

  it("doesn't re-cancel a subscription Stripe already shows as canceled", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    // Canceled by an earlier attempt whose sync failed, so the local copy is still active
    liveStatus.set("sub_active", "canceled");
    const ctx = ctxWithSubscriptions([{ stripeSubscriptionId: "sub_active", status: "active" }]);

    await cancelBillableSubscriptions(ctx as unknown as ActionCtx, USER_ID);

    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("attempts every subscription before reporting failures", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.cancel.mockRejectedValueOnce(new Error("stripe down"));
    const ctx = ctxWithSubscriptions([
      { stripeSubscriptionId: "sub_a", status: "active" },
      { stripeSubscriptionId: "sub_b", status: "active" },
    ]);

    await expect(
      cancelBillableSubscriptions(ctx as unknown as ActionCtx, USER_ID),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(mocks.cancel.mock.calls.map(([id]) => id)).toEqual(["sub_a", "sub_b"]);
    expect(liveStatus.get("sub_b")).toBe("canceled");
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
