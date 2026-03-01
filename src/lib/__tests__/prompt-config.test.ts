import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  EMAIL_PROMPT_INSTRUCTIONS,
  FORMATTING_RULES,
  getSystemPromptDefault,
  getTaskPromptDefault,
  PERSONAS,
  PERSONAS_MAP,
  SEARCH_PROMPT_INSTRUCTIONS,
  TOOL_PROMPT_INSTRUCTIONS,
} from "../prompt_config";

describe("PERSONAS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(PERSONAS)).toBe(true);
    expect(PERSONAS.length).toBeGreaterThan(0);
  });

  it("each persona has required properties", () => {
    for (const persona of PERSONAS) {
      expect(persona.id).toBeDefined();
      expect(typeof persona.id).toBe("string");
      expect(persona.label).toBeDefined();
      expect(typeof persona.label).toBe("string");
      expect(persona.prompt).toBeDefined();
      expect(typeof persona.prompt).toBe("string");
      expect(persona.icon).toBeDefined();
    }
  });

  it("includes expected personas", () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(ids).toContain("companion");
    expect(ids).toContain("researcher");
    expect(ids).toContain("teacher");
    expect(ids).toContain("software-engineer");
  });

  it("personas have unique ids", () => {
    const ids = PERSONAS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("PERSONAS_MAP", () => {
  it("is an object with persona entries", () => {
    expect(typeof PERSONAS_MAP).toBe("object");
    expect(Object.keys(PERSONAS_MAP).length).toBe(PERSONAS.length);
  });

  it("provides O(1) lookup by id", () => {
    expect(PERSONAS_MAP.companion).toBeDefined();
    expect(PERSONAS_MAP.companion.label).toBe("Companion");
  });

  it("contains all personas from array", () => {
    for (const persona of PERSONAS) {
      expect(PERSONAS_MAP[persona.id]).toBe(persona);
    }
  });
});

describe("FORMATTING_RULES", () => {
  it("is a non-empty string", () => {
    expect(typeof FORMATTING_RULES).toBe("string");
    expect(FORMATTING_RULES.length).toBeGreaterThan(0);
  });

  it("contains LaTeX formatting rules", () => {
    expect(FORMATTING_RULES).toContain("LaTeX");
  });

  it("contains code formatting rules", () => {
    expect(FORMATTING_RULES).toContain("Code Formatting");
  });
});

describe("SEARCH_PROMPT_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof SEARCH_PROMPT_INSTRUCTIONS).toBe("string");
    expect(SEARCH_PROMPT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains web search guidelines", () => {
    expect(SEARCH_PROMPT_INSTRUCTIONS).toContain("web_search");
  });
});

describe("TOOL_PROMPT_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof TOOL_PROMPT_INSTRUCTIONS).toBe("string");
    expect(TOOL_PROMPT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains tool calling instructions", () => {
    expect(TOOL_PROMPT_INSTRUCTIONS).toContain("tool_calling");
  });
});

describe("EMAIL_PROMPT_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof EMAIL_PROMPT_INSTRUCTIONS).toBe("string");
    expect(EMAIL_PROMPT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains email formatting instructions", () => {
    expect(EMAIL_PROMPT_INSTRUCTIONS).toContain("email_formatting");
  });
});

describe("getSystemPromptDefault", () => {
  it("returns a non-empty string", () => {
    const result = getSystemPromptDefault();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains OS Chat identity", () => {
    const result = getSystemPromptDefault();
    expect(result).toContain("OS Chat");
  });

  it("contains date context", () => {
    const result = getSystemPromptDefault();
    expect(result).toContain("current date");
  });

  it("accepts timezone parameter", () => {
    const result = getSystemPromptDefault("America/New_York");
    expect(typeof result).toBe("string");
  });

  it("accepts connectors status", () => {
    const status = {
      enabled: ["GMAIL"],
      disabled: ["SLACK"],
      notConnected: ["NOTION"],
    };
    const result = getSystemPromptDefault(undefined, status);
    expect(result).toContain("GMAIL");
  });
});

describe("getTaskPromptDefault", () => {
  it("returns a non-empty string", () => {
    const result = getTaskPromptDefault();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains autonomous execution context", () => {
    const result = getTaskPromptDefault();
    expect(result).toContain("autonomous");
  });

  it("contains scheduled task reference", () => {
    const result = getTaskPromptDefault();
    expect(result).toContain("scheduled task");
  });
});

describe("buildSystemPrompt", () => {
  it("returns default prompt when no user provided", () => {
    const result = buildSystemPrompt();
    expect(result).toContain("OS Chat");
    expect(result).toContain(FORMATTING_RULES);
  });

  it("uses custom base prompt when provided", () => {
    const result = buildSystemPrompt(null, "Custom prompt");
    expect(result).toContain("Custom prompt");
    expect(result).toContain(FORMATTING_RULES);
  });

  it("adds search instructions when enabled", () => {
    const result = buildSystemPrompt(null, undefined, true);
    expect(result).toContain("web_search");
  });

  it("does not add search instructions when disabled", () => {
    const result = buildSystemPrompt(null, undefined, false);
    expect(result).not.toContain("web_search_capability");
  });

  it("adds tool instructions when enabled", () => {
    const result = buildSystemPrompt(null, undefined, false, true);
    expect(result).toContain("tool_calling");
  });

  it("adds email instructions when enabled", () => {
    const result = buildSystemPrompt(null, undefined, false, false, undefined, true);
    expect(result).toContain("email_formatting");
  });

  it("adds timezone when provided", () => {
    const result = buildSystemPrompt(null, undefined, false, false, "America/New_York");
    expect(result).toContain("America/New_York");
  });

  it("uses task prompt in task mode", () => {
    const result = buildSystemPrompt(
      null,
      undefined,
      false,
      false,
      "America/New_York",
      false,
      true,
    );
    expect(result).toContain("scheduled task");
  });

  it("adds user details when user provided", () => {
    const user = {
      name: "John Doe",
      preferredName: "John",
      occupation: "Developer",
      traits: "friendly",
      about: "Loves coding",
    };
    const result = buildSystemPrompt(user as never);
    expect(result).toContain("Name: John Doe");
    expect(result).toContain("Preferred Name: John");
    expect(result).toContain("Occupation: Developer");
    expect(result).toContain("Traits: friendly");
    expect(result).toContain("About: Loves coding");
  });

  it("handles user with partial details", () => {
    const user = {
      name: "Jane",
    };
    const result = buildSystemPrompt(user as never);
    expect(result).toContain("Name: Jane");
    expect(result).not.toContain("Preferred Name:");
  });

  it("prefers profile fields and falls back to user fields", () => {
    const user = {
      name: "Jane Doe",
      preferredName: "Jane",
      occupation: "Engineer",
      traits: "curious",
      about: "Likes robotics",
    };
    const profile = {
      preferredName: "JD",
      traits: "focused",
    };
    const result = buildSystemPrompt(
      user as never,
      undefined,
      false,
      false,
      undefined,
      false,
      false,
      undefined,
      profile,
    );

    expect(result).toContain("Name: Jane Doe");
    expect(result).toContain("Preferred Name: JD");
    expect(result).toContain("Occupation: Engineer");
    expect(result).toContain("Traits: focused");
    expect(result).toContain("About: Likes robotics");
  });
});
