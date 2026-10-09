import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { createCheckout, getOrCreateCustomerId, hasActivePremium } from "../stripe";
import { onInvoicePaid } from "../subscription";

const createCustomer = vi.hoisted(() =>
  vi.fn<() => Promise<{ customerId: string }>>(async () => ({ customerId: "cus_new" })),
);

type LimitFn = (ctx: unknown, name: string, options: { key: string }) => Promise<void>;
const rateLimiter = vi.hoisted(() => ({
  reset: vi.fn<LimitFn>(async () => undefined),
  limit: vi.fn<LimitFn>(async () => undefined),
}));

vi.mock("../rateLimiter", () => ({ rateLimiter }));

vi.mock("@convex-dev/stripe", () => ({
  StripeSubscriptions: class {
    createCustomer = createCustomer;
  },
}));

vi.mock("../_generated/server", () => ({
  action: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:user1" as Id<"users">;

describe("getOrCreateCustomerId", () => {
  const user = { _id: USER_ID, email: "a@example.com", name: "A" };
  const ctxWithCustomer = (customer: { stripeCustomerId: string } | null) =>
    ({
      runQuery: vi.fn<() => Promise<typeof customer>>(async () => customer),
    }) as unknown as ActionCtx;

  it("reuses the customer linked to this user", async () => {
    createCustomer.mockClear();
    expect(
      await getOrCreateCustomerId(ctxWithCustomer({ stripeCustomerId: "cus_old" }), user),
    ).toBe("cus_old");
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("creates a customer linked by userId instead of matching by email", async () => {
    createCustomer.mockClear();
    expect(await getOrCreateCustomerId(ctxWithCustomer(null), user)).toBe("cus_new");
    expect(createCustomer).toHaveBeenCalledWith(expect.anything(), {
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
  type Handler = (ctx: unknown, args: { userId: string }) => Promise<null>;
  const handler = onInvoicePaid as unknown as Handler;

  it("ignores user IDs that are not valid users table IDs", async () => {
    const get = vi.fn<() => Promise<null>>();
    const ctx = { db: { normalizeId: () => null, get } };
    await expect(handler(ctx, { userId: "not-a-user" })).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("ignores users that no longer exist", async () => {
    const ctx = {
      db: { normalizeId: () => USER_ID, get: vi.fn<() => Promise<null>>(async () => null) },
    };
    await expect(handler(ctx, { userId: USER_ID })).resolves.toBeNull();
    expect(rateLimiter.reset).not.toHaveBeenCalled();
  });

  it("resets the user's daily and monthly credits", async () => {
    rateLimiter.reset.mockClear();
    const ctx = {
      db: {
        normalizeId: () => USER_ID,
        get: vi.fn<() => Promise<{ _id: Id<"users">; isAnonymous: boolean }>>(async () => ({
          _id: USER_ID,
          isAnonymous: false,
        })),
      },
    };
    await handler(ctx, { userId: USER_ID });
    const resetNames = rateLimiter.reset.mock.calls.map(([, name]) => name);
    expect(resetNames).toEqual(["authenticatedDaily", "standardMonthly", "premiumMonthly"]);
    for (const [, , options] of rateLimiter.reset.mock.calls) {
      expect(options).toEqual({ key: USER_ID });
    }
  });
});

describe("createCheckout", () => {
  type Handler = (ctx: unknown, args: Record<string, never>) => Promise<{ url: string }>;
  const handler = createCheckout as unknown as Handler;

  it("rejects users who already have an active subscription", async () => {
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
    createCustomer.mockClear();
    const runQuery = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ _id: USER_ID, email: "a@example.com", isAnonymous: false })
      .mockResolvedValueOnce([{ status: "active" }]);
    await expect(handler({ runQuery }, {})).rejects.toThrow(ConvexError);
    expect(createCustomer).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
