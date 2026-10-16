import { StripeSubscriptions } from "@convex-dev/stripe";
import { Stripe } from "stripe";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimiter";
import {
  createCheckout,
  getCreditResetUserId,
  getOrCreateCustomerId,
  handleStripeEvent,
  hasActivePremium,
  syncSubscriptionFromStripe,
} from "../stripe";
import {
  applySubscriptionSnapshot,
  onInvoicePaid,
  reserveSubscriptionSync,
} from "../subscription";

const mocks = vi.hoisted(() => ({
  processEvent: vi.fn<() => Promise<void>>().mockResolvedValue(),
  retrieveSubscription: vi.fn<(id: string) => Promise<unknown>>(),
  listCheckoutSessions: vi
    .fn<() => Promise<{ data: { url: string | null }[] }>>()
    .mockResolvedValue({ data: [] }),
}));

vi.mock(import("stripe"), async (importOriginal) => {
  const original = await importOriginal();
  const { Stripe: RealStripe } = original;
  /** The real client, with the calls the billing code makes answered by `mocks`. */
  class FakeStripe extends RealStripe {
    constructor(...args: ConstructorParameters<typeof RealStripe>) {
      super(...args);
      Object.assign(this.subscriptions, {
        retrieve: mocks.retrieveSubscription,
      });
      Object.assign(this.checkout.sessions, {
        list: mocks.listCheckoutSessions,
      });
    }
  }
  return { ...original, default: FakeStripe, Stripe: FakeStripe };
});

vi.mock(import("@convex-dev/stripe"), async (importOriginal) => ({
  ...(await importOriginal()),
  processEvent: mocks.processEvent,
}));

const createCustomer = vi
  .spyOn(StripeSubscriptions.prototype, "createCustomer")
  .mockResolvedValue({ customerId: "cus_new" });
const createCheckoutSession = vi
  .spyOn(StripeSubscriptions.prototype, "createCheckoutSession")
  .mockResolvedValue({
    sessionId: "cs_new",
    url: "https://checkout.stripe.com/new",
  });
vi.spyOn(
  StripeSubscriptions.prototype,
  "createCustomerPortalSession"
).mockResolvedValue({ url: "https://billing.stripe.com/portal" });

const rateLimiterReset = vi.spyOn(rateLimiter, "reset").mockResolvedValue();
vi.spyOn(rateLimiter, "limit").mockResolvedValue({
  ok: true,
  retryAfter: undefined,
});

const isUserId = (id: string): id is Id<"users"> => id.startsWith("users:");

const toUserId = (id: string): Id<"users"> => {
  if (!isUserId(id)) {
    throw new Error(`${id} is not a users id`);
  }
  return id;
};

const USER_ID = toUserId("users:user1");

type Handler<Args, Result> = (ctx: object, args: Args) => Promise<Result>;

const isHandler = <Args, Result>(fn: unknown): fn is Handler<Args, Result> =>
  typeof fn === "function";

// Convex keeps each registered function's handler on `_handler`; tests call it directly
const handlerOf = <Args, Result>(fn: object): Handler<Args, Result> => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler<Args, Result>(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return handler;
};

const isActionCtx = (ctx: object): ctx is ActionCtx =>
  "runQuery" in ctx || "runMutation" in ctx;

/** The fake ctx as the ActionCtx the code under test takes; it only has the members it uses. */
const asActionCtx = (ctx: object): ActionCtx => {
  if (!isActionCtx(ctx)) {
    throw new Error("The fake ctx lacks runQuery and runMutation");
  }
  return ctx;
};

const isRunQueryCtx = (ctx: object): ctx is Pick<QueryCtx, "runQuery"> =>
  "runQuery" in ctx;

const isStripeEvent = (event: object): event is Stripe.Event =>
  "type" in event && "data" in event;

const isStripeInvoice = (invoice: object): invoice is Stripe.Invoice =>
  "billing_reason" in invoice;

type Row = Record<string, unknown> & { _id: string; _table: string };

/** Minimal in-memory ctx.db supporting the index lookups our billing mutations use. */
const fakeDb = (
  user: { _id: Id<"users">; isAnonymous: boolean } | null = null
) => {
  const rows: Row[] = [];
  return {
    rows,
    normalizeId: (_table: string, id: string) =>
      user && id === user._id ? id : null,
    get: async () => await Promise.resolve(user),
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (q: { eq: (f: string, v: unknown) => void }) => void
      ) => {
        let field = "";
        let value: unknown;
        build({
          eq: (f, v) => {
            field = f;
            value = v;
          },
        });
        return {
          unique: async () =>
            await Promise.resolve(
              rows.find((r) => r._table === table && r[field] === value) ?? null
            ),
        };
      },
    }),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${rows.length}`;
      rows.push({ ...doc, _id, _table: table });
      return await Promise.resolve(_id);
    },
    patch: async (
      _table: string,
      id: string,
      fields: Record<string, unknown>
    ) => {
      Object.assign(rows.find((r) => r._id === id) ?? {}, fields);
      await Promise.resolve();
    },
  };
};

const ctxWithCustomer = (customer: { stripeCustomerId: string } | null) =>
  asActionCtx({
    runQuery: vi
      .fn<() => Promise<typeof customer>>()
      .mockResolvedValue(customer),
  });

describe(getOrCreateCustomerId, () => {
  const user = { _id: USER_ID, email: "a@example.com", name: "A" };

  it("reuses the customer linked to this user", async () => {
    createCustomer.mockClear();
    await expect(
      getOrCreateCustomerId(
        ctxWithCustomer({ stripeCustomerId: "cus_old" }),
        user
      )
    ).resolves.toBe("cus_old");
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("creates a customer linked by userId instead of matching by email", async () => {
    createCustomer.mockClear();
    await expect(
      getOrCreateCustomerId(ctxWithCustomer(null), user)
    ).resolves.toBe("cus_new");
    expect(createCustomer).toHaveBeenCalledWith(expect.anything(), {
      email: user.email,
      name: user.name,
      metadata: { userId: USER_ID },
      idempotencyKey: USER_ID,
    });
  });
});

const ctxWithStatuses = (statuses: string[]): Pick<QueryCtx, "runQuery"> => {
  const ctx = {
    runQuery: vi
      .fn<() => Promise<{ status: string }[]>>()
      .mockResolvedValue(statuses.map((status) => ({ status }))),
  };
  if (!isRunQueryCtx(ctx)) {
    throw new Error("The fake ctx lacks runQuery");
  }
  return ctx;
};

describe(hasActivePremium, () => {
  it.each([
    [["active"], true],
    [["trialing"], true],
    [["canceled", "active"], true],
    [["past_due"], false],
    [["canceled", "incomplete_expired", "unpaid"], false],
    [[], false],
  ])("statuses %j -> %s", async (statuses, expected) => {
    await expect(
      hasActivePremium(ctxWithStatuses(statuses), USER_ID)
    ).resolves.toBe(expected);
  });
});

describe("onInvoicePaid mutation", () => {
  const handler = handlerOf<{ userId: string; stripeInvoiceId: string }, null>(
    onInvoicePaid
  );
  const existingUser = { _id: USER_ID, isAnonymous: false };

  it("ignores user IDs that aren't existing users", async () => {
    rateLimiterReset.mockClear();
    await handler(
      { db: fakeDb(null) },
      { userId: "not-a-user", stripeInvoiceId: "in_1" }
    );
    expect(rateLimiterReset).not.toHaveBeenCalled();
  });

  it("ignores valid user IDs whose user was deleted", async () => {
    rateLimiterReset.mockClear();
    const db = {
      ...fakeDb(null),
      normalizeId: (_table: string, id: string) => id,
    };
    await handler({ db }, { userId: USER_ID, stripeInvoiceId: "in_1" });
    expect(rateLimiterReset).not.toHaveBeenCalled();
    expect(db.rows).toStrictEqual([]);
  });

  it("resets the user's daily and monthly credits", async () => {
    rateLimiterReset.mockClear();
    await handler(
      { db: fakeDb(existingUser) },
      { userId: USER_ID, stripeInvoiceId: "in_1" }
    );
    const resets = rateLimiterReset.mock.calls.map(([, name, options]) => [
      name,
      options,
    ]);
    expect(resets).toStrictEqual([
      ["authenticatedDaily", { key: USER_ID }],
      ["standardMonthly", { key: USER_ID }],
      ["premiumMonthly", { key: USER_ID }],
    ]);
  });

  it("fails (so Stripe redelivers) when a credit reset fails", async () => {
    rateLimiterReset.mockClear();
    rateLimiterReset.mockRejectedValueOnce(
      new Error("rate limiter unavailable")
    );
    await expect(
      handler(
        { db: fakeDb(existingUser) },
        { userId: USER_ID, stripeInvoiceId: "in_1" }
      )
    ).rejects.toThrow("rate limiter unavailable");
  });

  it("resets only once when the same invoice is delivered again", async () => {
    rateLimiterReset.mockClear();
    const ctx = { db: fakeDb(existingUser) };
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_1" });
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_1" });
    expect(rateLimiterReset).toHaveBeenCalledTimes(3);
    await handler(ctx, { userId: USER_ID, stripeInvoiceId: "in_2" });
    expect(rateLimiterReset).toHaveBeenCalledTimes(6);
  });
});

const snapshot = (status: string) => ({
  stripeSubscriptionId: "sub_1",
  status,
});

const setupSyncCtx = () => {
  const runMutation = vi
    .fn<(ref: unknown, args: { status: string }) => Promise<null>>()
    .mockResolvedValue(null);
  const ctx = { db: fakeDb(), runMutation };
  const stored = () => runMutation.mock.calls.map(([, args]) => args.status);
  return { ctx, stored };
};

describe("subscription sync revisions", () => {
  const reserve = handlerOf<{ stripeSubscriptionId: string }, number>(
    reserveSubscriptionSync
  );
  const apply = handlerOf<
    { revision: number; snapshot: Record<string, unknown> },
    boolean
  >(applySubscriptionSnapshot);

  it("reserves increasing revisions per subscription", async () => {
    const { ctx } = setupSyncCtx();
    await expect(reserve(ctx, { stripeSubscriptionId: "sub_1" })).resolves.toBe(
      1
    );
    await expect(reserve(ctx, { stripeSubscriptionId: "sub_1" })).resolves.toBe(
      2
    );
    await expect(reserve(ctx, { stripeSubscriptionId: "sub_2" })).resolves.toBe(
      1
    );
  });

  // Concurrent deliveries: read A (active) reserves first, read B (canceled) reserves later but
  // is applied first. A's older read must not restore Premium, regardless of wall clocks.
  it("discards a read whose revision is older than the last applied one", async () => {
    const { ctx, stored } = setupSyncCtx();
    const a = await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    const b = await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    await expect(
      apply(ctx, { revision: b, snapshot: snapshot("canceled") })
    ).resolves.toBeTruthy();
    await expect(
      apply(ctx, { revision: a, snapshot: snapshot("active") })
    ).resolves.toBeFalsy();
    expect(stored()).toStrictEqual(["canceled"]);
  });

  it("applies reads in revision order", async () => {
    const { ctx, stored } = setupSyncCtx();
    const a = await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    const b = await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    await apply(ctx, { revision: a, snapshot: snapshot("active") });
    await apply(ctx, { revision: b, snapshot: snapshot("canceled") });
    expect(stored()).toStrictEqual(["active", "canceled"]);
  });

  it("lets a retried read win after the original read failed", async () => {
    const { ctx, stored } = setupSyncCtx();
    // This read failed, so it is never applied
    await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    const retry = await reserve(ctx, { stripeSubscriptionId: "sub_1" });
    await expect(
      apply(ctx, { revision: retry, snapshot: snapshot("canceled") })
    ).resolves.toBeTruthy();
    expect(stored()).toStrictEqual(["canceled"]);
  });
});

describe(syncSubscriptionFromStripe, () => {
  it("stores Stripe's current state, not the event's snapshot", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce({
      id: "sub_1",
      customer: { id: "cus_1" },
      status: "canceled",
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: { userId: USER_ID },
      items: {
        data: [
          {
            current_period_end: 1_800_000_000,
            quantity: 1,
            price: { id: "p_1" },
          },
        ],
      },
    });
    const runMutation = vi
      .fn<
        (ref: unknown, args: Record<string, unknown>) => Promise<number | null>
      >()
      .mockResolvedValueOnce(1)
      .mockResolvedValue(null);
    await syncSubscriptionFromStripe(
      asActionCtx({ runMutation }),
      new Stripe("sk_test"),
      "sub_1"
    );
    expect(mocks.retrieveSubscription).toHaveBeenLastCalledWith("sub_1");
    expect(runMutation.mock.calls[0]?.[1]).toStrictEqual({
      stripeSubscriptionId: "sub_1",
    });
    expect(runMutation.mock.calls[1]?.[1]).toMatchObject({
      revision: 1,
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
    const runMutation = vi.fn<() => Promise<number>>().mockResolvedValue(1);
    await expect(
      syncSubscriptionFromStripe(
        { runMutation },
        new Stripe("sk_test"),
        "sub_1"
      )
    ).rejects.toThrow("Stripe down");
    // Only the revision was reserved; nothing was stored
    expect(runMutation).toHaveBeenCalledOnce();
  });
});

/** Handles `event` with a fresh runMutation mock, which it returns. */
const runStripeEvent = async (event: object) => {
  mocks.processEvent.mockClear();
  const runMutation = vi
    .fn<(ref: unknown, args: Record<string, unknown>) => Promise<null>>()
    .mockResolvedValue(null);
  if (!isStripeEvent(event)) {
    throw new Error("The fake event lacks type or data");
  }
  await handleStripeEvent(
    asActionCtx({ runMutation }),
    new Stripe("sk_test"),
    event
  );
  return runMutation;
};

describe(handleStripeEvent, () => {
  it.each([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ])(
    "%s re-reads the subscription and skips the event snapshot",
    async (type) => {
      mocks.retrieveSubscription.mockResolvedValueOnce({
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: {},
        items: { data: [] },
      });
      await runStripeEvent({
        type,
        data: { object: { id: "sub_1", status: "canceled" } },
      });
      expect(mocks.processEvent).not.toHaveBeenCalled();
      expect(mocks.retrieveSubscription).toHaveBeenLastCalledWith("sub_1");
    }
  );

  it("invoice.paid syncs the invoice and resets credits once per invoice id", async () => {
    const runMutation = await runStripeEvent({
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { metadata: { userId: USER_ID } } },
        },
      },
    });
    expect(mocks.processEvent).toHaveBeenCalledOnce();
    expect(runMutation.mock.calls[0]?.[1]).toStrictEqual({
      userId: USER_ID,
      stripeInvoiceId: "in_1",
    });
  });

  it("other events use the component's default syncing", async () => {
    const runMutation = await runStripeEvent({
      type: "customer.updated",
      data: { object: { id: "cus_1" } },
    });
    expect(mocks.processEvent).toHaveBeenCalledOnce();
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("createCheckout action", () => {
  const handler = handlerOf<Record<string, never>, { url: string }>(
    createCheckout
  );
  const signedInUser = {
    _id: USER_ID,
    email: "a@example.com",
    isAnonymous: false,
  };

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
      createCheckoutSession.mockClear();
      await expect(handler(ctxWith([status]), {})).resolves.toStrictEqual({
        url: "https://billing.stripe.com/portal",
      });
      expect(createCheckoutSession).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    }
  );

  it("reuses the user's open checkout instead of creating another", async () => {
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    createCheckoutSession.mockClear();
    mocks.listCheckoutSessions.mockResolvedValueOnce({
      data: [{ url: "https://checkout.stripe.com/open" }],
    });
    await expect(handler(ctxWith(["canceled"]), {})).resolves.toStrictEqual({
      url: "https://checkout.stripe.com/open",
    });
    expect(createCheckoutSession).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("creates a Managed Payments checkout linked to the user", async () => {
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    createCheckoutSession.mockClear();
    await expect(handler(ctxWith([]), {})).resolves.toStrictEqual({
      url: "https://checkout.stripe.com/new",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        priceId: "price_test",
        customerId: "cus_1",
        mode: "subscription",
        subscriptionMetadata: { userId: USER_ID },
        params: {
          managed_payments: { enabled: true },
          allow_promotion_codes: true,
        },
      })
    );
    vi.unstubAllEnvs();
  });
});

const invoiceWith = (billing_reason: string, userId?: string) => {
  const invoice = {
    billing_reason,
    parent: {
      subscription_details: {
        metadata: userId !== undefined && userId !== "" ? { userId } : {},
      },
    },
  };
  if (!isStripeInvoice(invoice)) {
    throw new Error("The fake invoice lacks billing_reason");
  }
  return invoice;
};

describe(getCreditResetUserId, () => {
  it.each([
    ["subscription_create", USER_ID],
    ["subscription_cycle", USER_ID],
    ["subscription_update", null],
    ["manual", null],
  ])("billing reason %s -> %s", (reason, expected) => {
    expect(getCreditResetUserId(invoiceWith(reason, USER_ID))).toBe(expected);
  });

  it("ignores invoices without a linked user", () => {
    expect(getCreditResetUserId(invoiceWith("subscription_cycle"))).toBeNull();
  });
});
