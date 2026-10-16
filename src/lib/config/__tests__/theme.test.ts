import { describe, expect, it } from "vitest";

import {
  COMMON_STYLES,
  DEFAULT_FONT_MONO,
  DEFAULT_FONT_SANS,
  DEFAULT_FONT_SERIF,
  defaultDarkThemeStyles,
  defaultLightThemeStyles,
  defaultThemeState,
} from "../theme";

describe("COMMON_STYLES", () => {
  it("is an array of style property names", () => {
    expect(Array.isArray(COMMON_STYLES)).toBe(true);
    expect(COMMON_STYLES.length).toBeGreaterThan(0);
  });

  it("contains font properties", () => {
    expect(COMMON_STYLES).toContain("font-sans");
    expect(COMMON_STYLES).toContain("font-serif");
    expect(COMMON_STYLES).toContain("font-mono");
  });

  it("contains layout properties", () => {
    expect(COMMON_STYLES).toContain("radius");
    expect(COMMON_STYLES).toContain("spacing");
    expect(COMMON_STYLES).toContain("letter-spacing");
  });

  it("contains shadow properties", () => {
    expect(COMMON_STYLES).toContain("shadow-opacity");
    expect(COMMON_STYLES).toContain("shadow-blur");
    expect(COMMON_STYLES).toContain("shadow-spread");
    expect(COMMON_STYLES).toContain("shadow-offset-x");
    expect(COMMON_STYLES).toContain("shadow-offset-y");
  });
});

describe("DEFAULT_FONT constants", () => {
  it("DEFAULT_FONT_SANS is a valid font stack", () => {
    expect(DEFAULT_FONT_SANS).toBeDefined();
    expect(typeof DEFAULT_FONT_SANS).toBe("string");
    expect(DEFAULT_FONT_SANS).toContain("sans-serif");
  });

  it("DEFAULT_FONT_SERIF is a valid font stack", () => {
    expect(DEFAULT_FONT_SERIF).toBeDefined();
    expect(typeof DEFAULT_FONT_SERIF).toBe("string");
    expect(DEFAULT_FONT_SERIF).toContain("serif");
  });

  it("DEFAULT_FONT_MONO is a valid font stack", () => {
    expect(DEFAULT_FONT_MONO).toBeDefined();
    expect(typeof DEFAULT_FONT_MONO).toBe("string");
    expect(DEFAULT_FONT_MONO).toContain("monospace");
  });
});

describe("defaultLightThemeStyles", () => {
  it("is defined and is an object", () => {
    expect(defaultLightThemeStyles).toBeDefined();
    expect(typeof defaultLightThemeStyles).toBe("object");
  });

  it("has required color properties", () => {
    expect(defaultLightThemeStyles.background).toBeDefined();
    expect(defaultLightThemeStyles.foreground).toBeDefined();
    expect(defaultLightThemeStyles.primary).toBeDefined();
    expect(defaultLightThemeStyles.secondary).toBeDefined();
  });

  it("has card styling", () => {
    expect(defaultLightThemeStyles.card).toBeDefined();
    expect(defaultLightThemeStyles["card-foreground"]).toBeDefined();
  });

  it("has sidebar styling", () => {
    expect(defaultLightThemeStyles.sidebar).toBeDefined();
    expect(defaultLightThemeStyles["sidebar-foreground"]).toBeDefined();
    expect(defaultLightThemeStyles["sidebar-primary"]).toBeDefined();
  });

  it("has font settings", () => {
    expect(defaultLightThemeStyles["font-sans"]).toBeDefined();
    expect(defaultLightThemeStyles["font-serif"]).toBeDefined();
    expect(defaultLightThemeStyles["font-mono"]).toBeDefined();
  });

  it("uses oklch color format", () => {
    expect(defaultLightThemeStyles.background).toContain("oklch");
    expect(defaultLightThemeStyles.primary).toContain("oklch");
  });

  it("has shadow properties", () => {
    expect(defaultLightThemeStyles["shadow-color"]).toBeDefined();
    expect(defaultLightThemeStyles["shadow-opacity"]).toBeDefined();
    expect(defaultLightThemeStyles["shadow-blur"]).toBeDefined();
  });

  it("has chart colors", () => {
    expect(defaultLightThemeStyles["chart-1"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-2"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-3"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-4"]).toBeDefined();
    expect(defaultLightThemeStyles["chart-5"]).toBeDefined();
  });
});

describe("defaultDarkThemeStyles", () => {
  it("is defined and is an object", () => {
    expect(defaultDarkThemeStyles).toBeDefined();
    expect(typeof defaultDarkThemeStyles).toBe("object");
  });

  it("extends light theme", () => {
    expect(defaultDarkThemeStyles["font-sans"]).toBe(
      defaultLightThemeStyles["font-sans"]
    );
    expect(defaultDarkThemeStyles.radius).toBe(defaultLightThemeStyles.radius);
  });

  it("has different background than light theme", () => {
    expect(defaultDarkThemeStyles.background).not.toBe(
      defaultLightThemeStyles.background
    );
  });

  it("has different foreground than light theme", () => {
    expect(defaultDarkThemeStyles.foreground).not.toBe(
      defaultLightThemeStyles.foreground
    );
  });

  it("uses oklch color format", () => {
    expect(defaultDarkThemeStyles.background).toContain("oklch");
    expect(defaultDarkThemeStyles.primary).toContain("oklch");
  });
});

describe("defaultThemeState", () => {
  it("is defined and is an object", () => {
    expect(defaultThemeState).toBeDefined();
    expect(typeof defaultThemeState).toBe("object");
  });

  it("has styles for both light and dark modes", () => {
    expect(defaultThemeState.styles).toBeDefined();
    expect(defaultThemeState.styles.light).toBeDefined();
    expect(defaultThemeState.styles.dark).toBeDefined();
  });

  it("defaults to light mode for SSR compatibility", () => {
    expect(defaultThemeState.currentMode).toBe("light");
  });

  it("defaults to oschat preset", () => {
    expect(defaultThemeState.preset).toBe("oschat");
  });

  it("has default hsl adjustments", () => {
    expect(defaultThemeState.hslAdjustments).toBeDefined();
    expect(defaultThemeState.hslAdjustments.hueShift).toBe(0);
    expect(defaultThemeState.hslAdjustments.saturationScale).toBe(1);
    expect(defaultThemeState.hslAdjustments.lightnessScale).toBe(1);
  });

  it("uses defaultLightThemeStyles for light mode", () => {
    expect(defaultThemeState.styles.light).toBe(defaultLightThemeStyles);
  });

  it("uses defaultDarkThemeStyles for dark mode", () => {
    expect(defaultThemeState.styles.dark).toBe(defaultDarkThemeStyles);
  });
});
