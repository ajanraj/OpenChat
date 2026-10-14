import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../../src/lib/error-codes";
import { calculateNextExecution, type TaskSchedule, validateSchedule } from "../schedule_helper";

const utc = (iso: string) => Date.parse(iso);

/** Next run computed "at" `nowIso`; system time is pinned too because dayjs.tz reads the clock. */
function nextAt(schedule: TaskSchedule, nowIso: string): string {
  const now = utc(nowIso);
  vi.setSystemTime(now);
  return new Date(calculateNextExecution(schedule, now)).toISOString();
}

const daily = (scheduledTime: string, timezone: string): TaskSchedule => ({
  scheduleType: "daily",
  scheduledTime,
  timezone,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateNextExecution", () => {
  describe("daily across DST transitions", () => {
    it("keeps 09:00 New York local when clocks fall back (Nov 1, 2026)", () => {
      // Sat Oct 31 10:00 EDT -> Sun Nov 1 09:00 EST
      expect(nextAt(daily("09:00", "America/New_York"), "2026-10-31T14:00:00Z")).toBe(
        "2026-11-01T14:00:00.000Z",
      );
    });

    it("keeps 09:00 New York local when clocks spring forward (Mar 8, 2026)", () => {
      // Sat Mar 7 10:00 EST -> Sun Mar 8 09:00 EDT
      expect(nextAt(daily("09:00", "America/New_York"), "2026-03-07T15:00:00Z")).toBe(
        "2026-03-08T13:00:00.000Z",
      );
    });

    it("moves a time skipped by spring forward to the instant after the jump", () => {
      // 02:30 does not exist on Mar 8 in New York; it resolves to 03:30 EDT
      expect(nextAt(daily("02:30", "America/New_York"), "2026-03-07T15:00:00Z")).toBe(
        "2026-03-08T07:30:00.000Z",
      );
    });

    it("keeps 09:00 London local across both BST transitions", () => {
      // BST ends Sun Oct 25, 2026 -> 09:00 GMT
      expect(nextAt(daily("09:00", "Europe/London"), "2026-10-24T10:00:00Z")).toBe(
        "2026-10-25T09:00:00.000Z",
      );
      // BST starts Sun Mar 29, 2026 -> 09:00 BST
      expect(nextAt(daily("09:00", "Europe/London"), "2026-03-28T10:00:00Z")).toBe(
        "2026-03-29T08:00:00.000Z",
      );
    });

    it("keeps 09:00 Sydney local when clocks fall back (Apr 5, 2026)", () => {
      // Sat Apr 4 09:00 AEDT -> Sun Apr 5 09:00 AEST
      expect(nextAt(daily("09:00", "Australia/Sydney"), "2026-04-03T22:00:00Z")).toBe(
        "2026-04-04T23:00:00.000Z",
      );
    });

    it("handles Lord Howe's half-hour DST shift (Oct 4, 2026)", () => {
      // Sat Oct 3 09:00 +10:30 -> Sun Oct 4 09:00 +11:00
      expect(nextAt(daily("09:00", "Australia/Lord_Howe"), "2026-10-02T22:30:00Z")).toBe(
        "2026-10-03T22:00:00.000Z",
      );
    });
  });

  describe("positive-offset zones run once per day", () => {
    it("schedules the next Kolkata run tomorrow, not later the same day", () => {
      // Run fires at 09:00 IST (03:30Z); the next one is the following morning
      expect(nextAt(daily("09:00", "Asia/Kolkata"), "2026-10-12T03:30:00Z")).toBe(
        "2026-10-13T03:30:00.000Z",
      );
    });

    it("schedules the next Sydney run tomorrow when the local date is ahead of UTC", () => {
      // Mon Oct 12 09:00 AEDT is still Sun Oct 11 in UTC
      expect(nextAt(daily("09:00", "Australia/Sydney"), "2026-10-11T22:00:00Z")).toBe(
        "2026-10-12T22:00:00.000Z",
      );
    });

    it("supports half- and quarter-hour offsets", () => {
      expect(nextAt(daily("09:00", "Asia/Kolkata"), "2026-10-12T00:00:00Z")).toBe(
        "2026-10-12T03:30:00.000Z",
      );
      expect(nextAt(daily("09:00", "Asia/Kathmandu"), "2026-10-12T00:00:00Z")).toBe(
        "2026-10-12T03:15:00.000Z",
      );
    });

    it("accepts unpadded hours from older tasks", () => {
      expect(nextAt(daily("9:05", "Asia/Kolkata"), "2026-10-12T00:00:00Z")).toBe(
        "2026-10-12T03:35:00.000Z",
      );
    });
  });

  describe("weekly", () => {
    const weekly = (scheduledTime: string, timezone: string): TaskSchedule => ({
      scheduleType: "weekly",
      scheduledTime,
      timezone,
    });

    it("uses the weekday in the user's zone, not UTC", () => {
      // Sun Oct 11 16:00Z is already Monday 01:00 in Tokyo -> Monday 08:00 JST today
      expect(nextAt(weekly("1:08:00", "Asia/Tokyo"), "2026-10-11T16:00:00Z")).toBe(
        "2026-10-11T23:00:00.000Z",
      );
    });

    it("moves to next week once this week's slot has passed", () => {
      // Monday 08:00 JST ran at Sun 23:00Z; the next is a week later
      expect(nextAt(weekly("1:08:00", "Asia/Tokyo"), "2026-10-11T23:00:00Z")).toBe(
        "2026-10-18T23:00:00.000Z",
      );
    });

    it("keeps the local time across a DST change", () => {
      // Sunday 09:00 New York; Nov 1 is after the fall-back
      expect(nextAt(weekly("0:09:00", "America/New_York"), "2026-10-25T13:00:00Z")).toBe(
        "2026-11-01T14:00:00.000Z",
      );
    });
  });

  describe("onetime", () => {
    it("resolves the date and time in the user's zone", () => {
      const schedule: TaskSchedule = {
        scheduleType: "onetime",
        scheduledTime: "09:00",
        scheduledDate: "2026-12-25",
        timezone: "America/New_York",
      };
      expect(nextAt(schedule, "2026-10-12T00:00:00Z")).toBe("2026-12-25T14:00:00.000Z");
    });

    it("falls back to tomorrow in the user's zone for legacy tasks without a date", () => {
      const schedule: TaskSchedule = {
        scheduleType: "onetime",
        scheduledTime: "09:00",
        timezone: "Asia/Tokyo",
      };
      // Already Oct 12 in Tokyo, so tomorrow is Oct 13
      expect(nextAt(schedule, "2026-10-11T20:00:00Z")).toBe("2026-10-13T00:00:00.000Z");
    });
  });
});

describe("validateSchedule", () => {
  const thrownBy = (schedule: TaskSchedule) => {
    try {
      validateSchedule(schedule);
    } catch (error) {
      return error;
    }
    return null;
  };

  it.each([
    daily("09:00", "Mars/Olympus_Mons"),
    daily("09:00", ""),
    daily("25:00", "UTC"),
    daily("09:60", "UTC"),
    daily("abc", "UTC"),
    daily("1:09:00", "UTC"),
    { scheduleType: "weekly", scheduledTime: "7:09:00", timezone: "UTC" },
    { scheduleType: "weekly", scheduledTime: "09:00", timezone: "UTC" },
    {
      scheduleType: "onetime",
      scheduledTime: "09:00",
      scheduledDate: "2026-02-30",
      timezone: "UTC",
    },
    {
      scheduleType: "onetime",
      scheduledTime: "09:00",
      scheduledDate: "12/25/2026",
      timezone: "UTC",
    },
  ] satisfies TaskSchedule[])("rejects %j with INVALID_INPUT", (schedule) => {
    const error = thrownBy(schedule);
    expect(error).toBeInstanceOf(ConvexError);
    expect(error).toMatchObject({ data: ERROR_CODES.INVALID_INPUT });
  });

  it("accepts well-formed schedules", () => {
    expect(() => validateSchedule(daily("23:59", "America/New_York"))).not.toThrow();
    expect(() =>
      validateSchedule({ scheduleType: "weekly", scheduledTime: "6:00:00", timezone: "UTC" }),
    ).not.toThrow();
    expect(() =>
      validateSchedule({
        scheduleType: "onetime",
        scheduledTime: "09:00",
        scheduledDate: "2028-02-29",
        timezone: "Europe/London",
      }),
    ).not.toThrow();
  });
});
