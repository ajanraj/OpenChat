import { describe, expect, it } from "vitest";

import { themeStylePropsSchema, themeStylesSchema } from "../theme";

const omitKey = (
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

const validThemeProps = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.141 0.005 285.823)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.141 0.005 285.823)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.141 0.005 285.823)",
  primary: "oklch(0.21 0.006 285.885)",
  "primary-foreground": "oklch(0.985 0 0)",
  secondary: "oklch(0.967 0.001 286.375)",
  "secondary-foreground": "oklch(0.21 0.006 285.885)",
  muted: "oklch(0.967 0.001 286.375)",
  "muted-foreground": "oklch(0.552 0.016 285.938)",
  accent: "oklch(0.967 0.001 286.375)",
  "accent-foreground": "oklch(0.21 0.006 285.885)",
  destructive: "oklch(0.577 0.245 27.325)",
  "destructive-foreground": "oklch(0.577 0.245 27.325)",
  border: "oklch(0.92 0.004 286.32)",
  input: "oklch(0.92 0.004 286.32)",
  ring: "oklch(0.705 0.015 286.067)",
  "chart-1": "oklch(0.646 0.222 41.116)",
  "chart-2": "oklch(0.6 0.118 184.704)",
  "chart-3": "oklch(0.398 0.07 227.392)",
  "chart-4": "oklch(0.828 0.189 84.429)",
  "chart-5": "oklch(0.769 0.188 70.08)",
  radius: "0.625rem",
  sidebar: "oklch(0.985 0 0)",
  "sidebar-foreground": "oklch(0.141 0.005 285.823)",
  "sidebar-primary": "oklch(0.21 0.006 285.885)",
  "sidebar-primary-foreground": "oklch(0.985 0 0)",
  "sidebar-accent": "oklch(0.967 0.001 286.375)",
  "sidebar-accent-foreground": "oklch(0.21 0.006 285.885)",
  "sidebar-border": "oklch(0.92 0.004 286.32)",
  "sidebar-ring": "oklch(0.705 0.015 286.067)",
  "font-sans": "Geist, ui-sans-serif, system-ui, sans-serif",
  "font-serif": "serif",
  "font-mono": "'Geist Mono', ui-monospace, monospace",
  "shadow-color": "oklch(0 0 0)",
  "shadow-opacity": "0.1",
  "shadow-blur": "3px",
  "shadow-spread": "0px",
  "shadow-offset-x": "0",
  "shadow-offset-y": "1px",
  "letter-spacing": "0em",
  spacing: "0.25rem",
};

describe("themeStylePropsSchema validation", () => {
  it("parses valid theme props", () => {
    const result = themeStylePropsSchema.safeParse(validThemeProps);
    expect(result.success).toBeTruthy();
  });

  it("requires all color properties", () => {
    const incomplete = { background: "white" };
    const result = themeStylePropsSchema.safeParse(incomplete);
    expect(result.success).toBeFalsy();
  });

  it("requires string values for colors", () => {
    const invalid = { ...validThemeProps, background: 123 };
    const result = themeStylePropsSchema.safeParse(invalid);
    expect(result.success).toBeFalsy();
  });

  it("requires chart colors", () => {
    const withoutCharts = omitKey(validThemeProps, "chart-1");
    const result = themeStylePropsSchema.safeParse(withoutCharts);
    expect(result.success).toBeFalsy();
  });

  it("requires sidebar properties", () => {
    const withoutSidebar = omitKey(validThemeProps, "sidebar");
    const result = themeStylePropsSchema.safeParse(withoutSidebar);
    expect(result.success).toBeFalsy();
  });

  it("requires font properties", () => {
    const withoutFonts = omitKey(validThemeProps, "font-sans");
    const result = themeStylePropsSchema.safeParse(withoutFonts);
    expect(result.success).toBeFalsy();
  });

  it("requires shadow properties", () => {
    const withoutShadow = omitKey(validThemeProps, "shadow-color");
    const result = themeStylePropsSchema.safeParse(withoutShadow);
    expect(result.success).toBeFalsy();
  });
});

describe("themeStylesSchema validation", () => {
  it("parses valid theme styles with light and dark", () => {
    const styles = {
      light: validThemeProps,
      dark: { ...validThemeProps, background: "oklch(0.2 0 0)" },
    };
    const result = themeStylesSchema.safeParse(styles);
    expect(result.success).toBeTruthy();
  });

  it("requires both light and dark modes", () => {
    const lightOnly = { light: validThemeProps };
    const result = themeStylesSchema.safeParse(lightOnly);
    expect(result.success).toBeFalsy();
  });

  it("requires light mode", () => {
    const darkOnly = { dark: validThemeProps };
    const result = themeStylesSchema.safeParse(darkOnly);
    expect(result.success).toBeFalsy();
  });
});
