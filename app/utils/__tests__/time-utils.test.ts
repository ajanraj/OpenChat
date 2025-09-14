import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  convertTo12Hour,
  convertTo24Hour,
  formatTime12Hour,
  getNextAvailableDate,
  getNextAvailableTime,
  isTimeInPast,
} from "../time-utils";

describe("time-utils", () => {
  beforeEach(() => {
    // Reset any date mocks before each test
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getNextAvailableTime", () => {
    it("should return next 5-minute interval during regular hours", () => {
      // Mock current time: 2:32 PM
      const mockDate = new Date("2024-01-15T14:32:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 2:35 PM
      expect(result).toBe("14:35");
    });

    it("should handle hour rollover when minutes round up to 60", () => {
      // Mock current time: 2:58 PM
      const mockDate = new Date("2024-01-15T14:58:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 3:00 PM
      expect(result).toBe("15:00");
    });

    it("should handle midnight rollover from late night (11:55 PM)", () => {
      // Mock current time: 11:55 PM
      const mockDate = new Date("2024-01-15T23:55:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 12:00 AM (00:00)
      expect(result).toBe("00:00");
    });

    it("should handle midnight rollover from 11:58 PM", () => {
      // Mock current time: 11:58 PM
      const mockDate = new Date("2024-01-15T23:58:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 12:00 AM (00:00)
      expect(result).toBe("00:00");
    });

    it("should handle edge case at exactly midnight", () => {
      // Mock current time: 12:00 AM
      const mockDate = new Date("2024-01-15T00:00:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 12:05 AM (00:05)
      expect(result).toBe("00:05");
    });

    it("should handle exact 5-minute intervals", () => {
      // Mock current time: exactly 2:30 PM
      const mockDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableTime();

      // Next 5-minute interval should be 2:35 PM
      expect(result).toBe("14:35");
    });
  });

  describe("getNextAvailableDate", () => {
    it("should return today for regular hours", () => {
      // Mock current time: 2:32 PM
      const mockDate = new Date("2024-01-15T14:32:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return today's date
      expect(result.toDateString()).toBe(mockDate.toDateString());
    });

    it("should return tomorrow when time rolls over to next day (11:55 PM)", () => {
      // Mock current time: 11:55 PM
      const mockDate = new Date("2024-01-15T23:55:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return tomorrow's date (Jan 16)
      const expectedTomorrow = new Date("2024-01-16");
      expect(result.toDateString()).toBe(expectedTomorrow.toDateString());
    });

    it("should return tomorrow when time rolls over to next day (11:58 PM)", () => {
      // Mock current time: 11:58 PM
      const mockDate = new Date("2024-01-15T23:58:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return tomorrow's date (Jan 16)
      const expectedTomorrow = new Date("2024-01-16");
      expect(result.toDateString()).toBe(expectedTomorrow.toDateString());
    });

    it("should return today at exact midnight", () => {
      // Mock current time: 12:00 AM
      const mockDate = new Date("2024-01-15T00:00:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return today's date (since next time is 00:05 same day)
      expect(result.toDateString()).toBe(mockDate.toDateString());
    });

    it("should handle month rollover correctly", () => {
      // Mock current time: 11:58 PM on last day of month
      const mockDate = new Date("2024-01-31T23:58:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return Feb 1st
      const expectedTomorrow = new Date("2024-02-01");
      expect(result.toDateString()).toBe(expectedTomorrow.toDateString());
    });

    it("should handle year rollover correctly", () => {
      // Mock current time: 11:58 PM on Dec 31st
      const mockDate = new Date("2024-12-31T23:58:00");
      vi.setSystemTime(mockDate);

      const result = getNextAvailableDate();

      // Should return Jan 1st of next year
      const expectedTomorrow = new Date("2025-01-01");
      expect(result.toDateString()).toBe(expectedTomorrow.toDateString());
    });
  });

  describe("integration test - combined time and date logic", () => {
    it("should provide consistent time/date pair for late night scheduling", () => {
      // Mock current time: 11:58 PM on Jan 15th
      const mockDate = new Date("2024-01-15T23:58:00");
      vi.setSystemTime(mockDate);

      const nextTime = getNextAvailableTime();
      const nextDate = getNextAvailableDate();

      // Time should be 00:00 (12:00 AM)
      expect(nextTime).toBe("00:00");

      // Date should be tomorrow (Jan 16th)
      const expectedTomorrow = new Date("2024-01-16");
      expect(nextDate.toDateString()).toBe(expectedTomorrow.toDateString());

      // Verify the combination makes sense - 00:00 on Jan 16th is in the future
      const combinedDateTime = new Date(nextDate);
      const [hours, minutes] = nextTime.split(":").map(Number);
      combinedDateTime.setHours(hours, minutes, 0, 0);

      expect(combinedDateTime > mockDate).toBe(true);
    });

    it("should provide consistent time/date pair for regular hours", () => {
      // Mock current time: 2:32 PM on Jan 15th
      const mockDate = new Date("2024-01-15T14:32:00");
      vi.setSystemTime(mockDate);

      const nextTime = getNextAvailableTime();
      const nextDate = getNextAvailableDate();

      // Time should be 14:35 (2:35 PM)
      expect(nextTime).toBe("14:35");

      // Date should be today (Jan 15th)
      expect(nextDate.toDateString()).toBe(mockDate.toDateString());

      // Verify the combination makes sense - 14:35 on Jan 15th is in the future
      const combinedDateTime = new Date(nextDate);
      const [hours, minutes] = nextTime.split(":").map(Number);
      combinedDateTime.setHours(hours, minutes, 0, 0);

      expect(combinedDateTime > mockDate).toBe(true);
    });
  });

  describe("helper functions", () => {
    describe("convertTo12Hour", () => {
      it("should convert 24-hour to 12-hour format correctly", () => {
        expect(convertTo12Hour(0)).toBe(12); // 12 AM
        expect(convertTo12Hour(1)).toBe(1); // 1 AM
        expect(convertTo12Hour(12)).toBe(12); // 12 PM
        expect(convertTo12Hour(13)).toBe(1); // 1 PM
        expect(convertTo12Hour(23)).toBe(11); // 11 PM
      });
    });

    describe("convertTo24Hour", () => {
      it("should convert 12-hour to 24-hour format correctly", () => {
        expect(convertTo24Hour(12, "AM")).toBe(0); // 12 AM -> 00
        expect(convertTo24Hour(1, "AM")).toBe(1); // 1 AM -> 01
        expect(convertTo24Hour(12, "PM")).toBe(12); // 12 PM -> 12
        expect(convertTo24Hour(1, "PM")).toBe(13); // 1 PM -> 13
        expect(convertTo24Hour(11, "PM")).toBe(23); // 11 PM -> 23
      });
    });

    describe("formatTime12Hour", () => {
      it("should format 24-hour time to 12-hour components", () => {
        const result = formatTime12Hour("00:00");
        expect(result).toEqual({ hour12: "12", minute: "00", ampm: "AM" });

        const result2 = formatTime12Hour("14:35");
        expect(result2).toEqual({ hour12: "2", minute: "35", ampm: "PM" });
      });

      it("should handle edge cases correctly", () => {
        // Midnight
        expect(formatTime12Hour("00:00")).toEqual({
          hour12: "12",
          minute: "00",
          ampm: "AM",
        });
        // Noon
        expect(formatTime12Hour("12:00")).toEqual({
          hour12: "12",
          minute: "00",
          ampm: "PM",
        });
        // Last minute of day
        expect(formatTime12Hour("23:59")).toEqual({
          hour12: "11",
          minute: "59",
          ampm: "PM",
        });
        // Single digit hours and minutes
        expect(formatTime12Hour("9:05")).toEqual({
          hour12: "9",
          minute: "05",
          ampm: "AM",
        });
      });

      it("should throw error for invalid time format", () => {
        // Invalid format strings
        expect(() => formatTime12Hour("25:00")).toThrow("Invalid time format");
        expect(() => formatTime12Hour("12:60")).toThrow("Invalid time format");
        expect(() => formatTime12Hour("abc:def")).toThrow(
          "Invalid time format"
        );
        expect(() => formatTime12Hour("12")).toThrow("Invalid time format");
        expect(() => formatTime12Hour("12:30:45")).toThrow(
          "Invalid time format"
        );
        expect(() => formatTime12Hour("")).toThrow("Invalid time format");
      });

      it("should throw error for out-of-range hour values", () => {
        expect(() => formatTime12Hour("24:00")).toThrow("Invalid time format");
        expect(() => formatTime12Hour("-1:00")).toThrow("Invalid time format");
      });

      it("should throw error for out-of-range minute values", () => {
        expect(() => formatTime12Hour("12:60")).toThrow("Invalid time format");
        expect(() => formatTime12Hour("12:-1")).toThrow("Invalid time format");
      });

      it("should accept various valid formats", () => {
        // Single digit hours
        expect(formatTime12Hour("1:30")).toEqual({
          hour12: "1",
          minute: "30",
          ampm: "AM",
        });
        expect(formatTime12Hour("01:30")).toEqual({
          hour12: "1",
          minute: "30",
          ampm: "AM",
        });
        // Single digit minutes (should not be valid in strict format)
        expect(() => formatTime12Hour("12:5")).toThrow("Invalid time format");
      });
    });

    describe("isTimeInPast", () => {
      it("should correctly identify past times", () => {
        // Mock current time to 12:00 PM
        const mockDate = new Date("2024-01-15T12:00:00");
        vi.setSystemTime(mockDate);

        const today = new Date("2024-01-15");

        expect(isTimeInPast("11:30", today)).toBe(true); // 11:30 AM is past
        expect(isTimeInPast("12:30", today)).toBe(false); // 12:30 PM is future
        expect(isTimeInPast("23:59", today)).toBe(false); // 11:59 PM is future
      });

      it("should return false when no date provided", () => {
        expect(isTimeInPast("11:30")).toBe(false);
      });
    });
  });
});
