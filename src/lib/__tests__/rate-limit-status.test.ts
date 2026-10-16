import { DAY, HOUR } from "@convex-dev/rate-limiter";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getNextRateLimitReset,
  measureServerClockOffset,
  resolveRateLimitStatus,
} from "../rate-limit-status";
import type { RateLimitState } from "../rate-limit-status";

const WINDOW_START = Date.UTC(2026, 9, 1, 8);
const MONTH = 30 * DAY;

function bucket(value: number, ts: number, capacity: number, period: number) {
  return { value, ts, rate: capacity, capacity, period };
}

function freeUser(dailyValue: number, dailyTs = WINDOW_START): RateLimitState {
  return {
    isPremium: false,
    daily: bucket(dailyValue, dailyTs, 5, DAY),
    monthly: bucket(1400, WINDOW_START, 1500, MONTH),
    premium: null,
  };
}

describe("resolveRateLimitStatus", () => {
  it("reports usage within the current window", () => {
    const status = resolveRateLimitStatus(freeUser(3), WINDOW_START + HOUR);

    expect(status).toMatchObject({
      dailyLimit: 5,
      dailyRemaining: 3,
      dailyCount: 2,
      dailyReset: WINDOW_START + DAY,
      monthlyRemaining: 1400,
      effectiveRemaining: 3,
    });
  });

  it("refills an exhausted daily window once it has ended", () => {
    const status = resolveRateLimitStatus(
      freeUser(0),
      WINDOW_START + DAY + HOUR
    );

    expect(status.dailyRemaining).toBe(5);
    expect(status.dailyCount).toBe(0);
    expect(status.effectiveRemaining).toBe(5);
    expect(status.dailyReset).toBe(WINDOW_START + 2 * DAY);
  });

  it("points the reset at the current window after several have passed", () => {
    const status = resolveRateLimitStatus(
      freeUser(1),
      WINDOW_START + 3.5 * DAY
    );

    expect(status.dailyReset).toBe(WINDOW_START + 4 * DAY);
  });

  it("does not count back into an earlier window when the client clock is behind", () => {
    const status = resolveRateLimitStatus(
      freeUser(3),
      WINDOW_START - 5 * 60 * 1000
    );

    expect(status.dailyRemaining).toBe(3);
    expect(status.dailyReset).toBe(WINDOW_START + DAY);
  });

  it("treats a never-used bucket as full with no reset", () => {
    const status = resolveRateLimitStatus(freeUser(5, 0), WINDOW_START);

    expect(status.dailyRemaining).toBe(5);
    expect(status.dailyReset).toBeUndefined();
  });

  it("caps a bucket refunded above capacity", () => {
    const status = resolveRateLimitStatus(freeUser(6), WINDOW_START + HOUR);

    expect(status.dailyRemaining).toBe(5);
    expect(status.dailyCount).toBe(0);
  });

  it("uses monthly and premium buckets for premium users", () => {
    const status = resolveRateLimitStatus(
      {
        isPremium: true,
        daily: null,
        monthly: bucket(1450, WINDOW_START, 1500, MONTH),
        premium: bucket(90, WINDOW_START, 100, MONTH),
      },
      WINDOW_START + DAY
    );

    expect(status).toMatchObject({
      dailyLimit: 0,
      dailyRemaining: 0,
      monthlyRemaining: 1450,
      premiumLimit: 100,
      premiumRemaining: 90,
      premiumCount: 10,
      effectiveRemaining: 1450,
      premiumReset: WINDOW_START + MONTH,
    });
  });
});

describe("getNextRateLimitReset", () => {
  it("returns the earliest upcoming reset", () => {
    const status = resolveRateLimitStatus(freeUser(3), WINDOW_START + HOUR);

    expect(getNextRateLimitReset(status)).toBe(WINDOW_START + DAY);
  });

  it("returns undefined when no bucket has been used", () => {
    const status = resolveRateLimitStatus(
      {
        isPremium: false,
        daily: bucket(5, 0, 5, DAY),
        monthly: bucket(1500, 0, 1500, MONTH),
        premium: null,
      },
      WINDOW_START
    );

    expect(getNextRateLimitReset(status)).toBeUndefined();
  });
});

describe("measureServerClockOffset", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("measures a device clock behind the server at the round trip's midpoint", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WINDOW_START);

    const offset = await measureServerClockOffset(async () => {
      // The server, two minutes ahead, reads its clock halfway through a 200 ms round trip
      vi.setSystemTime(WINDOW_START + 200);
      return WINDOW_START + 100 + 2 * 60_000;
    });

    expect(offset).toBe(2 * 60_000);
  });

  it("rejects a round trip too slow to trust, so the query measures again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WINDOW_START);

    const measured = measureServerClockOffset(async () => {
      vi.setSystemTime(WINDOW_START + 6000);
      return WINDOW_START + 3000;
    });

    await expect(measured).rejects.toThrow("measure again");
  });
});
