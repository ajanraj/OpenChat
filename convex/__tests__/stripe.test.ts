import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { getOrCreateCustomerId, hasActivePremium } from "../stripe";
import { onInvoicePaid } from "../subscription";

const createCustomer = vi.hoisted(() =>
  vi.fn<() => Promise<{ customerId: string }>>(async () => ({ customerId: "cus_new" })),
);

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
  });
});
