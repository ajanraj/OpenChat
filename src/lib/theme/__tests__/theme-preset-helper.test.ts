import { describe, expect, it } from "vitest";

import { defaultThemeState } from "../../config/theme";
import type { ThemeStyles } from "../../types/theme";
import { getPresetThemeStyles } from "../theme-preset-helper";
import { defaultPresets } from "../theme-presets";

describe(getPresetThemeStyles, () => {
  describe("with valid preset name", () => {
    it("returns styles for oschat preset", () => {
      const styles = getPresetThemeStyles("oschat");
      expect(styles).toBeDefined();
      expect(styles.light).toBeDefined();
      expect(styles.dark).toBeDefined();
    });

    it("returns styles for claude preset", () => {
      const styles = getPresetThemeStyles("claude");
      expect(styles).toBeDefined();
      expect(styles.light).toBeDefined();
      expect(styles.dark).toBeDefined();
    });

    it("returns styles for vercel preset", () => {
      const styles = getPresetThemeStyles("vercel");
      expect(styles).toBeDefined();
      expect(styles.light).toBeDefined();
      expect(styles.dark).toBeDefined();
    });

    it("merges preset styles with defaults", () => {
      const styles = getPresetThemeStyles("claude");

      // Should have all keys from default theme
      const defaultLightKeys = Object.keys(defaultThemeState.styles.light);
      const resultLightKeys = Object.keys(styles.light);

      for (const key of defaultLightKeys) {
        expect(resultLightKeys).toContain(key);
      }
    });

    it("preset values override defaults", () => {
      const styles = getPresetThemeStyles("claude");

      // Claude has a specific primary color that differs from default
      expect(styles.light.primary).toBe(
        defaultPresets.claude.styles.light.primary
      );
    });
  });

  describe("with invalid preset name", () => {
    it("returns default styles for undefined preset", () => {
      const styles = getPresetThemeStyles();
      expect(styles).toStrictEqual(defaultThemeState.styles);
    });

    it("returns default styles for non-existent preset", () => {
      const styles = getPresetThemeStyles("non-existent-preset");
      expect(styles).toStrictEqual(defaultThemeState.styles);
    });

    it("returns default styles for empty string", () => {
      const styles = getPresetThemeStyles("");
      expect(styles).toStrictEqual(defaultThemeState.styles);
    });
  });

  describe("style completeness", () => {
    it("returned styles have complete light mode", () => {
      const styles = getPresetThemeStyles("oschat");

      const keys: (keyof ThemeStyles["light"])[] = [
        "background",
        "foreground",
        "primary",
        "primary-foreground",
        "secondary",
        "font-sans",
        "font-mono",
      ];
      for (const key of keys) {
        expect(styles.light[key]).toBeDefined();
      }
    });

    it("returned styles have complete dark mode", () => {
      const styles = getPresetThemeStyles("oschat");

      expect(styles.dark.background).toBeDefined();
      expect(styles.dark.foreground).toBeDefined();
      expect(styles.dark.primary).toBeDefined();
      expect(styles.dark["primary-foreground"]).toBeDefined();
      expect(styles.dark.secondary).toBeDefined();
    });
  });
});
