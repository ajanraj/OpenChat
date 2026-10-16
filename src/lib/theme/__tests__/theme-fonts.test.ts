import { describe, expect, it } from "vitest";

import {
  getCurrentFontSelection,
  getFontOptions,
  hasCustomFonts,
  isUsingSystemFonts,
  MONO_FONTS,
  SANS_FONTS,
  updateThemeFont,
} from "../theme-fonts";

describe("SANS_FONTS", () => {
  it("is an array of font options", () => {
    expect(Array.isArray(SANS_FONTS)).toBe(true);
    expect(SANS_FONTS.length).toBeGreaterThan(0);
  });

  it("first option is system default", () => {
    expect(SANS_FONTS[0].label).toBe("System Default");
    expect(SANS_FONTS[0].isSystem).toBe(true);
  });

  it("each font has required properties", () => {
    for (const font of SANS_FONTS) {
      expect(font.label).toBeDefined();
      expect(font.value).toBeDefined();
      expect(typeof font.isSystem).toBe("boolean");
    }
  });

  it("includes common fonts", () => {
    const labels = SANS_FONTS.map((f) => f.label);
    expect(labels).toContain("Geist");
    expect(labels).toContain("Inter");
  });
});

describe("MONO_FONTS", () => {
  it("is an array of font options", () => {
    expect(Array.isArray(MONO_FONTS)).toBe(true);
    expect(MONO_FONTS.length).toBeGreaterThan(0);
  });

  it("first option is system mono", () => {
    expect(MONO_FONTS[0].label).toBe("System Mono");
    expect(MONO_FONTS[0].isSystem).toBe(true);
  });

  it("each font has required properties", () => {
    for (const font of MONO_FONTS) {
      expect(font.label).toBeDefined();
      expect(font.value).toBeDefined();
      expect(typeof font.isSystem).toBe("boolean");
    }
  });

  it("includes common mono fonts", () => {
    const labels = MONO_FONTS.map((f) => f.label);
    expect(labels).toContain("Geist Mono");
    expect(labels).toContain("JetBrains Mono");
  });
});

describe("getFontOptions", () => {
  it("returns SANS_FONTS for sans category", () => {
    expect(getFontOptions("sans")).toBe(SANS_FONTS);
  });

  it("returns MONO_FONTS for mono category", () => {
    expect(getFontOptions("mono")).toBe(MONO_FONTS);
  });

  it("throws for unknown category", () => {
    expect(() => getFontOptions("serif" as "sans")).toThrow(
      "Unknown font category"
    );
  });
});

describe("getCurrentFontSelection", () => {
  it("returns system font when no font is set", () => {
    const result = getCurrentFontSelection({}, "sans");

    expect(result.isSystem).toBe(true);
    expect(result.label).toBe("System Default");
  });

  it("returns matching font when font is set", () => {
    const styles = {
      "font-sans": "Geist, ui-sans-serif, system-ui, sans-serif",
    };

    const result = getCurrentFontSelection(styles, "sans");

    expect(result.label).toBe("Geist");
    expect(result.isSystem).toBe(false);
  });

  it("returns system font for unknown font value", () => {
    const styles = {
      "font-sans": "Unknown Font, sans-serif",
    };

    const result = getCurrentFontSelection(styles, "sans");

    expect(result.isSystem).toBe(true);
  });

  it("works for mono fonts", () => {
    const styles = {
      "font-mono": "'JetBrains Mono', ui-monospace, monospace",
    };

    const result = getCurrentFontSelection(styles, "mono");

    expect(result.label).toBe("JetBrains Mono");
  });
});

describe("hasCustomFonts", () => {
  it("returns false when using all system fonts", () => {
    const styles = {};

    expect(hasCustomFonts(styles)).toBe(false);
  });

  it("returns true when using custom sans font", () => {
    const styles = {
      "font-sans": "Geist, ui-sans-serif, system-ui, sans-serif",
    };

    expect(hasCustomFonts(styles)).toBe(true);
  });

  it("returns true when using custom mono font", () => {
    const styles = {
      "font-mono": "'JetBrains Mono', ui-monospace, monospace",
    };

    expect(hasCustomFonts(styles)).toBe(true);
  });
});

describe("updateThemeFont", () => {
  it("updates sans font", () => {
    const original = { background: "white" };
    const font = SANS_FONTS[1];

    const result = updateThemeFont(original, "sans", font);

    expect(result["font-sans"]).toBe(font.value);
    expect(result.background).toBe("white");
  });

  it("updates mono font", () => {
    const original = { background: "white" };
    const font = MONO_FONTS[1];

    const result = updateThemeFont(original, "mono", font);

    expect(result["font-mono"]).toBe(font.value);
  });

  it("preserves other properties", () => {
    const original = {
      background: "white",
      foreground: "black",
      "font-sans": "old",
    };
    const font = SANS_FONTS[1];

    const result = updateThemeFont(original, "sans", font);

    expect(result.background).toBe("white");
    expect(result.foreground).toBe("black");
    expect(result["font-sans"]).toBe(font.value);
  });
});

describe("isUsingSystemFonts", () => {
  it("returns true when using both system fonts", () => {
    const styles = {
      "font-sans": SANS_FONTS[0].value,
      "font-mono": MONO_FONTS[0].value,
    };

    expect(isUsingSystemFonts(styles)).toBe(true);
  });

  it("returns false when using custom sans font", () => {
    const styles = {
      "font-sans": "Geist, sans-serif",
      "font-mono": MONO_FONTS[0].value,
    };

    expect(isUsingSystemFonts(styles)).toBe(false);
  });

  it("returns false when using custom mono font", () => {
    const styles = {
      "font-sans": SANS_FONTS[0].value,
      "font-mono": "'JetBrains Mono', monospace",
    };

    expect(isUsingSystemFonts(styles)).toBe(false);
  });

  it("returns false when both fonts are custom", () => {
    const styles = {
      "font-sans": "Geist, sans-serif",
      "font-mono": "'JetBrains Mono', monospace",
    };

    expect(isUsingSystemFonts(styles)).toBe(false);
  });
});
