// Client-safe utility functions for Composio connectors
// This file contains only utility functions that can be safely used on the client-side

import type { ConnectorType } from "./types";

// Map connector types to auth config IDs using public environment variables
export const getAuthConfigId = (connectorType: ConnectorType): string => {
  switch (connectorType) {
    case "gmail":
      return process.env.NEXT_PUBLIC_GMAIL_AUTH_CONFIG_ID || "gmail_oauth";
    case "googlecalendar":
      return (
        process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_AUTH_CONFIG_ID ||
        "googlecalendar_oauth"
      );
    case "notion":
      return process.env.NEXT_PUBLIC_NOTION_AUTH_CONFIG_ID || "notion_oauth";
    case "googledrive":
      return (
        process.env.NEXT_PUBLIC_GOOGLE_DRIVE_AUTH_CONFIG_ID ||
        "googledrive_oauth"
      );
    case "googledocs":
      return (
        process.env.NEXT_PUBLIC_GOOGLE_DOCS_AUTH_CONFIG_ID || "googledocs_oauth"
      );
    case "googlesheets":
      return (
        process.env.NEXT_PUBLIC_GOOGLE_SHEETS_AUTH_CONFIG_ID ||
        "googlesheets_oauth"
      );
    case "slack":
      return process.env.NEXT_PUBLIC_SLACK_AUTH_CONFIG_ID || "slack_oauth";
    case "linear":
      return process.env.NEXT_PUBLIC_LINEAR_AUTH_CONFIG_ID || "linear_oauth";
    case "github":
      return process.env.NEXT_PUBLIC_GITHUB_AUTH_CONFIG_ID || "github_oauth";
    case "twitter":
      return process.env.NEXT_PUBLIC_TWITTER_AUTH_CONFIG_ID || "twitter_oauth";
    default:
      throw new Error(`Unknown connector type: ${connectorType}`);
  }
};

// validateEnvironment moved to composio-server.ts (server-side only)
