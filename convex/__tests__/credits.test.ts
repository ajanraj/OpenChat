import { calculateRateLimit, DAY, HOUR } from "@convex-dev/rate-limiter";
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

interface BucketValue {
  value: number;
  ts: number;
  config: {
    kind: "fixed window";
    rate: number;
    period: number;
    capacity: number;
  };
}

const mocks = vi.hoisted(() => ({
  check:
    vi.fn<
      (
        ctx: unknown,
        name: string,
        options: { key: string }
      ) => Promise<{ ok: boolean }>
    >(),
  limit:
    vi.fn<
      (
        ctx: unknown,
        name: string,
        options: LimitOptions
      ) => Promise<{ ok: boolean }>
    >(),
  getValue:
    vi.fn<
      (
        ctx: unknown,
        name: string,
        options: { key: string }
      ) => Promise<BucketValue>
    >(),
  hasActivePremium: vi.fn<(ctx: unknown, userId: string) => Promise<boolean>>(),
  getAuthUserId: vi.fn<(ctx: unknown) => Promise<string | null>>(),
}));

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    check: mocks.check,
    limit: mocks.limit,
    getValue: mocks.getValue,
  },
}));

vi.mock("../stripe", () => ({ hasActivePremium: mocks.hasActivePremium }));

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: mocks.getAuthUserId,
}));

vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
  internalAction: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:user1" as Id<"users">;
const NOW = Date.parse("2026-10-14T12:00:00Z");
// Start of the current window of every bucket charged at NOW
const WINDOW = NOW - HOUR;

/** Stored state per bucket; check/limit/getValue read and write it with the limiter's own math. */
let buckets: Map<string, { value: number; ts: number }>;

/** The buckets' config: 5 tokens per day or month, with windows starting at WINDOW. */
function configFor(name: string) {
  const period = name.endsWith("Monthly") ? 30 * DAY : DAY;
  return {
    kind: "fixed window",
    rate: 5,
    period,
    capacity: 5,
    start: WINDOW,
  } as const;
}

/** Stored tokens of a bucket (undefined if never charged). */
const valueOf = (name: string) => buckets.get(name)?.value;

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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  buckets = new Map();
  mocks.check.mockImplementation(async (_ctx, name) => ({
    ok:
      calculateRateLimit(
        buckets.get(name) ?? null,
        configFor(name),
        Date.now(),
        1
      ).value >= 0,
  }));
  mocks.limit.mockImplementation(async (_ctx, name, { count = 1 }) => {
    const { value, ts } = calculateRateLimit(
      buckets.get(name) ?? null,
      configFor(name),
      Date.now(),
      count
    );
    buckets.set(name, { value, ts });
    return { ok: true };
  });
  mocks.getValue.mockImplementation(async (_ctx, name) => ({
    ...(buckets.get(name) ?? { value: 5, ts: 0 }),
    config: configFor(name),
  }));
  mocks.hasActivePremium.mockResolvedValue(false);
  mocks.getAuthUserId.mockResolvedValue(USER_ID);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("consumeMessageCredit", () => {
  it("charges the daily and monthly buckets of a signed-in free user", async () => {
    await expect(
      consumeMessageCredit(ctxFor({ isAnonymous: false }), USER_ID)
    ).resolves.toEqual([
      { bucket: "authenticatedDaily", windowStart: WINDOW },
      { bucket: "standardMonthly", windowStart: WINDOW },
    ]);

    expect(valueOf("authenticatedDaily")).toBe(4);
    expect(valueOf("standardMonthly")).toBe(4);
  });

  it("charges the anonymous daily bucket for guests", async () => {
    await expect(
      consumeMessageCredit(ctxFor({ isAnonymous: true }), USER_ID)
    ).resolves.toEqual([
      { bucket: "anonymousDaily", windowStart: WINDOW },
      { bucket: "standardMonthly", windowStart: WINDOW },
    ]);

    expect(valueOf("anonymousDaily")).toBe(4);
    expect(buckets.has("authenticatedDaily")).toBe(false);
  });

  it("charges only premium credits for premium users on premium-credit models", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    await expect(
      consumeMessageCredit(ctxFor({}), USER_ID, { usesPremiumCredits: true })
    ).resolves.toEqual([{ bucket: "premiumMonthly", windowStart: WINDOW }]);

    expect([...buckets.keys()]).toEqual(["premiumMonthly"]);
  });

  it("skips the daily bucket for premium users on standard models", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    await expect(consumeMessageCredit(ctxFor({}), USER_ID)).resolves.toEqual([
      { bucket: "standardMonthly", windowStart: WINDOW },
    ]);

    expect([...buckets.keys()]).toEqual(["standardMonthly"]);
  });

  it.each([
    ["authenticatedDaily", ERROR_CODES.DAILY_LIMIT_REACHED],
    ["standardMonthly", ERROR_CODES.MONTHLY_LIMIT_REACHED],
  ])(
    "throws without charging anything when %s is exhausted",
    async (bucket, code) => {
      buckets.set(bucket, { value: 0, ts: WINDOW });

      await expect(
        errorCodeOf(consumeMessageCredit(ctxFor({}), USER_ID))
      ).resolves.toBe(code);
      expect(mocks.limit).not.toHaveBeenCalled();
    }
  );

  it("throws PREMIUM_LIMIT_REACHED when premium credits are exhausted", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    buckets.set("premiumMonthly", { value: 0, ts: WINDOW });

    await expect(
      errorCodeOf(
        consumeMessageCredit(ctxFor({}), USER_ID, { usesPremiumCredits: true })
      )
    ).resolves.toBe(ERROR_CODES.PREMIUM_LIMIT_REACHED);
  });

  it("enforces subscription access when the model requires premium", async () => {
    await expect(
      errorCodeOf(
        consumeMessageCredit(ctxFor({}), USER_ID, { requiresPremium: true })
      )
    ).resolves.toBe(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("throws USER_NOT_FOUND for a missing user", async () => {
    await expect(
      errorCodeOf(consumeMessageCredit(ctxFor(null), USER_ID))
    ).resolves.toBe(ERROR_CODES.USER_NOT_FOUND);
  });
});

describe("assertMessageCreditAvailable", () => {
  it("checks credits without charging them", async () => {
    await assertMessageCreditAvailable(ctxFor({}), USER_ID);
    expect(mocks.limit).not.toHaveBeenCalled();

    buckets.set("authenticatedDaily", { value: 0, ts: WINDOW });
    await expect(
      errorCodeOf(assertMessageCreditAvailable(ctxFor({}), USER_ID))
    ).resolves.toBe(ERROR_CODES.DAILY_LIMIT_REACHED);
  });
});

describe("refundMessageCredit", () => {
  it("returns the credit to every charged bucket", async () => {
    const ctx = ctxFor({});
    const receipt = await consumeMessageCredit(ctx, USER_ID);
    await refundMessageCredit(ctx, USER_ID, receipt);

    expect(valueOf("authenticatedDaily")).toBe(5);
    expect(valueOf("standardMonthly")).toBe(5);
  });

  it("restores the charged buckets even after the subscription changed", async () => {
    mocks.hasActivePremium.mockResolvedValue(true);
    const receipt = await consumeMessageCredit(ctxFor({}), USER_ID, {
      usesPremiumCredits: true,
    });
    // The subscription lapses mid-generation
    mocks.hasActivePremium.mockResolvedValue(false);

    await refundMessageCredit(ctxFor({}), USER_ID, receipt);

    expect(valueOf("premiumMonthly")).toBe(5);
    expect(buckets.has("authenticatedDaily")).toBe(false);
    expect(buckets.has("standardMonthly")).toBe(false);
  });

  it("adds back one credit per bucket without reading the user or subscription", async () => {
    buckets.set("standardMonthly", { value: 5, ts: WINDOW });
    const entry = { bucket: "standardMonthly", windowStart: WINDOW } as const;

    await refundMessageCredit(ctxFor(null), USER_ID, [entry, entry]);

    expect(valueOf("standardMonthly")).toBe(6);
    expect(mocks.limit).toHaveBeenCalledOnce();
    expect(mocks.hasActivePremium).not.toHaveBeenCalled();
  });

  it("refunds a charge made before a daily reset to the monthly bucket only", async () => {
    vi.setSystemTime(WINDOW + DAY - 1);
    const late = await consumeMessageCredit(ctxFor({}), USER_ID);
    // The daily window resets, and the user spends a credit in the new one
    vi.setSystemTime(WINDOW + DAY + 1);
    const next = await consumeMessageCredit(ctxFor({}), USER_ID);

    // The late generation fails: its daily token is gone with its window
    await refundMessageCredit(ctxFor({}), USER_ID, late);
    expect(valueOf("authenticatedDaily")).toBe(4);
    expect(valueOf("standardMonthly")).toBe(4);

    await refundMessageCredit(ctxFor({}), USER_ID, next);
    expect(valueOf("authenticatedDaily")).toBe(5);
    expect(valueOf("standardMonthly")).toBe(5);
  });
});

describe("users.refundMessageCredit", () => {
  const refund = refundMessageCreditMutation as unknown as (
    ctx: MutationCtx,
    args: {
      serverSecret: string;
      receipt: { bucket: string; windowStart: number }[];
    }
  ) => Promise<null>;

  it("refunds the caller's charged buckets with the server secret", async () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "route-secret");
    buckets.set("premiumMonthly", { value: 4, ts: WINDOW });
    await refund(ctxFor({}), {
      serverSecret: "route-secret",
      receipt: [{ bucket: "premiumMonthly", windowStart: WINDOW }],
    });

    expect(
      mocks.limit.mock.calls.map(([, name, options]) => [name, options])
    ).toEqual([["premiumMonthly", { key: USER_ID, count: -1 }]]);
  });

  it.each([
    ["a wrong secret", "route-secret", "guess"],
    ["an unset secret", "", ""],
  ])(
    "refuses %s before touching credits",
    async (_label, configured, provided) => {
      vi.stubEnv("SERVER_ROUTE_SECRET", configured);

      await expect(
        errorCodeOf(
          refund(ctxFor({}), {
            serverSecret: provided,
            receipt: [{ bucket: "standardMonthly", windowStart: WINDOW }],
          })
        )
      ).resolves.toBe(ERROR_CODES.UNAUTHORIZED);
      expect(mocks.limit).not.toHaveBeenCalled();
    }
  );
});

// refundMessageCredit relies on the limiter accepting negative counts and projecting a
// bucket to the start of its current window. Guard that behaviour across library upgrades.
describe("rate limiter refund contract", () => {
  const config = {
    kind: "fixed window",
    rate: 20,
    period: DAY,
    capacity: 20,
  } as const;

  it("adds a consumed token back with a negative count", () => {
    const charged = calculateRateLimit({ value: 20, ts: 0 }, config, 1000, 1);
    const refunded = calculateRateLimit(charged, config, 2000, -1);

    expect(charged.value).toBe(19);
    expect(refunded.value).toBe(20);
  });

  it("projects a bucket to the start of the window it is in", () => {
    expect(calculateRateLimit({ value: 19, ts: 0 }, config, DAY - 1).ts).toBe(
      0
    );
    expect(calculateRateLimit({ value: 19, ts: 0 }, config, DAY + 1).ts).toBe(
      DAY
    );
  });
});
