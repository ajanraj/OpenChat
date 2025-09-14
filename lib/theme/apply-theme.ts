import { COMMON_STYLES } from "../config/theme";
import type {
  ThemeEditorState,
  ThemeStyleProps,
  ThemeStyles,
} from "../types/theme";

type Theme = "dark" | "light";

const COMMON_NON_COLOR_KEYS = COMMON_STYLES;

// Map primary font family names to next/font CSS variable names
const FONT_VAR_MAP: Readonly<Record<string, string>> = {
  Geist: "--font-geist-sans",
  "Geist Mono": "--font-geist-mono",
  Inter: "--font-inter",
  "Space Grotesk": "--font-space-grotesk",
  "Open Sans": "--font-open-sans",
  "DM Sans": "--font-dm-sans",
  "Architects Daughter": "--font-architects-daughter",
  "Atkinson Hyperlegible": "--font-atkinson-hyperlegible",
  "Atkinson Hyperlegible Mono": "--font-atkinson-hyperlegible-mono",
  "Fira Mono": "--font-fira-mono",
  "JetBrains Mono": "--font-jetbrains-mono",
  "IBM Plex Mono": "--font-ibm-plex-mono",
} as const;

// Normalize font keys for robust lookups: trim, strip quotes, collapse spaces, lowercase
const normalizeFontKey = (value: string): string =>
  value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

// Build a normalized map to allow case/spacing-insensitive lookups
const NORMALIZED_FONT_VAR_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(FONT_VAR_MAP).map(([k, v]) => [normalizeFontKey(k), v])
  )
);

const DEFAULT_FALLBACKS: Readonly<Record<"sans" | "mono", string>> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, monospace",
} as const;

const extractPrimaryAndRest = (
  familyList: string | undefined
): { primary: string | null; rest: string } => {
  if (!familyList) {
    return { primary: null, rest: "" };
  }
  const parts = familyList.split(",");
  const primaryRaw = parts[0]?.trim() ?? "";
  const primary = primaryRaw.replace(/^['"]|['"]$/g, "");
  const rest = parts.slice(1).join(",").trim();
  return { primary: primary || null, rest };
};

const buildActiveFontValue = (
  fullFamily: string | undefined,
  category: "sans" | "mono"
): string | null => {
  const { primary, rest } = extractPrimaryAndRest(fullFamily);
  if (!primary) {
    return null;
  }
  const varName = NORMALIZED_FONT_VAR_MAP[normalizeFontKey(primary)];
  if (!varName) {
    // Fallback to the original list if we don't have a mapped next/font variable
    return fullFamily ?? null;
  }
  const restList =
    rest.length > 0 ? `, ${rest}` : `, ${DEFAULT_FALLBACKS[category]}`;
  return `var(${varName})${restList}`;
};

// Helper functions (not exported, used internally by applyThemeToElement)
const updateThemeClass = (root: HTMLElement, mode: Theme) => {
  if (mode === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
  }
};

const applyStyleToElement = (
  element: HTMLElement,
  key: string,
  value: string | null | undefined
) => {
  if (value == null || value === "") {
    element.style.removeProperty(`--${key}`);
  } else {
    element.style.setProperty(`--${key}`, value);
  }
};

const applyCommonStyles = (root: HTMLElement, themeStyles: ThemeStyleProps) => {
  for (const [key, value] of Object.entries(themeStyles)) {
    if (
      COMMON_NON_COLOR_KEYS.includes(
        key as (typeof COMMON_NON_COLOR_KEYS)[number]
      ) &&
      typeof value === "string"
    ) {
      // Avoid overriding Tailwind v4 font tokens; fonts are driven via --active-font-*
      if (key === "font-sans" || key === "font-mono") {
        continue;
      }
      applyStyleToElement(root, key, value);
    }
  }
};

const applyThemeColors = (
  root: HTMLElement,
  themeStyles: ThemeStyles,
  mode: Theme
) => {
  for (const [key, value] of Object.entries(themeStyles[mode])) {
    if (
      typeof value === "string" &&
      !COMMON_NON_COLOR_KEYS.includes(
        key as (typeof COMMON_NON_COLOR_KEYS)[number]
      )
    ) {
      applyStyleToElement(root, key, value);
    }
  }
};

// Exported function to apply theme styles to an element
export const applyThemeToElement = (
  themeState: ThemeEditorState,
  rootElement: HTMLElement
) => {
  const { currentMode: mode, styles: themeStyles } = themeState;

  if (!rootElement) {
    return;
  }

  updateThemeClass(rootElement, mode);
  // Apply common styles (like border-radius) based on the 'light' mode definition
  applyCommonStyles(rootElement, themeStyles.light);
  // Apply mode-specific colors
  applyThemeColors(rootElement, themeStyles, mode);

  // Set active font variables to drive Tailwind v4 tokens via @theme inline
  const activeSans = buildActiveFontValue(
    themeStyles.light["font-sans"],
    "sans"
  );
  const activeMono = buildActiveFontValue(
    themeStyles.light["font-mono"],
    "mono"
  );
  applyStyleToElement(rootElement, "active-font-sans", activeSans);
  applyStyleToElement(rootElement, "active-font-mono", activeMono);
};
