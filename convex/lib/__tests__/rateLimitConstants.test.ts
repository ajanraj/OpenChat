import { describe, expect, it } from "vitest";

import { PERIODS, RATE_LIMITS } from "../rateLimitConstants";

describe("RATE_LIMITS constants", () => {
  it("has anonymous daily limit defined", () => {
    expect(RATE_LIMITS.ANONYMOUS_DAILY).toBe(5);
  });

  it("has authenticated daily limit defined", () => {
    expect(RATE_LIMITS.AUTHENTICATED_DAILY).toBe(20);
  });

  it("has standard monthly limit defined", () => {
    expect(RATE_LIMITS.STANDARD_MONTHLY).toBe(1500);
  });

  it("has premium monthly limit defined", () => {
    expect(RATE_LIMITS.PREMIUM_MONTHLY).toBe(100);
  });

  it("has monthly period days defined", () => {
    expect(RATE_LIMITS.MONTHLY_PERIOD_DAYS).toBe(30);
  });

  it("authenticated limit is greater than anonymous limit", () => {
    expect(RATE_LIMITS.AUTHENTICATED_DAILY).toBeGreaterThan(
      RATE_LIMITS.ANONYMOUS_DAILY
    );
  });
});

describe("PERIODS constants", () => {
  it("has daily period defined", () => {
    expect(PERIODS.DAILY).toBeDefined();
    // 24 hours in milliseconds
    expect(PERIODS.DAILY).toBe(24 * 60 * 60 * 1000);
  });

  it("has monthly period defined", () => {
    expect(PERIODS.MONTHLY).toBeDefined();
    // 30 days in milliseconds
    expect(PERIODS.MONTHLY).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("monthly period equals daily times monthly period days", () => {
    expect(PERIODS.MONTHLY).toBe(
      PERIODS.DAILY * RATE_LIMITS.MONTHLY_PERIOD_DAYS
    );
  });
});
