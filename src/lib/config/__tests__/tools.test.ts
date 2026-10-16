import { describe, expect, it } from "vitest";

import {
  CONNECTOR_CONFIGS,
  CONNECTOR_TOOL_NAMES,
  getConnectorConfig,
  getConnectorTypeFromToolName,
  isConnectorTool,
  SUPPORTED_CONNECTORS,
} from "../tools";

describe("CONNECTOR_CONFIGS", () => {
  it("is defined and has entries", () => {
    expect(CONNECTOR_CONFIGS).toBeDefined();
    expect(typeof CONNECTOR_CONFIGS).toBe("object");
  });

  it("contains gmail config", () => {
    expect(CONNECTOR_CONFIGS.gmail).toBeDefined();
    expect(CONNECTOR_CONFIGS.gmail.displayName).toBe("Gmail");
  });

  it("contains google calendar config", () => {
    expect(CONNECTOR_CONFIGS.googlecalendar).toBeDefined();
    expect(CONNECTOR_CONFIGS.googlecalendar.displayName).toBe(
      "Google Calendar"
    );
  });

  it("each connector config has required properties", () => {
    for (const config of Object.values(CONNECTOR_CONFIGS)) {
      expect(config.type).toBeDefined();
      expect(config.displayName).toBeDefined();
      expect(config.icon).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.authConfigId).toBeDefined();
    }
  });
});

describe("SUPPORTED_CONNECTORS", () => {
  it("is an array of connector types", () => {
    expect(Array.isArray(SUPPORTED_CONNECTORS)).toBe(true);
    expect(SUPPORTED_CONNECTORS.length).toBeGreaterThan(0);
  });

  it("contains expected connectors", () => {
    expect(SUPPORTED_CONNECTORS).toContain("gmail");
    expect(SUPPORTED_CONNECTORS).toContain("googlecalendar");
    expect(SUPPORTED_CONNECTORS).toContain("notion");
    expect(SUPPORTED_CONNECTORS).toContain("slack");
    expect(SUPPORTED_CONNECTORS).toContain("github");
  });
});

describe("CONNECTOR_TOOL_NAMES", () => {
  it("equals SUPPORTED_CONNECTORS", () => {
    expect(CONNECTOR_TOOL_NAMES).toBe(SUPPORTED_CONNECTORS);
  });
});

describe("getConnectorConfig", () => {
  it("returns config for valid connector type", () => {
    const config = getConnectorConfig("gmail");

    expect(config.type).toBe("gmail");
    expect(config.displayName).toBe("Gmail");
  });

  it("returns config for googlecalendar", () => {
    const config = getConnectorConfig("googlecalendar");

    expect(config.type).toBe("googlecalendar");
    expect(config.displayName).toBe("Google Calendar");
  });

  it("throws for invalid connector type", () => {
    expect(() => getConnectorConfig("invalid" as unknown as "gmail")).toThrow(
      "Unknown connector type: invalid"
    );
  });
});

describe("isConnectorTool", () => {
  it("returns true for direct connector names", () => {
    expect(isConnectorTool("gmail")).toBe(true);
    expect(isConnectorTool("slack")).toBe(true);
    expect(isConnectorTool("github")).toBe(true);
  });

  it("returns true for tool names containing connector types", () => {
    expect(isConnectorTool("GMAIL_SEND_EMAIL")).toBe(true);
    expect(isConnectorTool("slack_post_message")).toBe(true);
    expect(isConnectorTool("GITHUB_CREATE_ISSUE")).toBe(true);
  });

  it("returns true for alternative patterns", () => {
    expect(isConnectorTool("calendar")).toBe(true);
    expect(isConnectorTool("drive")).toBe(true);
    expect(isConnectorTool("docs")).toBe(true);
    expect(isConnectorTool("sheets")).toBe(true);
  });

  it("returns false for non-connector tools", () => {
    expect(isConnectorTool("web_search")).toBe(false);
    expect(isConnectorTool("calculator")).toBe(false);
    expect(isConnectorTool("random_tool")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isConnectorTool("GMAIL")).toBe(true);
    expect(isConnectorTool("Gmail")).toBe(true);
    expect(isConnectorTool("SLACK")).toBe(true);
  });
});

describe("getConnectorTypeFromToolName", () => {
  it("returns correct type for direct connector names", () => {
    expect(getConnectorTypeFromToolName("gmail")).toBe("gmail");
    expect(getConnectorTypeFromToolName("slack")).toBe("slack");
    expect(getConnectorTypeFromToolName("notion")).toBe("notion");
  });

  it("returns correct type for tool names with prefixes", () => {
    expect(getConnectorTypeFromToolName("GMAIL_SEND_EMAIL")).toBe("gmail");
    expect(getConnectorTypeFromToolName("SLACK_POST_MESSAGE")).toBe("slack");
  });

  it("returns correct type for alternative patterns", () => {
    expect(getConnectorTypeFromToolName("calendar_create_event")).toBe(
      "googlecalendar"
    );
    expect(getConnectorTypeFromToolName("drive_list_files")).toBe(
      "googledrive"
    );
  });

  it("is case insensitive", () => {
    expect(getConnectorTypeFromToolName("GMAIL")).toBe("gmail");
    expect(getConnectorTypeFromToolName("Gmail")).toBe("gmail");
  });

  it("throws for unknown tool names", () => {
    expect(() => getConnectorTypeFromToolName("web_search")).toThrow(
      "Unable to determine connector type"
    );
    expect(() => getConnectorTypeFromToolName("calculator")).toThrow(
      "Unable to determine connector type"
    );
  });
});
