import { describe, expect, it } from "vitest";
import { ICON_MAP, PROFILE_ICONS, getDefaultIconForIndex } from "../profile-icons";

describe("profile-icons config", () => {
  it("contains unique icon names", () => {
    const uniqueIcons = new Set(PROFILE_ICONS);
    expect(uniqueIcons.size).toBe(PROFILE_ICONS.length);
  });

  it("maps every profile icon name to an icon component", () => {
    for (const iconName of PROFILE_ICONS) {
      expect(ICON_MAP[iconName]).toBeDefined();
      const type = typeof ICON_MAP[iconName];
      expect(type === "function" || type === "object").toBe(true);
    }
  });

  it("returns deterministic default icon based on index", () => {
    expect(getDefaultIconForIndex(0)).toBe(PROFILE_ICONS[0]);
    expect(getDefaultIconForIndex(1)).toBe(PROFILE_ICONS[1]);
  });

  it("wraps around when index exceeds icon count", () => {
    const length = PROFILE_ICONS.length;
    expect(getDefaultIconForIndex(length)).toBe(PROFILE_ICONS[0]);
    expect(getDefaultIconForIndex(length + 3)).toBe(PROFILE_ICONS[3]);
  });
});
