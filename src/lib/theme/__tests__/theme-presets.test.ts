import { describe, expect, it } from "vitest";

import { defaultPresets } from "../theme-presets";

const WARM_COLOR_REGEX = /^#[c-f][0-9a-f]/i;

describe("Theme Presets", () => {
  describe("defaultPresets object", () => {
    it("is defined", () => {
      expect(defaultPresets).toBeDefined();
      expect(typeof defaultPresets).toBe("object");
    });

    it("has at least one preset", () => {
      const presetKeys = Object.keys(defaultPresets);
      expect(presetKeys.length).toBeGreaterThan(0);
    });

    it("includes oschat preset", () => {
      expect(defaultPresets.oschat).toBeDefined();
    });

    it("includes claude preset", () => {
      expect(defaultPresets.claude).toBeDefined();
    });

    it("includes vercel preset", () => {
      expect(defaultPresets.vercel).toBeDefined();
    });

    it("includes twitter preset", () => {
      expect(defaultPresets.twitter).toBeDefined();
    });
  });

  describe("preset structure", () => {
    it("each preset has a label", () => {
      for (const preset of Object.values(defaultPresets)) {
        expect(preset.label).toBeDefined();
        expect(typeof preset.label).toBe("string");
        expect((preset.label ?? "").length).toBeGreaterThan(0);
      }
    });

    it("each preset has light and dark styles", () => {
      for (const preset of Object.values(defaultPresets)) {
        expect(preset.styles).toBeDefined();
        expect(preset.styles.light).toBeDefined();
        expect(preset.styles.dark).toBeDefined();
      }
    });

    it("each preset has required color properties", () => {
      const requiredColors = [
        "background",
        "foreground",
        "primary",
        "secondary",
      ];

      for (const preset of Object.values(defaultPresets)) {
        for (const color of requiredColors) {
          expect(
            preset.styles.light[color as keyof typeof preset.styles.light]
          ).toBeDefined();
          expect(
            preset.styles.dark[color as keyof typeof preset.styles.dark]
          ).toBeDefined();
        }
      }
    });

    it("each preset has font settings", () => {
      for (const preset of Object.values(defaultPresets)) {
        expect(preset.styles.light["font-sans"]).toBeDefined();
        expect(preset.styles.light["font-mono"]).toBeDefined();
      }
    });
  });

  describe("oschat preset", () => {
    const oschat = defaultPresets.oschat;

    it("has correct label", () => {
      expect(oschat.label).toBe("OS Chat");
    });

    it("uses oklch color format for light background", () => {
      expect(oschat.styles.light.background).toContain("oklch");
    });

    it("uses oklch color format for dark background", () => {
      expect(oschat.styles.dark.background).toContain("oklch");
    });

    it("uses Geist font for sans", () => {
      expect(oschat.styles.light["font-sans"]).toContain("Geist");
    });

    it("uses Geist Mono for mono", () => {
      expect(oschat.styles.light["font-mono"]).toContain("Geist Mono");
    });
  });

  describe("claude preset", () => {
    const claude = defaultPresets.claude;

    it("has correct label", () => {
      expect(claude.label).toBe("Claude");
    });

    it("has warm terracotta/orange primary color", () => {
      const primary = claude.styles.light.primary;
      // Claude uses #c96442 - a warm terracotta/orange
      // Warm colors have red (R) as dominant channel
      expect(primary).toMatch(WARM_COLOR_REGEX); // Starts with high red value
      expect(primary).toBe("#c96442");
    });
  });

  describe("vercel preset", () => {
    const vercel = defaultPresets.vercel;

    it("has correct label", () => {
      expect(vercel.label).toBe("Vercel");
    });

    it("uses high contrast (black/white) colors", () => {
      // Vercel uses black and white as primary colors
      expect(vercel.styles.dark.background).toContain("oklch(0 0 0)");
    });
  });

  describe("preset consistency", () => {
    it("all presets have common keys", () => {
      for (const preset of Object.values(defaultPresets)) {
        const lightKeys = Object.keys(preset.styles.light);
        const darkKeys = Object.keys(preset.styles.dark);

        // All presets should have at least the common keys
        for (const commonKey of ["background", "foreground", "primary"]) {
          expect(lightKeys).toContain(commonKey);
          expect(darkKeys).toContain(commonKey);
        }
      }
    });
  });
});
