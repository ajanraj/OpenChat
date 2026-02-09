import { describe, expect, it } from "vitest";
import { getHighResolutionAvatarUrl, getUserAvatarSeed } from "../avatar-utils";

describe("avatar-utils", () => {
  describe("getUserAvatarSeed", () => {
    it("uses preferred name first", () => {
      expect(
        getUserAvatarSeed({
          email: "google@example.com",
          name: "Google Name",
          preferredName: "Preferred Name",
        }),
      ).toBe("Preferred Name");
    });

    it("uses google name when preferred name is missing", () => {
      expect(
        getUserAvatarSeed({
          email: "google@example.com",
          name: "Google Name",
          preferredName: undefined,
        }),
      ).toBe("Google Name");
    });

    it("uses email when preferred and google names are missing", () => {
      expect(
        getUserAvatarSeed({
          email: "person@example.com",
        }),
      ).toBe("person@example.com");
    });

    it("returns user fallback when all seed fields are missing", () => {
      expect(getUserAvatarSeed({})).toBe("user");
      expect(getUserAvatarSeed(null)).toBe("user");
    });

    it("trims seed values and skips blank strings", () => {
      expect(
        getUserAvatarSeed({
          email: "  person@example.com ",
          name: "   ",
          preferredName: "  ",
        }),
      ).toBe("person@example.com");
    });
  });

  describe("getHighResolutionAvatarUrl", () => {
    it("returns undefined for empty input", () => {
      expect(getHighResolutionAvatarUrl(undefined)).toBeUndefined();
      expect(getHighResolutionAvatarUrl(null)).toBeUndefined();
    });

    it("replaces existing sz query param for google avatars", () => {
      expect(
        getHighResolutionAvatarUrl("https://lh3.googleusercontent.com/a/abc?s=96-c&sz=96", 384),
      ).toBe("https://lh3.googleusercontent.com/a/abc?s=96-c&sz=384");
    });

    it("replaces s96-c format for google avatars", () => {
      expect(getHighResolutionAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c", 256)).toBe(
        "https://lh3.googleusercontent.com/a/abc=s256-c",
      );
    });

    it("adds sz query param when no size param exists", () => {
      expect(getHighResolutionAvatarUrl("https://lh3.googleusercontent.com/a/abc", 320)).toBe(
        "https://lh3.googleusercontent.com/a/abc?sz=320",
      );
    });

    it("passes through non-google avatar URLs unchanged", () => {
      const imageUrl = "https://example.com/profile.png";
      expect(getHighResolutionAvatarUrl(imageUrl, 320)).toBe(imageUrl);
    });
  });
});
