import type { ConnectorType } from "@/lib/types";

export interface ToolPrompt {
  readonly content: string;
  readonly connectors: readonly ConnectorType[];
}

/**
 * Tool-specific prompt configurations that are dynamically injected into sub-agents
 * based on the requested toolkits. This keeps the main agent prompt lean and
 * reduces token usage by only including relevant tool instructions.
 */
export const TOOL_SPECIFIC_PROMPTS = {
  notion: {
    content: `
<notion_information>
<overview>
When working with Notion, be careful about where you place your page. If you place it incorrectly, it could be within a sub-directory or another page.
Ensure that you use the parent id, not the database id, when adding pages to databases or other pages.
Actions are configured through Config.NOTION_ACTIONS.
</overview>

<page_creation_guidelines>
- Always fetch all pages and databases before creating or editing pages, and ensure you have the correct parent ID.
- If creating a page within a database, use the database ID as the parent_database_id and *do not* specify parent_page_id
- If creating a page as a child of another page, use the page ID as the parent_page_id and *do not* specify parent_database_id
- When creating or editing pages, include a link to the page in your final response
- Actions are configured through Config.NOTION_ACTIONS
</page_creation_guidelines>

<content_management>
- When asked to retrieve content, retrieve the specific block content if possible, not just the page URL
- IMPORTANT: When adding multiple items (like "5 ideas", "several points", etc.), always use notion_append_blocks with an array of content in ONE tool call, not multiple separate calls
</content_management>
</notion_information>`.trim(),
    connectors: ["notion"],
  },

  gmail: {
    content: `
<gmail_information>
- Use proper dates when getting content from Gmail.
- Do not retrieve more than 25 emails at a time. Do multiple calls if you need more emails.
</gmail_information>`.trim(),
    connectors: ["gmail"],
  },

  googleCalendar: {
    content: `
<google_calendar_guidelines>
- Use "primary" as the calendarId by default unless the user specifically mentions another calendar name.
- When the user mentions a specific calendar name, search for that calendar first before using it.
- Always include the calendar ID in your responses when working with specific calendars.
</google_calendar_guidelines>`.trim(),
    connectors: ["googlecalendar"],
  },

  googleWorkspace: {
    content: `
<google_workspace_guidelines>
- When creating Google Docs, ALWAYS provide both 'title' and 'text' parameters
- Use GOOGLEDOCS_CREATE_DOCUMENT with: {"title": "Document Title", "text": "Document content"}
- For markdown content, use GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN with: {"title": "Document Title", "markdown_text": "# Markdown content"}
- IMPORTANT: WRITE IN SMALLER CHUNKS, E.G. 2 PARAGRAPHS AT A TIME
- After creating a document, always provide the document link to the user
- Never call document creation tools with empty parameters - they will fail
</google_workspace_guidelines>`.trim(),
    connectors: ["googledocs", "googlesheets"],
  },
} as const;

/**
 * Get relevant tool prompts for the given requested toolkits
 * @param requestedToolkits Array of connector slugs (e.g., ["GMAIL", "NOTION"])
 * @returns Combined prompt string with only relevant tool instructions
 */
export const getToolSpecificPrompts = (
  requestedToolkits: readonly string[]
): string => {
  const normalizedToolkits = requestedToolkits.map((toolkit) =>
    toolkit.toLowerCase()
  ) as ConnectorType[];

  const relevantPrompts: string[] = [];

  // Find matching tool prompts
  for (const toolPrompt of Object.values(TOOL_SPECIFIC_PROMPTS)) {
    const hasMatchingConnector = toolPrompt.connectors.some((connector) =>
      normalizedToolkits.includes(connector)
    );

    if (hasMatchingConnector) {
      relevantPrompts.push(toolPrompt.content);
    }
  }

  return relevantPrompts.length > 0 ? relevantPrompts.join("\n\n") : "";
};

/**
 * Get a list of all supported connector types that have tool-specific prompts
 */
export const getSupportedConnectorsWithPrompts = (): ConnectorType[] => {
  const allConnectors = new Set<ConnectorType>();

  for (const toolPrompt of Object.values(TOOL_SPECIFIC_PROMPTS)) {
    for (const connector of toolPrompt.connectors) {
      allConnectors.add(connector);
    }
  }

  return [...allConnectors];
};
