import { getFunctionAddress } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { cancelBillableSubscriptions } from "../stripe";

// Subscription status as Stripe reports it; unknown ids are active until canceled
const liveStatus = new Map<string, string>();

type Listed<T> = AsyncIterable<T>;

const mocks = vi.hoisted(() => ({
  cancel: vi.fn<(id: string) => Promise<void>>(),
  retrieve: vi.fn<(id: string) => Promise<unknown>>(),
  listSubscriptions:
    vi.fn<
      (params: { customer: string; status: string }) => Listed<{ id: string; status: string }>
    >(),
  listSessions: vi.fn<(params: { customer: string; status: string }) => Listed<{ id: string }>>(),
  expireSession: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      cancel: mocks.cancel,
      retrieve: mocks.retrieve,
      list: mocks.listSubscriptions,
    };
    checkout = { sessions: { list: mocks.listSessions, expire: mocks.expireSession } };
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

/** Auto-paginating Stripe list stand-in. */
async function* listOf<T>(items: T[]): AsyncGenerator<T> {
  yield* items;
}

/**
 * ctx answering the Stripe component's lookups: the user's customer row and the subscriptions
 * the webhook synced for them.
 */
function createCtx({
  customer = null,
  synced = [],
}: {
  customer?: { stripeCustomerId: string } | null;
  synced?: Array<{ stripeSubscriptionId: string; status: string }>;
}) {
  return {
    runQuery: vi.fn<(fn: unknown) => Promise<unknown>>(async (fn) =>
      getFunctionAddress(fn).reference?.endsWith("/getCustomerByUserId") ? customer : synced,
    ),
    // reserveSubscriptionSync returns revision 1; applySubscriptionSnapshot reports applied
    runMutation: vi.fn<(fn: unknown, args: Record<string, unknown>) => Promise<number | boolean>>(
      async (_fn, args) => ("revision" in args ? true : 1),
    ),
  };
}

const cancelFor = (ctx: ReturnType<typeof createCtx>) =>
  cancelBillableSubscriptions(ctx as unknown as ActionCtx, USER_ID);

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
  mocks.listSubscriptions.mockImplementation(() => listOf([]));
  mocks.listSessions.mockImplementation(() => listOf([]));
  mocks.expireSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("cancelBillableSubscriptions", () => {
  it("immediately cancels and re-syncs every subscription that can still bill", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    const ctx = createCtx({
      synced: [
        { stripeSubscriptionId: "sub_active", status: "active" },
        { stripeSubscriptionId: "sub_past_due", status: "past_due" },
        { stripeSubscriptionId: "sub_canceled", status: "canceled" },
        { stripeSubscriptionId: "sub_expired", status: "incomplete_expired" },
      ],
    });

    await cancelFor(ctx);

    expect(mocks.cancel.mock.calls).toEqual([["sub_active"], ["sub_past_due"]]);
    // Each cancellation is stored through the revision-guarded sync
    expect(ctx.runMutation).toHaveBeenCalledTimes(4);
    // Without a customer row there is nothing to look up in Stripe
    expect(mocks.listSessions).not.toHaveBeenCalled();
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it("expires open checkouts, then cancels subscriptions Stripe has that weren't synced", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.listSessions.mockImplementation(() => listOf([{ id: "cs_open" }]));
    // Paid after the deletion; its webhook hasn't arrived (or was dropped)
    mocks.listSubscriptions.mockImplementation(() =>
      listOf([
        { id: "sub_unsynced", status: "active" },
        { id: "sub_old", status: "canceled" },
      ]),
    );
    const ctx = createCtx({ customer: { stripeCustomerId: "cus_1" } });

    await cancelFor(ctx);

    expect(mocks.listSessions).toHaveBeenCalledWith({ customer: "cus_1", status: "open" });
    expect(mocks.expireSession.mock.calls).toEqual([["cs_open"]]);
    expect(mocks.listSubscriptions).toHaveBeenCalledWith({ customer: "cus_1", status: "all" });
    // Expired before listing, so a checkout can't turn into a subscription the list missed
    expect(mocks.expireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listSubscriptions.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.cancel.mock.calls).toEqual([["sub_unsynced"]]);
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("cancels a subscription found both in Stripe and the synced table once", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.listSubscriptions.mockImplementation(() =>
      listOf([{ id: "sub_both", status: "active" }]),
    );
    const ctx = createCtx({
      customer: { stripeCustomerId: "cus_1" },
      synced: [
        { stripeSubscriptionId: "sub_both", status: "active" },
        // Linked to the user by metadata, but billed to another customer
        { stripeSubscriptionId: "sub_other_customer", status: "trialing" },
      ],
    });

    await cancelFor(ctx);

    expect(mocks.cancel.mock.calls).toEqual([["sub_both"], ["sub_other_customer"]]);
  });

  it("doesn't re-cancel a subscription Stripe already shows as canceled", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    // Canceled by an earlier attempt whose sync failed, so the local copy is still active
    liveStatus.set("sub_active", "canceled");
    const ctx = createCtx({ synced: [{ stripeSubscriptionId: "sub_active", status: "active" }] });

    await cancelFor(ctx);

    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("attempts every subscription before reporting failures", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.cancel.mockRejectedValueOnce(new Error("stripe down"));
    const ctx = createCtx({
      synced: [
        { stripeSubscriptionId: "sub_a", status: "active" },
        { stripeSubscriptionId: "sub_b", status: "active" },
      ],
    });

    await expect(cancelFor(ctx)).rejects.toBeInstanceOf(AggregateError);
    expect(mocks.cancel.mock.calls.map(([id]) => id)).toEqual(["sub_a", "sub_b"]);
    expect(liveStatus.get("sub_b")).toBe("canceled");
  });

  it("still cancels subscriptions when a checkout can't be expired, then fails for a retry", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.listSessions.mockImplementation(() => listOf([{ id: "cs_just_paid" }]));
    mocks.expireSession.mockRejectedValueOnce(new Error("Checkout Session is not open"));
    mocks.listSubscriptions.mockImplementation(() =>
      listOf([{ id: "sub_from_checkout", status: "active" }]),
    );
    const ctx = createCtx({ customer: { stripeCustomerId: "cus_1" } });

    await expect(cancelFor(ctx)).rejects.toBeInstanceOf(AggregateError);
    expect(mocks.cancel.mock.calls).toEqual([["sub_from_checkout"]]);
  });

  it("does nothing (and needs no Stripe key) without a customer or billable subscription", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const ctx = createCtx({
      synced: [{ stripeSubscriptionId: "sub_canceled", status: "canceled" }],
    });

    await cancelFor(ctx);

    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.listSessions).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
