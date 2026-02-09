import { describe, expect, it } from "vitest";
import {
  getRenderableAvatarImageSrc,
  getHighResolutionAvatarUrl,
  getUserAvatarSeed,
  isLikelyDefaultGoogleAvatarUrl,
} from "../avatar-utils";

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

  describe("isLikelyDefaultGoogleAvatarUrl", () => {
    it("returns false for empty input", () => {
      expect(isLikelyDefaultGoogleAvatarUrl(undefined)).toBe(false);
      expect(isLikelyDefaultGoogleAvatarUrl(null)).toBe(false);
    });

    it("detects modern default user pattern", () => {
      expect(
        isLikelyDefaultGoogleAvatarUrl("https://lh3.googleusercontent.com/a/default-user=s96-c"),
      ).toBe(true);
    });

    it("detects legacy default user pattern", () => {
      expect(
        isLikelyDefaultGoogleAvatarUrl(
          "https://lh3.googleusercontent.com/-XdUIqdMkCWA/AAAAAAAAAAI/AAAAAAAAAAA/photo.jpg",
        ),
      ).toBe(true);
    });

    it("returns false for non-default google avatar", () => {
      expect(
        isLikelyDefaultGoogleAvatarUrl(
          "https://lh3.googleusercontent.com/a/ACg8ocJ19jYKQxuq2CkaNytv5V4ODt8hA8k8j66IY6D2dg=s96-c",
        ),
      ).toBe(false);
    });

    it("returns false for non-google avatar", () => {
      expect(isLikelyDefaultGoogleAvatarUrl("https://example.com/avatar.png")).toBe(false);
    });
  });

  describe("getRenderableAvatarImageSrc", () => {
    it("returns undefined for default google avatar URLs", () => {
      expect(
        getRenderableAvatarImageSrc("https://lh3.googleusercontent.com/a/default-user=s96-c"),
      ).toBeUndefined();
    });

    it("returns original URL for custom avatars", () => {
      const imageUrl =
        "https://lh3.googleusercontent.com/a/ACg8ocJ19jYKQxuq2CkaNytv5V4ODt8hA8k8j66IY6D2dg=s96-c";
      expect(getRenderableAvatarImageSrc(imageUrl)).toBe(imageUrl);
    });
  });
});
