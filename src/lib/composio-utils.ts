// Client-safe utility functions for Composio connectors
// This file contains only utility functions that can be safely used on the client-side

import type { ConnectorType } from "./types";

// Returns the env value, or the fallback when it is unset or empty
const envOr = (value: string | undefined, fallback: string): string =>
  value === undefined || value === "" ? fallback : value;

// Map connector types to auth config IDs using public environment variables
export const getAuthConfigId = (connectorType: ConnectorType): string => {
  switch (connectorType) {
    case "gmail": {
      return envOr(process.env.VITE_GMAIL_AUTH_CONFIG_ID, "gmail_oauth");
    }
    case "googlecalendar": {
      return envOr(
        process.env.VITE_CALENDAR_AUTH_CONFIG_ID,
        "googlecalendar_oauth"
      );
    }
    case "notion": {
      return envOr(process.env.VITE_NOTION_AUTH_CONFIG_ID, "notion_oauth");
    }
    case "googledrive": {
      return envOr(
        process.env.VITE_GOOGLE_DRIVE_AUTH_CONFIG_ID,
        "googledrive_oauth"
      );
    }
    case "googledocs": {
      return envOr(
        process.env.VITE_GOOGLE_DOCS_AUTH_CONFIG_ID,
        "googledocs_oauth"
      );
    }
    case "googlesheets": {
      return envOr(
        process.env.VITE_GOOGLE_SHEETS_AUTH_CONFIG_ID,
        "googlesheets_oauth"
      );
    }
    case "slack": {
      return envOr(process.env.VITE_SLACK_AUTH_CONFIG_ID, "slack_oauth");
    }
    case "linear": {
      return envOr(process.env.VITE_LINEAR_AUTH_CONFIG_ID, "linear_oauth");
    }
    case "github": {
      return envOr(process.env.VITE_GITHUB_AUTH_CONFIG_ID, "github_oauth");
    }
    case "twitter": {
      return envOr(process.env.VITE_TWITTER_AUTH_CONFIG_ID, "twitter_oauth");
    }
    default: {
      const exhaustiveCheck: never = connectorType;
      throw new Error(`Unknown connector type: ${String(exhaustiveCheck)}`);
    }
  }
};

// validateEnvironment moved to composio-server.ts (server-side only)
