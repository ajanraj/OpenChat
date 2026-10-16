import { describe, expect, it } from "vitest";
import {
  getSupportedConnectorsWithPrompts,
  getToolSpecificPrompts,
  TOOL_SPECIFIC_PROMPTS,
} from "../prompt-tool-config";

describe("TOOL_SPECIFIC_PROMPTS", () => {
  it("is defined and has entries", () => {
    expect(TOOL_SPECIFIC_PROMPTS).toBeDefined();
    expect(typeof TOOL_SPECIFIC_PROMPTS).toBe("object");
  });

  it("has notion prompt configuration", () => {
    expect(TOOL_SPECIFIC_PROMPTS.notion).toBeDefined();
    expect(TOOL_SPECIFIC_PROMPTS.notion.content).toContain("Notion");
    expect(TOOL_SPECIFIC_PROMPTS.notion.connectors).toContain("notion");
  });

  it("has gmail prompt configuration", () => {
    expect(TOOL_SPECIFIC_PROMPTS.gmail).toBeDefined();
    expect(TOOL_SPECIFIC_PROMPTS.gmail.content).toContain("Gmail");
    expect(TOOL_SPECIFIC_PROMPTS.gmail.connectors).toContain("gmail");
  });

  it("has googleCalendar prompt configuration", () => {
    expect(TOOL_SPECIFIC_PROMPTS.googleCalendar).toBeDefined();
    expect(TOOL_SPECIFIC_PROMPTS.googleCalendar.content).toContain("calendar");
    expect(TOOL_SPECIFIC_PROMPTS.googleCalendar.connectors).toContain("googlecalendar");
  });

  it("has googleWorkspace prompt configuration", () => {
    expect(TOOL_SPECIFIC_PROMPTS.googleWorkspace).toBeDefined();
    expect(TOOL_SPECIFIC_PROMPTS.googleWorkspace.content).toContain("Google Docs");
    expect(TOOL_SPECIFIC_PROMPTS.googleWorkspace.connectors).toContain("googledocs");
    expect(TOOL_SPECIFIC_PROMPTS.googleWorkspace.connectors).toContain("googlesheets");
  });

  it("each tool prompt has required properties", () => {
    for (const [_key, toolPrompt] of Object.entries(TOOL_SPECIFIC_PROMPTS)) {
      expect(toolPrompt.content).toBeDefined();
      expect(typeof toolPrompt.content).toBe("string");
      expect(toolPrompt.content.length).toBeGreaterThan(0);

      expect(toolPrompt.connectors).toBeDefined();
      expect(Array.isArray(toolPrompt.connectors)).toBe(true);
      expect(toolPrompt.connectors.length).toBeGreaterThan(0);
    }
  });
});

describe("getToolSpecificPrompts", () => {
  it("returns empty string for empty toolkits array", () => {
    const result = getToolSpecificPrompts([]);

    expect(result).toBe("");
  });

  it("returns empty string for unknown toolkits", () => {
    const result = getToolSpecificPrompts(["unknown", "nonexistent"]);

    expect(result).toBe("");
  });

  it("returns notion prompt for notion toolkit", () => {
    const result = getToolSpecificPrompts(["notion"]);

    expect(result).toContain("Notion");
    expect(result).toContain("notion_information");
  });

  it("returns gmail prompt for gmail toolkit", () => {
    const result = getToolSpecificPrompts(["gmail"]);

    expect(result).toContain("Gmail");
    expect(result).toContain("gmail_information");
  });

  it("returns calendar prompt for googlecalendar toolkit", () => {
    const result = getToolSpecificPrompts(["googlecalendar"]);

    expect(result).toContain("calendar");
    expect(result).toContain("google_calendar_guidelines");
  });

  it("returns workspace prompt for googledocs toolkit", () => {
    const result = getToolSpecificPrompts(["googledocs"]);

    expect(result).toContain("Google Docs");
    expect(result).toContain("google_workspace_guidelines");
  });

  it("returns workspace prompt for googlesheets toolkit", () => {
    const result = getToolSpecificPrompts(["googlesheets"]);

    expect(result).toContain("google_workspace_guidelines");
  });

  it("is case-insensitive for toolkit names", () => {
    const lowerResult = getToolSpecificPrompts(["notion"]);
    const upperResult = getToolSpecificPrompts(["NOTION"]);

    expect(lowerResult).toBe(upperResult);
  });

  it("returns combined prompts for multiple toolkits", () => {
    const result = getToolSpecificPrompts(["notion", "gmail"]);

    expect(result).toContain("Notion");
    expect(result).toContain("Gmail");
  });

  it("includes prompt when multiple toolkits match same config", () => {
    const result = getToolSpecificPrompts(["googledocs", "googlesheets"]);

    // Both googledocs and googlesheets trigger the googleWorkspace prompt
    expect(result).toContain("google_workspace_guidelines");
  });
});

describe("getSupportedConnectorsWithPrompts", () => {
  it("returns an array", () => {
    const result = getSupportedConnectorsWithPrompts();

    expect(Array.isArray(result)).toBe(true);
  });

  it("includes all connectors from tool prompts", () => {
    const result = getSupportedConnectorsWithPrompts();

    expect(result).toContain("notion");
    expect(result).toContain("gmail");
    expect(result).toContain("googlecalendar");
    expect(result).toContain("googledocs");
    expect(result).toContain("googlesheets");
  });

  it("returns unique connector types", () => {
    const result = getSupportedConnectorsWithPrompts();
    const uniqueResult = new Set(result);

    expect(result).toHaveLength(uniqueResult.size);
  });

  it("returns non-empty array", () => {
    const result = getSupportedConnectorsWithPrompts();

    expect(result.length).toBeGreaterThan(0);
  });
});
