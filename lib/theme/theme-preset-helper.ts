import { defaultThemeState } from "../config/theme";
import type { ThemeStyles } from "../types/theme";
import { defaultPresets } from "./theme-presets";

export function getPresetThemeStyles(presetName?: string): ThemeStyles {
  if (!(presetName && defaultPresets[presetName])) {
    return defaultThemeState.styles;
  }

  const preset = defaultPresets[presetName];

  // Merge preset styles with defaults to ensure all required properties are present
  return {
    light: { ...defaultThemeState.styles.light, ...preset.styles.light },
    dark: { ...defaultThemeState.styles.dark, ...preset.styles.dark },
  };
}
