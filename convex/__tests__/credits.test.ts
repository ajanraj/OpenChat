import { calculateRateLimit, DAY } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  assertMessageCreditAvailable,
  consumeMessageCredit,
  refundMessageCredit,
} from "../lib/credits";
import { refundMessageCredit as refundMessageCreditMutation } from "../users";

interface LimitOptions {
  key: string;
  count?: number;
  throws?: boolean;
}

const mocks = vi.hoisted(() => ({
  check:
    vi.fn<(ctx: unknown, name: string, options: { key: string }) => Promise<{ ok: boolean }>>(),
  limit: vi.fn<(ctx: unknown, name: string, options: LimitOptions) => Promise<{ ok: boolean }>>(),
  hasActivePremium: vi.fn<(ctx: unknown, userId: string) => Promise<boolean>>(),
  getAuthUserId: vi.fn<(ctx: unknown) => Promise<string | null>>(),
}));

vi.mock("../rateLimiter", () => ({
  rateLimiter: { check: mocks.check, limit: mocks.limit },
}));

vi.mock("../stripe", () => ({ hasActivePremium: mocks.hasActivePremium }));

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: mocks.getAuthUserId }));

vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
  internalAction: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:user1" as Id<"users">;

/** Remaining tokens per bucket; check/limit read and write it like the real limiter. */
let remaining: Map<string, number>;

function ctxFor(user: { isAnonymous?: boolean } | null) {
  return {
    db: { get: async () => (user ? { _id: USER_ID, ...user } : null) },
  } as unknown as MutationCtx;
}

async function errorCodeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ConvexError ? error.data : error;
  }
}

beforeEach(() => {
  remaining = new Map();
  mocks.check.mockImplementation(async (_ctx, name) => ({
    ok: (remaining.get(name) ?? 5) >= 1,
  }));
  mocks.limit.mockImplementation(async (_ctx, name, { count = 1 }) => {
    remaining.set(name, (remaining.get(name) ?? 5) - count);
    return { ok: true };
  });
  mocks.hasActivePremium.mockResolvedValue(false);
  mocks.getAuthUserId.mockResolvedValue(USER_ID);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("consumeMessageCredit", () => {
  it("charges the daily and monthly buckets of a signed-in free user", async () => {
    await consumeMessageCredit(ctxFor({ isAnonymous: false }), USER_ID);

    expect(remaining.get("authenticatedDaily")).toBe(4);
    expect(remaining.get("standardMonthly")).toBe(4);
  });

  it("charges the anonymous daily bucket for guests", async () => {
    await consumeMessageCredit(ctxFor({ isAnonymous: true }), USER_ID);

    expect(remaining.get("anonymousDaily")).toBe(4);
    expect(remaining.has("authenticatedDaily")).toBe(false);
  });

  it("charges only premium credits for premium users on premium-credit models", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    await consumeMessageCredit(ctxFor({}), USER_ID, { usesPremiumCredits: true });

    expect([...remaining.keys()]).toEqual(["premiumMonthly"]);
  });

  it("skips the daily bucket for premium users on standard models", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    await consumeMessageCredit(ctxFor({}), USER_ID);

    expect([...remaining.keys()]).toEqual(["standardMonthly"]);
  });

  it.each([
    ["authenticatedDaily", ERROR_CODES.DAILY_LIMIT_REACHED],
    ["standardMonthly", ERROR_CODES.MONTHLY_LIMIT_REACHED],
  ])("throws without charging anything when %s is exhausted", async (bucket, code) => {
    remaining.set(bucket, 0);

    expect(await errorCodeOf(consumeMessageCredit(ctxFor({}), USER_ID))).toBe(code);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("throws PREMIUM_LIMIT_REACHED when premium credits are exhausted", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    remaining.set("premiumMonthly", 0);

    expect(
      await errorCodeOf(consumeMessageCredit(ctxFor({}), USER_ID, { usesPremiumCredits: true })),
    ).toBe(ERROR_CODES.PREMIUM_LIMIT_REACHED);
  });

  it("enforces subscription access when the model requires premium", async () => {
    expect(
      await errorCodeOf(consumeMessageCredit(ctxFor({}), USER_ID, { requiresPremium: true })),
    ).toBe(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("throws USER_NOT_FOUND for a missing user", async () => {
    expect(await errorCodeOf(consumeMessageCredit(ctxFor(null), USER_ID))).toBe(
      ERROR_CODES.USER_NOT_FOUND,
    );
  });
});

describe("assertMessageCreditAvailable", () => {
  it("checks credits without charging them", async () => {
    await assertMessageCreditAvailable(ctxFor({}), USER_ID);
    expect(mocks.limit).not.toHaveBeenCalled();

    remaining.set("authenticatedDaily", 0);
    expect(await errorCodeOf(assertMessageCreditAvailable(ctxFor({}), USER_ID))).toBe(
      ERROR_CODES.DAILY_LIMIT_REACHED,
    );
  });
});

describe("refundMessageCredit", () => {
  it("returns the credit to every charged bucket", async () => {
    const ctx = ctxFor({});
    await consumeMessageCredit(ctx, USER_ID);
    await refundMessageCredit(ctx, USER_ID);

    expect(remaining.get("authenticatedDaily")).toBe(5);
    expect(remaining.get("standardMonthly")).toBe(5);
  });
});

describe("users.refundMessageCredit", () => {
  const refund = refundMessageCreditMutation as unknown as (
    ctx: MutationCtx,
    args: { serverSecret: string; usesPremiumCredits?: boolean },
  ) => Promise<null>;

  it("refunds the caller's credit with the server secret", async () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "route-secret");
    await refund(ctxFor({}), { serverSecret: "route-secret" });

    expect(mocks.limit).toHaveBeenCalledWith(expect.anything(), "standardMonthly", {
      key: USER_ID,
      count: -1,
    });
  });

  it.each([
    ["a wrong secret", "route-secret", "guess"],
    ["an unset secret", "", ""],
  ])("refuses %s before touching credits", async (_label, configured, provided) => {
    vi.stubEnv("SERVER_ROUTE_SECRET", configured);

    expect(await errorCodeOf(refund(ctxFor({}), { serverSecret: provided }))).toBe(
      ERROR_CODES.UNAUTHORIZED,
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });
});

// refundMessageCredit relies on the limiter accepting negative counts and capping values
// at capacity when it reads them. Guard that behaviour across library upgrades.
describe("rate limiter refund contract", () => {
  const config = { kind: "fixed window", rate: 20, period: DAY, capacity: 20 } as const;

  it("adds a consumed token back with a negative count", () => {
    const charged = calculateRateLimit({ value: 20, ts: 0 }, config, 1000, 1);
    const refunded = calculateRateLimit(charged, config, 2000, -1);

    expect(charged.value).toBe(19);
    expect(refunded.value).toBe(20);
  });

  it("caps a refund that lands after the window reset at capacity", () => {
    const refunded = calculateRateLimit({ value: 19, ts: 0 }, config, DAY + 1, -1);
    const nextCharge = calculateRateLimit(refunded, config, DAY + 2, 1);

    expect(nextCharge.value).toBe(19);
  });
});
