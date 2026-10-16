import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  convertTo12Hour,
  convertTo24Hour,
  formatFrequency,
  formatNextRun,
  formatRelativeTime,
  formatTime12Hour,
  formatWeeklyTime,
  getDayName,
  getDayOptions,
  getNextAvailableDate,
  getNextAvailableTime,
  isTimeInPast,
  parseWeeklyTime,
} from "../time-utils";

describe("convertTo12Hour", () => {
  it("converts 0 (midnight) to 12", () => {
    expect(convertTo12Hour(0)).toBe(12);
  });

  it("converts hours 1-11 (AM) unchanged", () => {
    expect(convertTo12Hour(1)).toBe(1);
    expect(convertTo12Hour(6)).toBe(6);
    expect(convertTo12Hour(11)).toBe(11);
  });

  it("keeps 12 (noon) as 12", () => {
    expect(convertTo12Hour(12)).toBe(12);
  });

  it("converts hours 13-23 (PM) to 1-11", () => {
    expect(convertTo12Hour(13)).toBe(1);
    expect(convertTo12Hour(18)).toBe(6);
    expect(convertTo12Hour(23)).toBe(11);
  });
});

describe("convertTo24Hour", () => {
  it("converts 12 AM to 0", () => {
    expect(convertTo24Hour(12, "AM")).toBe(0);
  });

  it("converts AM hours 1-11 unchanged", () => {
    expect(convertTo24Hour(1, "AM")).toBe(1);
    expect(convertTo24Hour(6, "AM")).toBe(6);
    expect(convertTo24Hour(11, "AM")).toBe(11);
  });

  it("keeps 12 PM as 12", () => {
    expect(convertTo24Hour(12, "PM")).toBe(12);
  });

  it("converts PM hours 1-11 to 13-23", () => {
    expect(convertTo24Hour(1, "PM")).toBe(13);
    expect(convertTo24Hour(6, "PM")).toBe(18);
    expect(convertTo24Hour(11, "PM")).toBe(23);
  });
});

describe("formatTime12Hour", () => {
  it("formats midnight correctly", () => {
    const result = formatTime12Hour("00:00");
    expect(result).toEqual({ hour12: "12", minute: "00", ampm: "AM" });
  });

  it("formats noon correctly", () => {
    const result = formatTime12Hour("12:00");
    expect(result).toEqual({ hour12: "12", minute: "00", ampm: "PM" });
  });

  it("formats AM times correctly", () => {
    expect(formatTime12Hour("09:30")).toEqual({
      hour12: "9",
      minute: "30",
      ampm: "AM",
    });
    expect(formatTime12Hour("01:15")).toEqual({
      hour12: "1",
      minute: "15",
      ampm: "AM",
    });
  });

  it("formats PM times correctly", () => {
    expect(formatTime12Hour("15:45")).toEqual({
      hour12: "3",
      minute: "45",
      ampm: "PM",
    });
    expect(formatTime12Hour("23:59")).toEqual({
      hour12: "11",
      minute: "59",
      ampm: "PM",
    });
  });

  it("throws error for invalid format", () => {
    expect(() => formatTime12Hour("invalid")).toThrow(
      'Invalid time format. Expected "HH:mm" format'
    );
    expect(() => formatTime12Hour("")).toThrow("Invalid time format");
    expect(() => formatTime12Hour("25:00")).toThrow("Invalid time format");
  });

  it("handles single digit hours", () => {
    const result = formatTime12Hour("9:30");
    expect(result).toEqual({ hour12: "9", minute: "30", ampm: "AM" });
  });
});

describe("formatNextRun", () => {
  it("formats a date with medium date and short time style", () => {
    const date = new Date("2024-12-25T14:30:00Z");
    const result = formatNextRun(date, "UTC");
    expect(result).toContain("Dec 25, 2024");
  });

  it("handles string date input", () => {
    const result = formatNextRun("2024-12-25T14:30:00Z", "UTC");
    expect(result).toContain("Dec 25, 2024");
  });
});

describe("formatFrequency", () => {
  it("formats daily frequency", () => {
    const result = formatFrequency("daily", "09:00");
    expect(result).toBe("Daily at 9:00 AM");
  });

  it("formats weekly frequency", () => {
    const result = formatFrequency("weekly", "1:09:00");
    expect(result).toBe("Mondays at 9:00 AM");
  });

  it("formats monthly frequency", () => {
    const result = formatFrequency("monthly", "09:00");
    expect(result).toBe("Monthly on the 1st at 9:00 AM");
  });

  it("formats once frequency", () => {
    const result = formatFrequency("once", "14:30");
    expect(result).toBe("Once at 2:30 PM");
  });

  it("handles default case", () => {
    const result = formatFrequency("custom", "09:00");
    expect(result).toBe("custom at 9:00 AM");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for times less than 60 seconds ago', () => {
    const now = new Date("2024-12-25T12:00:30Z");
    vi.setSystemTime(now);
    const date = new Date("2024-12-25T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("Just now");
  });

  it('returns "In a moment" for future times', () => {
    const now = new Date("2024-12-25T12:00:00Z");
    vi.setSystemTime(now);
    const futureDate = new Date("2024-12-25T12:00:30Z");
    expect(formatRelativeTime(futureDate)).toBe("In a moment");
  });

  it("formats minutes ago correctly", () => {
    const now = new Date("2024-12-25T12:10:00Z");
    vi.setSystemTime(now);
    const date = new Date("2024-12-25T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("10m ago");
  });

  it("formats hours ago correctly", () => {
    const now = new Date("2024-12-25T15:00:00Z");
    vi.setSystemTime(now);
    const date = new Date("2024-12-25T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("3h ago");
  });

  it("formats days ago correctly", () => {
    const now = new Date("2024-12-28T12:00:00Z");
    vi.setSystemTime(now);
    const date = new Date("2024-12-25T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("3d ago");
  });

  it("returns localized date for old dates", () => {
    const now = new Date("2024-12-25T12:00:00Z");
    vi.setSystemTime(now);
    const date = new Date("2024-01-01T12:00:00Z");
    const result = formatRelativeTime(date);
    expect(result).toBeTruthy();
  });

  it("handles string date input", () => {
    const now = new Date("2024-12-25T12:10:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2024-12-25T12:00:00Z")).toBe("10m ago");
  });
});

describe("isTimeInPast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when no selectedDate is provided", () => {
    expect(isTimeInPast("09:00")).toBe(false);
  });

  it("returns true for a past time today", () => {
    const now = new Date("2024-12-25T15:00:00Z");
    vi.setSystemTime(now);
    const today = new Date("2024-12-25T00:00:00Z");
    expect(isTimeInPast("09:00", today)).toBe(true);
  });

  it("returns false for a future time today", () => {
    const now = new Date("2024-12-25T09:00:00Z");
    vi.setSystemTime(now);
    const today = new Date("2024-12-25T00:00:00Z");
    expect(isTimeInPast("15:00", today)).toBe(false);
  });
});

describe("getNextAvailableTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns next 5-minute interval", () => {
    vi.setSystemTime(new Date("2024-12-25T09:00:00"));
    const result = getNextAvailableTime();
    expect(result).toBe("09:05");
  });

  it("rounds up to next 5-minute interval", () => {
    vi.setSystemTime(new Date("2024-12-25T09:02:00"));
    const result = getNextAvailableTime();
    expect(result).toBe("09:05");
  });

  it("handles hour rollover", () => {
    vi.setSystemTime(new Date("2024-12-25T09:58:00"));
    const result = getNextAvailableTime();
    expect(result).toBe("10:00");
  });

  it("handles day rollover", () => {
    vi.setSystemTime(new Date("2024-12-25T23:59:00"));
    const result = getNextAvailableTime();
    expect(result).toBe("00:00");
  });
});

describe("getNextAvailableDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today when there is time left", () => {
    vi.setSystemTime(new Date("2024-12-25T12:00:00"));
    const result = getNextAvailableDate();
    expect(result.getDate()).toBe(25);
  });

  it("returns tomorrow when no time left", () => {
    vi.setSystemTime(new Date("2024-12-25T23:59:00"));
    const result = getNextAvailableDate();
    expect(result.getDate()).toBe(26);
  });
});

describe("parseWeeklyTime", () => {
  it("parses day:HH:MM format correctly", () => {
    expect(parseWeeklyTime("1:09:30")).toEqual({ day: 1, time: "09:30" });
    expect(parseWeeklyTime("0:12:00")).toEqual({ day: 0, time: "12:00" });
    expect(parseWeeklyTime("6:23:59")).toEqual({ day: 6, time: "23:59" });
  });

  it("handles HH:MM format with Monday default", () => {
    expect(parseWeeklyTime("09:30")).toEqual({ day: 1, time: "09:30" });
    expect(parseWeeklyTime("12:00")).toEqual({ day: 1, time: "12:00" });
  });

  it("throws error for non-string input", () => {
    expect(() => parseWeeklyTime(123 as unknown as string)).toThrow(
      "scheduledTime must be a string"
    );
  });

  it("throws error for empty string", () => {
    expect(() => parseWeeklyTime("")).toThrow("scheduledTime cannot be empty");
    expect(() => parseWeeklyTime("   ")).toThrow(
      "scheduledTime cannot be empty"
    );
  });

  it("throws error for invalid day", () => {
    expect(() => parseWeeklyTime("7:09:30")).toThrow(
      "Day must be a number between 0 and 6"
    );
    expect(() => parseWeeklyTime("-1:09:30")).toThrow(
      "Day must be a number between 0 and 6"
    );
  });

  it("throws error for invalid hour", () => {
    expect(() => parseWeeklyTime("1:25:30")).toThrow(
      "Hour must be a valid two-digit number between 00 and 23"
    );
    expect(() => parseWeeklyTime("1:9:30")).toThrow(
      "Hour must be a valid two-digit number between 00 and 23"
    );
  });

  it("throws error for invalid minute", () => {
    expect(() => parseWeeklyTime("1:09:60")).toThrow(
      "Minute must be a valid two-digit number between 00 and 59"
    );
    expect(() => parseWeeklyTime("1:09:5")).toThrow(
      "Minute must be a valid two-digit number between 00 and 59"
    );
  });

  it("throws error for invalid format", () => {
    expect(() => parseWeeklyTime("invalid")).toThrow(
      'scheduledTime must be in format "day:HH:MM" or "HH:MM"'
    );
  });
});

describe("formatWeeklyTime", () => {
  it("formats day and time correctly", () => {
    expect(formatWeeklyTime(1, "09:30")).toBe("1:09:30");
    expect(formatWeeklyTime(0, "12:00")).toBe("0:12:00");
    expect(formatWeeklyTime(6, "23:59")).toBe("6:23:59");
  });

  it("throws error for non-number day", () => {
    expect(() => formatWeeklyTime("1" as unknown as number, "09:30")).toThrow(
      "day must be a number"
    );
  });

  it("throws error for invalid day range", () => {
    expect(() => formatWeeklyTime(7, "09:30")).toThrow(
      "day must be an integer between 0 and 6"
    );
    expect(() => formatWeeklyTime(-1, "09:30")).toThrow(
      "day must be an integer between 0 and 6"
    );
    expect(() => formatWeeklyTime(1.5, "09:30")).toThrow(
      "day must be an integer between 0 and 6"
    );
  });

  it("throws error for non-string time", () => {
    expect(() => formatWeeklyTime(1, 930 as unknown as string)).toThrow(
      "time must be a string"
    );
  });

  it("throws error for empty time", () => {
    expect(() => formatWeeklyTime(1, "")).toThrow("time cannot be empty");
    expect(() => formatWeeklyTime(1, "   ")).toThrow("time cannot be empty");
  });

  it("throws error for invalid time format", () => {
    expect(() => formatWeeklyTime(1, "9:30")).toThrow(
      'time must be in format "HH:MM"'
    );
    expect(() => formatWeeklyTime(1, "25:00")).toThrow(
      'time must be in format "HH:MM"'
    );
  });
});

describe("getDayName", () => {
  it("returns correct day names", () => {
    expect(getDayName(0)).toBe("Sunday");
    expect(getDayName(1)).toBe("Monday");
    expect(getDayName(2)).toBe("Tuesday");
    expect(getDayName(3)).toBe("Wednesday");
    expect(getDayName(4)).toBe("Thursday");
    expect(getDayName(5)).toBe("Friday");
    expect(getDayName(6)).toBe("Saturday");
  });

  it("returns Monday for out-of-range numbers", () => {
    expect(getDayName(7)).toBe("Monday");
    expect(getDayName(-1)).toBe("Monday");
  });
});

describe("getDayOptions", () => {
  it("returns all 7 days with correct values and labels", () => {
    const options = getDayOptions();
    expect(options).toHaveLength(7);
    expect(options[0]).toEqual({ value: 0, label: "Sunday" });
    expect(options[1]).toEqual({ value: 1, label: "Monday" });
    expect(options[6]).toEqual({ value: 6, label: "Saturday" });
  });
});
