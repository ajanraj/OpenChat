import type { ThemeStyleProps } from "../types/theme";

// Font type definitions following ultracite guidelines
export type FontCategory = "sans" | "mono";

export type FontOption = {
  readonly label: string;
  readonly value: string;
  readonly isSystem: boolean;
};

// System font values from existing presets - these are the defaults
const SYSTEM_SANS_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";
const SYSTEM_MONO_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// Sans-serif font options as requested
export const SANS_FONTS: readonly FontOption[] = [
  {
    label: "System Default",
    value: SYSTEM_SANS_FONT,
    isSystem: true,
  },
  {
    label: "Geist",
    value: "Geist, ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "Inter",
    value: "Inter, ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "Space Grotesk",
    value: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "Open Sans",
    value: "'Open Sans', ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "Atkinson Hyperlegible",
    value: "'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "Architects Daughter",
    value: "'Architects Daughter', ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
  {
    label: "DM Sans",
    value: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    isSystem: false,
  },
] as const;

// Monospace font options as requested
export const MONO_FONTS: readonly FontOption[] = [
  {
    label: "System Mono",
    value: SYSTEM_MONO_FONT,
    isSystem: true,
  },
  {
    label: "Geist Mono",
    value: "'Geist Mono', ui-monospace, monospace",
    isSystem: false,
  },
  {
    label: "Fira Mono",
    value: "'Fira Mono', ui-monospace, monospace",
    isSystem: false,
  },
  {
    label: "JetBrains Mono",
    value: "'JetBrains Mono', ui-monospace, monospace",
    isSystem: false,
  },
  {
    label: "Atkinson Hyperlegible Mono",
    value: "'Atkinson Hyperlegible Mono', ui-monospace, monospace",
    isSystem: false,
  },
  {
    label: "IBM Plex Mono",
    value: "'IBM Plex Mono', ui-monospace, monospace",
    isSystem: false,
  },
] as const;

// Get font options for a specific category
export function getFontOptions(category: FontCategory): readonly FontOption[] {
  switch (category) {
    case "sans":
      return SANS_FONTS;
    case "mono":
      return MONO_FONTS;
    default:
      // Using exhaustive switch with default case as per ultracite rules
      throw new Error(`Unknown font category: ${category}`);
  }
}

// Get current font selection for a theme property
export function getCurrentFontSelection(
  themeStyles: Partial<ThemeStyleProps>,
  category: FontCategory
): FontOption {
  const fontKey = category === "sans" ? "font-sans" : "font-mono";
  const currentValue = themeStyles[fontKey];
  const fontOptions = getFontOptions(category);

  // Find matching font option by comparing values
  const matchedFont = fontOptions.find((font) => font.value === currentValue);

  // Return matched font or default to system font (first option is always system)
  if (matchedFont) {
    return matchedFont;
  }

  const systemFont = fontOptions[0];
  if (!systemFont) {
    throw new Error(`No font options available for category: ${category}`);
  }

  return systemFont;
}

// Check if current theme has custom fonts (non-system fonts)
export function hasCustomFonts(themeStyles: Partial<ThemeStyleProps>): boolean {
  const sansFontSelection = getCurrentFontSelection(themeStyles, "sans");
  const monoFontSelection = getCurrentFontSelection(themeStyles, "mono");

  return !(sansFontSelection.isSystem && monoFontSelection.isSystem);
}

// Create new theme styles with updated font
export function updateThemeFont(
  currentStyles: Partial<ThemeStyleProps>,
  category: FontCategory,
  fontOption: FontOption
): Partial<ThemeStyleProps> {
  const fontKey = category === "sans" ? "font-sans" : "font-mono";

  return {
    ...currentStyles,
    [fontKey]: fontOption.value,
  };
}

// Check if a theme is using default/system fonts
export function isUsingSystemFonts(
  themeStyles: Partial<ThemeStyleProps>
): boolean {
  const sansFont = themeStyles["font-sans"];
  const monoFont = themeStyles["font-mono"];

  return sansFont === SYSTEM_SANS_FONT && monoFont === SYSTEM_MONO_FONT;
}
