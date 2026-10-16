import { defaultThemeState } from "../config/theme";
import type { ThemeStyles } from "../types/theme";
import { defaultPresets } from "./theme-presets";

export const getPresetThemeStyles = (presetName?: string): ThemeStyles => {
  const preset =
    presetName === undefined || presetName === ""
      ? undefined
      : defaultPresets[presetName];
  if (preset === undefined) {
    return defaultThemeState.styles;
  }

  // Merge preset styles with defaults to ensure all required properties are present
  return {
    light: { ...defaultThemeState.styles.light, ...preset.styles.light },
    dark: { ...defaultThemeState.styles.dark, ...preset.styles.dark },
  };
};
