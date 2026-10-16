import { describe, expect, it } from "vitest";

import {
  getDisplayName,
  getFirstName,
  getUserTimezone,
  isUserAuthenticated,
} from "../user-utils";

describe("user-utils", () => {
  describe(getFirstName, () => {
    it("returns null for undefined name", () => {
      expect(getFirstName()).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getFirstName("")).toBeNull();
    });

    it("returns first name from full name", () => {
      expect(getFirstName("John Doe")).toBe("John");
    });

    it("returns full name if no space", () => {
      expect(getFirstName("John")).toBe("John");
    });

    it("handles multiple spaces", () => {
      expect(getFirstName("John Michael Doe")).toBe("John");
    });

    it("handles names with leading space", () => {
      // Leading space would result in empty string as first "word"
      expect(getFirstName(" John Doe")).toBe("");
    });
  });

  describe(getDisplayName, () => {
    it("returns null for null user", () => {
      expect(getDisplayName(null)).toBeNull();
    });

    it("returns preferredName when available", () => {
      const user = {
        preferredName: "Johnny",
        name: "John Doe",
      };
      expect(getDisplayName(user)).toBe("Johnny");
    });

    it("returns first name when no preferredName", () => {
      const user = {
        name: "John Doe",
      };
      expect(getDisplayName(user)).toBe("John");
    });

    it("returns null when no name or preferredName", () => {
      const user = {};
      expect(getDisplayName(user)).toBeNull();
    });

    it("prefers preferredName over name", () => {
      const user = {
        preferredName: "JD",
        name: "John Doe",
      };
      expect(getDisplayName(user)).toBe("JD");
    });
  });

  describe(isUserAuthenticated, () => {
    it("returns false for null user", () => {
      expect(isUserAuthenticated(null)).toBeFalsy();
    });

    it("returns false for anonymous user", () => {
      const user = {
        isAnonymous: true,
      };
      expect(isUserAuthenticated(user)).toBeFalsy();
    });

    it("returns true for authenticated user", () => {
      const user = {
        isAnonymous: false,
      };
      expect(isUserAuthenticated(user)).toBeTruthy();
    });

    it("returns true when isAnonymous is undefined", () => {
      const user = {};
      expect(isUserAuthenticated(user)).toBeTruthy();
    });
  });

  describe(getUserTimezone, () => {
    it("returns a non-empty string", () => {
      const timezone = getUserTimezone();
      expect(timezone).toBeTypeOf("string");
      expect(timezone.length).toBeGreaterThan(0);
    });

    it("returns a valid IANA timezone", () => {
      const timezone = getUserTimezone();
      const validTimezones = Intl.supportedValuesOf("timeZone");
      expect(validTimezones).toContain(timezone);
    });
  });
});
