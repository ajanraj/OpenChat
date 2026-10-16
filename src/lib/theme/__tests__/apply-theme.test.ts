import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThemeEditorState } from "../../types/theme";
import { applyThemeToElement } from "../apply-theme";

// Mock minimal theme styles for testing
const mockLightStyles = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.141 0.005 285.823)",
  primary: "oklch(0.21 0.006 285.885)",
  radius: "0.5rem",
  "font-sans": "Geist, sans-serif",
  "font-mono": "'Geist Mono', monospace",
};

const mockDarkStyles = {
  background: "oklch(0.2 0 0)",
  foreground: "oklch(0.985 0 0)",
  primary: "oklch(0.8 0.006 285.885)",
  radius: "0.5rem",
  "font-sans": "Geist, sans-serif",
  "font-mono": "'Geist Mono', monospace",
};

// Default HSL adjustments for tests
const defaultHslAdjustments = {
  hueShift: 0,
  saturationScale: 1,
  lightnessScale: 1,
};

// Helper to create a valid ThemeEditorState
const createThemeState = (
  overrides: Partial<ThemeEditorState> = {}
): ThemeEditorState => ({
  currentMode: "light",
  styles: {
    light: mockLightStyles as never,
    dark: mockDarkStyles as never,
  },
  hslAdjustments: defaultHslAdjustments,
  ...overrides,
});

describe("applyThemeToElement", () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    mockElement = document.createElement("div");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when rootElement is null/undefined", () => {
    const themeState = createThemeState();

    // Should not throw
    expect(() => {
      applyThemeToElement(themeState, null as unknown as HTMLElement);
    }).not.toThrow();
  });

  it("applies light mode class correctly", () => {
    const themeState = createThemeState({ currentMode: "light" });
    mockElement.classList.add("dark");

    applyThemeToElement(themeState, mockElement);

    expect(mockElement.classList.contains("dark")).toBe(false);
  });

  it("applies dark mode class correctly", () => {
    const themeState = createThemeState({ currentMode: "dark" });

    applyThemeToElement(themeState, mockElement);

    expect(mockElement.classList.contains("dark")).toBe(true);
  });

  it("sets color CSS variables for light mode", () => {
    const themeState = createThemeState({ currentMode: "light" });

    applyThemeToElement(themeState, mockElement);

    expect(mockElement.style.getPropertyValue("--background")).toBe(
      "oklch(1 0 0)"
    );
    expect(mockElement.style.getPropertyValue("--foreground")).toBe(
      "oklch(0.141 0.005 285.823)"
    );
  });

  it("sets color CSS variables for dark mode", () => {
    const themeState = createThemeState({ currentMode: "dark" });

    applyThemeToElement(themeState, mockElement);

    expect(mockElement.style.getPropertyValue("--background")).toBe(
      "oklch(0.2 0 0)"
    );
    expect(mockElement.style.getPropertyValue("--foreground")).toBe(
      "oklch(0.985 0 0)"
    );
  });

  it("sets common styles like radius", () => {
    const themeState = createThemeState({ currentMode: "light" });

    applyThemeToElement(themeState, mockElement);

    expect(mockElement.style.getPropertyValue("--radius")).toBe("0.5rem");
  });

  it("sets active font variables", () => {
    const themeState = createThemeState({ currentMode: "light" });

    applyThemeToElement(themeState, mockElement);

    // Should set --active-font-sans and --active-font-mono
    const activeSans = mockElement.style.getPropertyValue("--active-font-sans");
    const activeMono = mockElement.style.getPropertyValue("--active-font-mono");

    expect(activeSans.length).toBeGreaterThan(0);
    expect(activeMono.length).toBeGreaterThan(0);
  });

  it("handles themes with Geist fonts", () => {
    const themeState = createThemeState({
      currentMode: "light",
      styles: {
        light: {
          ...mockLightStyles,
          "font-sans": "Geist, ui-sans-serif, system-ui, sans-serif",
          "font-mono": "'Geist Mono', ui-monospace, monospace",
        } as never,
        dark: mockDarkStyles as never,
      },
    });

    applyThemeToElement(themeState, mockElement);

    const activeSans = mockElement.style.getPropertyValue("--active-font-sans");
    expect(activeSans).toContain("--font-geist-sans");
  });

  it("handles themes with Inter font", () => {
    const themeState = createThemeState({
      currentMode: "light",
      styles: {
        light: {
          ...mockLightStyles,
          "font-sans": "Inter, ui-sans-serif, sans-serif",
        } as never,
        dark: mockDarkStyles as never,
      },
    });

    applyThemeToElement(themeState, mockElement);

    const activeSans = mockElement.style.getPropertyValue("--active-font-sans");
    expect(activeSans).toContain("--font-inter");
  });

  it("handles themes with JetBrains Mono font", () => {
    const themeState = createThemeState({
      currentMode: "light",
      styles: {
        light: {
          ...mockLightStyles,
          "font-mono": "'JetBrains Mono', ui-monospace, monospace",
        } as never,
        dark: mockDarkStyles as never,
      },
    });

    applyThemeToElement(themeState, mockElement);

    const activeMono = mockElement.style.getPropertyValue("--active-font-mono");
    expect(activeMono).toContain("--font-jetbrains-mono");
  });

  it("handles unknown fonts by using original value", () => {
    const themeState = createThemeState({
      currentMode: "light",
      styles: {
        light: {
          ...mockLightStyles,
          "font-sans": "CustomFont, sans-serif",
        } as never,
        dark: mockDarkStyles as never,
      },
    });

    applyThemeToElement(themeState, mockElement);

    const activeSans = mockElement.style.getPropertyValue("--active-font-sans");
    expect(activeSans).toBe("CustomFont, sans-serif");
  });

  it("switches from dark to light mode correctly", () => {
    mockElement.classList.add("dark");

    const lightState = createThemeState({ currentMode: "light" });

    applyThemeToElement(lightState, mockElement);

    expect(mockElement.classList.contains("dark")).toBe(false);
  });

  it("switches from light to dark mode correctly", () => {
    const darkState = createThemeState({ currentMode: "dark" });

    applyThemeToElement(darkState, mockElement);

    expect(mockElement.classList.contains("dark")).toBe(true);
  });
});
