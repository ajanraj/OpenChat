import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("composio-utils", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getAuthConfigId", () => {
    it("returns gmail auth config from env", async () => {
      process.env.VITE_GMAIL_AUTH_CONFIG_ID = "custom_gmail_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("gmail")).toBe("custom_gmail_config");
    });

    it("returns default gmail auth config when env not set", async () => {
      process.env.VITE_GMAIL_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("gmail")).toBe("gmail_oauth");
    });

    it("returns googlecalendar auth config from env", async () => {
      process.env.VITE_CALENDAR_AUTH_CONFIG_ID = "custom_calendar_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googlecalendar")).toBe("custom_calendar_config");
    });

    it("returns default googlecalendar auth config when env not set", async () => {
      process.env.VITE_CALENDAR_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googlecalendar")).toBe("googlecalendar_oauth");
    });

    it("returns notion auth config from env", async () => {
      process.env.VITE_NOTION_AUTH_CONFIG_ID = "custom_notion_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("notion")).toBe("custom_notion_config");
    });

    it("returns default notion auth config when env not set", async () => {
      process.env.VITE_NOTION_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("notion")).toBe("notion_oauth");
    });

    it("returns googledrive auth config from env", async () => {
      process.env.VITE_GOOGLE_DRIVE_AUTH_CONFIG_ID = "custom_drive_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googledrive")).toBe("custom_drive_config");
    });

    it("returns default googledrive auth config when env not set", async () => {
      process.env.VITE_GOOGLE_DRIVE_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googledrive")).toBe("googledrive_oauth");
    });

    it("returns googledocs auth config from env", async () => {
      process.env.VITE_GOOGLE_DOCS_AUTH_CONFIG_ID = "custom_docs_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googledocs")).toBe("custom_docs_config");
    });

    it("returns default googledocs auth config when env not set", async () => {
      process.env.VITE_GOOGLE_DOCS_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googledocs")).toBe("googledocs_oauth");
    });

    it("returns googlesheets auth config from env", async () => {
      process.env.VITE_GOOGLE_SHEETS_AUTH_CONFIG_ID = "custom_sheets_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googlesheets")).toBe("custom_sheets_config");
    });

    it("returns default googlesheets auth config when env not set", async () => {
      process.env.VITE_GOOGLE_SHEETS_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("googlesheets")).toBe("googlesheets_oauth");
    });

    it("returns slack auth config from env", async () => {
      process.env.VITE_SLACK_AUTH_CONFIG_ID = "custom_slack_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("slack")).toBe("custom_slack_config");
    });

    it("returns default slack auth config when env not set", async () => {
      process.env.VITE_SLACK_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("slack")).toBe("slack_oauth");
    });

    it("returns linear auth config from env", async () => {
      process.env.VITE_LINEAR_AUTH_CONFIG_ID = "custom_linear_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("linear")).toBe("custom_linear_config");
    });

    it("returns default linear auth config when env not set", async () => {
      process.env.VITE_LINEAR_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("linear")).toBe("linear_oauth");
    });

    it("returns github auth config from env", async () => {
      process.env.VITE_GITHUB_AUTH_CONFIG_ID = "custom_github_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("github")).toBe("custom_github_config");
    });

    it("returns default github auth config when env not set", async () => {
      process.env.VITE_GITHUB_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("github")).toBe("github_oauth");
    });

    it("returns twitter auth config from env", async () => {
      process.env.VITE_TWITTER_AUTH_CONFIG_ID = "custom_twitter_config";
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("twitter")).toBe("custom_twitter_config");
    });

    it("returns default twitter auth config when env not set", async () => {
      process.env.VITE_TWITTER_AUTH_CONFIG_ID = undefined;
      const { getAuthConfigId } = await import("../composio-utils");

      expect(getAuthConfigId("twitter")).toBe("twitter_oauth");
    });

    it("throws error for unknown connector type", async () => {
      const { getAuthConfigId } = await import("../composio-utils");

      expect(() => getAuthConfigId("unknown" as never)).toThrow(
        "Unknown connector type: unknown"
      );
    });
  });
});
