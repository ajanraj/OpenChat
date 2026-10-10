import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import {
  createCheckout,
  getCreditResetUserId,
  getOrCreateCustomerId,
  handleStripeEvent,
  hasActivePremium,
  syncSubscriptionFromStripe,
} from "../stripe";
import { applySubscriptionSnapshot, onInvoicePaid } from "../subscription";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn<() => Promise<{ customerId: string }>>(async () => ({
    customerId: "cus_new",
  })),
  createCheckoutSession: vi.fn<() => Promise<{ sessionId: string; url: string | null }>>(
    async () => ({ sessionId: "cs_new", url: "https://checkout.stripe.com/new" }),
  ),
  createCustomerPortalSession: vi.fn<() => Promise<{ url: string }>>(async () => ({
    url: "https://billing.stripe.com/portal",
  })),
  processEvent: vi.fn<() => Promise<void>>(async () => undefined),
  retrieveSubscription: vi.fn<(id: string) => Promise<unknown>>(),
  listCheckoutSessions: vi.fn<() => Promise<{ data: Array<{ url: string | null }> }>>(async () => ({
    data: [],
  })),
  rateLimiterReset: vi.fn<(ctx: unknown, name: string, options: { key: string }) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    reset: mocks.rateLimiterReset,
    limit: vi.fn<() => Promise<void>>(async () => undefined),
  },
}));

vi.mock("stripe", () => ({
  default: class {
    subscriptions = { retrieve: mocks.retrieveSubscription };
    checkout = { sessions: { list: mocks.listCheckoutSessions } };
  },
}));

vi.mock("@convex-dev/stripe", () => ({
  processEvent: mocks.processEvent,
  StripeSubscriptions: class {
    createCustomer = mocks.createCustomer;
    createCheckoutSession = mocks.createCheckoutSession;
    createCustomerPortalSession = mocks.createCustomerPortalSession;
  },
}));

vi.mock("../_generated/server", () => ({
  action: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:user1" as Id<"users">;

type Row = Record<string, unknown> & { _id: string; _table: string };

/** Minimal in-memory ctx.db supporting the index lookups our billing mutations use. */
function fakeDb(user: { _id: Id<"users">; isAnonymous: boolean } | null = null) {
  const rows: Row[] = [];
  return {
    rows,
    normalizeId: (_table: string, id: string) => (user && id === user._id ? id : null),
    get: async () => user,
    query: (table: string) => ({
      withIndex: (_index: string, build: (q: { eq: (f: string, v: unknown) => void }) => void) => {
        let field = "";
        let value: unknown;
        build({
          eq: (f, v) => {
            field = f;
            value = v;
          },
        });
        return {
          unique: async () => rows.find((r) => r._table === table && r[field] === value) ?? null,
        };
      },
    }),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${rows.length}`;
      rows.push({ ...doc, _id, _table: table });
      return _id;
    },
    patch: async (id: string, fields: Record<string, unknown>) => {
      Object.assign(rows.find((r) => r._id === id) ?? {}, fields);
    },
  };
}

describe("getOrCreateCustomerId", () => {
  const user = { _id: USER_ID, email: "a@example.com", name: "A" };
  const ctxWithCustomer = (customer: { stripeCustomerId: string } | null) =>
    ({
      runQuery: vi.fn<() => Promise<typeof customer>>(async () => customer),
    }) as unknown as ActionCtx;

  it("reuses the customer linked to this user", async () => {
    mocks.createCustomer.mockClear();
    expect(
      await getOrCreateCustomerId(ctxWithCustomer({ stripeCustomerId: "cus_old" }), user),
    ).toBe("cus_old");
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("creates a customer linked by userId instead of matching by email", async () => {
    mocks.createCustomer.mockClear();
    expect(await getOrCreateCustomerId(ctxWithCustomer(null), user)).toBe("cus_new");
    expect(mocks.createCustomer).toHaveBeenCalledWith(expect.anything(), {
      email: user.email,
      name: user.name,
      metadata: { userId: USER_ID },
      idempotencyKey: USER_ID,
    });
  });
});

function ctxWithStatuses(statuses: string[]) {
  const runQuery = vi.fn<() => Promise<Array<{ status: string }>>>(async () =>
    statuses.map((status) => ({ status })),
  );
  return { runQuery } as unknown as Pick<QueryCtx, "runQuery">;
}

describe("hasActivePremium", () => {
  it.each([
    [["active"], true],
    [["trialing"], true],
    [["canceled", "active"], true],
    [["past_due"], false],
    [["canceled", "incomplete_expired", "unpaid"], false],
    [[], false],
  ])("statuses %j -> %s", async (statuses, expected) => {
    expect(await hasActivePremium(ctxWithStatuses(statuses), USER_ID)).toBe(expected);
  });
});

describe("onInvoicePaid", () => {
  type Handler = (ctx: unknown, args: { userId: string; stripeInvoiceId: string }) => Promise<null>;
  const handler = onInvoicePaid as unknown as Handler;
  const existingUser = { _id: USER_ID, isAnonymous: false };

  it("ignores user IDs that aren't existing users", async () => {
    mocks.rateLimiterReset.mockClear();
    await handler({ db: fakeDb(null) }, { userId: "not-a-user", stripeInvoiceId: "in_1" });
    expect(mocks.rateLimiterReset).not.toHaveBeenCalled();
  });

  it("resets the user's daily and monthly credits", async () => {
    mocks.rateLimiterReset.mockClear();
    await handler({ db: fakeDb(existingUser) }, { userId: USER_ID, stripeInvoiceId: "in_1" });
    const resetNames = mocks.rateLimiterReset.mock.calls.map(([, name]) => name);
    expect(resetNames).toEqual(["authenticatedDaily", "standardMonthly", "premiumMonthly"]);
    for (const [, , options] of mocks.rateLimiterReset.mock.calls) {
      expect(options).toEqual({ key: USER_ID });
    }
  });

  it("resets only once when the same invoice is delivered again", async () => {
    mocks.rateLimiterReset.mockClear();
    const ctx = { db: fakeDb(existingUser) };
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_1" });
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_1" });
    expect(mocks.rateLimiterReset).toHaveBeenCalledTimes(3);
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_2" });
    expect(mocks.rateLimiterReset).toHaveBeenCalledTimes(6);
  });
});

describe("applySubscriptionSnapshot", () => {
  type Handler = (
    ctx: unknown,
    args: { fetchedAt: number; snapshot: Record<string, unknown> },
  ) => Promise<boolean>;
  const handler = applySubscriptionSnapshot as unknown as Handler;
  const snapshot = (status: string) => ({ stripeSubscriptionId: "sub_1", status });

  // Concurrent deliveries: read A (active) starts first, read B (canceled) starts later but is
  // applied first. A's older read must not restore Premium.
  it("discards a read older than the last applied one", async () => {
    const runMutation = vi.fn<(ref: unknown, args: { status: string }) => Promise<null>>(
      async () => null,
    );
    const ctx = { db: fakeDb(), runMutation };
    expect(await handler(ctx, { fetchedAt: 2, snapshot: snapshot("canceled") })).toBe(true);
    expect(await handler(ctx, { fetchedAt: 1, snapshot: snapshot("active") })).toBe(false);
    expect(runMutation.mock.calls.map(([, args]) => args.status)).toEqual(["canceled"]);
  });

  it("applies newer reads", async () => {
    const runMutation = vi.fn<(ref: unknown, args: { status: string }) => Promise<null>>(
      async () => null,
    );
    const ctx = { db: fakeDb(), runMutation };
    await handler(ctx, { fetchedAt: 1, snapshot: snapshot("active") });
    await handler(ctx, { fetchedAt: 2, snapshot: snapshot("canceled") });
    expect(runMutation.mock.calls.map(([, args]) => args.status)).toEqual(["active", "canceled"]);
  });
});

describe("syncSubscriptionFromStripe", () => {
  it("stores Stripe's current state, not the event's snapshot", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce({
      id: "sub_1",
      customer: { id: "cus_1" },
      status: "canceled",
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: { userId: USER_ID },
      items: { data: [{ current_period_end: 1_800_000_000, quantity: 1, price: { id: "p_1" } }] },
    });
    const runMutation = vi.fn<(ref: unknown, args: Record<string, unknown>) => Promise<null>>(
      async () => null,
    );
    const { default: StripeClass } = await import("stripe");
    await syncSubscriptionFromStripe(
      { runMutation } as unknown as ActionCtx,
      new StripeClass("sk_test"),
      "sub_1",
    );
    expect(mocks.retrieveSubscription).toHaveBeenLastCalledWith("sub_1");
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      fetchedAt: expect.any(Number),
      snapshot: {
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        status: "canceled",
        cancelAt: undefined,
        priceId: "p_1",
        metadata: { userId: USER_ID },
      },
    });
  });

  it("propagates Stripe API errors so the webhook is retried", async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce(new Error("Stripe down"));
    const runMutation = vi.fn<() => Promise<null>>(async () => null);
    const { default: StripeClass } = await import("stripe");
    await expect(
      syncSubscriptionFromStripe({ runMutation }, new StripeClass("sk_test"), "sub_1"),
    ).rejects.toThrow("Stripe down");
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("handleStripeEvent", () => {
  const run = async (event: Record<string, unknown>) => {
    mocks.processEvent.mockClear();
    const runMutation = vi.fn<(ref: unknown, args: Record<string, unknown>) => Promise<null>>(
      async () => null,
    );
    const { default: StripeClass } = await import("stripe");
    await handleStripeEvent(
      { runMutation } as unknown as ActionCtx,
      new StripeClass("sk_test"),
      event as unknown as Stripe.Event,
    );
    return runMutation;
  };

  it.each([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ])("%s re-reads the subscription and skips the event snapshot", async (type) => {
    mocks.retrieveSubscription.mockResolvedValueOnce({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: {},
      items: { data: [] },
    });
    await run({ type, data: { object: { id: "sub_1", status: "canceled" } } });
    expect(mocks.processEvent).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).toHaveBeenLastCalledWith("sub_1");
  });

  it("invoice.paid syncs the invoice and resets credits once per invoice id", async () => {
    const runMutation = await run({
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { metadata: { userId: USER_ID } } },
        },
      },
    });
    expect(mocks.processEvent).toHaveBeenCalledTimes(1);
    expect(runMutation.mock.calls[0]?.[1]).toEqual({ userId: USER_ID, stripeInvoiceId: "in_1" });
  });

  it("other events use the component's default syncing", async () => {
    const runMutation = await run({ type: "customer.updated", data: { object: { id: "cus_1" } } });
    expect(mocks.processEvent).toHaveBeenCalledTimes(1);
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("createCheckout", () => {
  type Handler = (ctx: unknown, args: Record<string, never>) => Promise<{ url: string }>;
  const handler = createCheckout as unknown as Handler;
  const signedInUser = { _id: USER_ID, email: "a@example.com", isAnonymous: false };

  const ctxWith = (statuses: string[]) => ({
    runQuery: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(signedInUser)
      .mockResolvedValueOnce(statuses.map((status) => ({ status })))
      .mockResolvedValue({ stripeCustomerId: "cus_1" }),
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused"])(
    "sends users with a %s subscription to the billing portal",
    async (status) => {
      vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
      mocks.createCheckoutSession.mockClear();
      expect(await handler(ctxWith([status]), {})).toEqual({
        url: "https://billing.stripe.com/portal",
      });
      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    },
  );

  it("reuses the user's open checkout instead of creating another", async () => {
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.createCheckoutSession.mockClear();
    mocks.listCheckoutSessions.mockResolvedValueOnce({
      data: [{ url: "https://checkout.stripe.com/open" }],
    });
    expect(await handler(ctxWith(["canceled"]), {})).toEqual({
      url: "https://checkout.stripe.com/open",
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("creates a Managed Payments checkout linked to the user", async () => {
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    mocks.createCheckoutSession.mockClear();
    expect(await handler(ctxWith([]), {})).toEqual({ url: "https://checkout.stripe.com/new" });
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        priceId: "price_test",
        customerId: "cus_1",
        mode: "subscription",
        subscriptionMetadata: { userId: USER_ID },
        params: { managed_payments: { enabled: true }, allow_promotion_codes: true },
      }),
    );
    vi.unstubAllEnvs();
  });
});

describe("getCreditResetUserId", () => {
  const invoice = (billing_reason: string, userId?: string) =>
    ({
      billing_reason,
      parent: { subscription_details: { metadata: userId ? { userId } : {} } },
    }) as unknown as Stripe.Invoice;

  it.each([
    ["subscription_create", USER_ID],
    ["subscription_cycle", USER_ID],
    ["subscription_update", null],
    ["manual", null],
  ])("billing reason %s -> %s", (reason, expected) => {
    expect(getCreditResetUserId(invoice(reason, USER_ID))).toBe(expected);
  });

  it("ignores invoices without a linked user", () => {
    expect(getCreditResetUserId(invoice("subscription_cycle"))).toBeNull();
  });
});
