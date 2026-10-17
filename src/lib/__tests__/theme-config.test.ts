import { describe, expect, it } from "vitest";

import {
  COMMON_STYLES,
  DEFAULT_FONT_MONO,
  DEFAULT_FONT_SANS,
  DEFAULT_FONT_SERIF,
  defaultDarkThemeStyles,
  defaultLightThemeStyles,
  defaultThemeState,
} from "../config/theme";

describe("Theme Config Constants", () => {
  describe("common style keys", () => {
    it("contains all expected common style keys", () => {
      expect(COMMON_STYLES).toStrictEqual(
        expect.arrayContaining([
          "font-sans",
          "font-serif",
          "font-mono",
          "radius",
          "shadow-opacity",
          "letter-spacing",
          "spacing",
        ])
      );
    });
  });

  describe("DEFAULT_FONT constants", () => {
    it("DEFAULT_FONT_SANS contains system-ui fallbacks", () => {
      expect(DEFAULT_FONT_SANS).toContain("system-ui");
      expect(DEFAULT_FONT_SANS).toContain("sans-serif");
    });

    it("DEFAULT_FONT_SERIF contains Times fallbacks", () => {
      expect(DEFAULT_FONT_SERIF).toContain("Georgia");
      expect(DEFAULT_FONT_SERIF).toContain("serif");
    });

    it("DEFAULT_FONT_MONO contains monospace fallbacks", () => {
      expect(DEFAULT_FONT_MONO).toContain("Menlo");
      expect(DEFAULT_FONT_MONO).toContain("monospace");
    });
  });
});

describe("default light theme styles", () => {
  it("has background color", () => {
    expect(defaultLightThemeStyles.background).toBeDefined();
    expect(defaultLightThemeStyles.background).toContain("oklch");
  });

  it("has foreground color", () => {
    expect(defaultLightThemeStyles.foreground).toBeDefined();
  });

  it("has primary and secondary colors", () => {
    expect(defaultLightThemeStyles.primary).toBeDefined();
    expect(defaultLightThemeStyles["primary-foreground"]).toBeDefined();
    expect(defaultLightThemeStyles.secondary).toBeDefined();
    expect(defaultLightThemeStyles["secondary-foreground"]).toBeDefined();
  });

  it("has font settings", () => {
    expect(defaultLightThemeStyles["font-sans"]).toBeDefined();
    expect(defaultLightThemeStyles["font-serif"]).toBeDefined();
    expect(defaultLightThemeStyles["font-mono"]).toBeDefined();
  });

  it("has shadow settings", () => {
    expect(defaultLightThemeStyles["shadow-color"]).toBeDefined();
    expect(defaultLightThemeStyles["shadow-opacity"]).toBeDefined();
    expect(defaultLightThemeStyles["shadow-blur"]).toBeDefined();
  });

  it("has sidebar styles", () => {
    expect(defaultLightThemeStyles.sidebar).toBeDefined();
    expect(defaultLightThemeStyles["sidebar-foreground"]).toBeDefined();
    expect(defaultLightThemeStyles["sidebar-primary"]).toBeDefined();
  });

  it("has chart colors", () => {
    expect(defaultLightThemeStyles["chart-1"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-2"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-3"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-4"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-5"]).toBeDefined();
  });
});

describe("default dark theme styles", () => {
  it("extends light theme styles", () => {
    // Dark theme should have same keys as light theme
    const lightKeys = Object.keys(defaultLightThemeStyles);
    const darkKeys = Object.keys(defaultDarkThemeStyles);

    for (const key of lightKeys) {
      expect(darkKeys).toContain(key);
    }
  });

  it("has different background from light theme", () => {
    expect(defaultDarkThemeStyles.background).not.toBe(
      defaultLightThemeStyles.background
    );
  });

  it("has different foreground from light theme", () => {
    expect(defaultDarkThemeStyles.foreground).not.toBe(
      defaultLightThemeStyles.foreground
    );
  });

  it("shares font settings with light theme", () => {
    expect(defaultDarkThemeStyles["font-sans"]).toBe(
      defaultLightThemeStyles["font-sans"]
    );
    expect(defaultDarkThemeStyles["font-mono"]).toBe(
      defaultLightThemeStyles["font-mono"]
    );
  });
});

describe("default theme state", () => {
  it("has light and dark styles", () => {
    expect(defaultThemeState.styles.light).toBeDefined();
    expect(defaultThemeState.styles.dark).toBeDefined();
  });

  it("defaults to light mode for SSR compatibility", () => {
    expect(defaultThemeState.currentMode).toBe("light");
  });

  it("has default preset", () => {
    expect(defaultThemeState.preset).toBe("oschat");
  });

  it("has default HSL adjustments", () => {
    expect(defaultThemeState.hslAdjustments).toStrictEqual({
      hueShift: 0,
      saturationScale: 1,
      lightnessScale: 1,
    });
  });
});
