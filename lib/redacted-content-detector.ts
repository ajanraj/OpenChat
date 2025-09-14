/**
 * Redacted Content Detection Utilities
 *
 * This module provides utilities to detect redacted content in shared chats,
 * preventing fork operations when content integrity would be compromised.
 */

export type RedactedContentDetails = {
  /** Whether any redacted content was found */
  hasRedactedContent: boolean;
  /** Number of redacted files found */
  redactedFiles: number;
  /** Number of redacted tool calls found */
  redactedTools: number;
  /** Number of redacted message parts found */
  redactedParts: number;
  /** Human-readable description of what's redacted */
  description: string;
};

/**
 * Detects redacted content in a message's parts array
 *
 * @param parts Array of message parts to check
 * @returns Object with details about redacted content
 */
export function detectRedactedInParts(
  // biome-ignore lint/suspicious/noExplicitAny: message parts can be any shape
  parts: any[]
): Pick<
  RedactedContentDetails,
  "redactedFiles" | "redactedTools" | "redactedParts"
> {
  let redactedFiles = 0;
  let redactedTools = 0;
  let redactedParts = 0;

  if (!Array.isArray(parts)) {
    return { redactedFiles: 0, redactedTools: 0, redactedParts: 0 };
  }

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }

    // Check for redacted files
    if (part.type === "file" && part.url === "redacted") {
      redactedFiles++;
      continue;
    }

    // Check for redacted tool calls
    if (
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      (part.input === "REDACTED" ||
        part.output === "REDACTED" ||
        part.error === "REDACTED")
    ) {
      redactedTools++;
      continue;
    }

    // Check for redacted message parts
    if (part.type === "redacted") {
      redactedParts++;
    }
  }

  return { redactedFiles, redactedTools, redactedParts };
}

/**
 * Detects redacted content in an array of messages
 *
 * @param messages Array of messages to check for redacted content
 * @returns Comprehensive details about redacted content found
 */
export function detectRedactedContent(
  // biome-ignore lint/suspicious/noExplicitAny: messages can have various structures
  messages: any[]
): RedactedContentDetails {
  let totalRedactedFiles = 0;
  let totalRedactedTools = 0;
  let totalRedactedParts = 0;

  if (!Array.isArray(messages)) {
    return {
      hasRedactedContent: false,
      redactedFiles: 0,
      redactedTools: 0,
      redactedParts: 0,
      description: "No content to check",
    };
  }

  // Check each message for redacted content
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    // Check message parts
    if (Array.isArray(message.parts)) {
      const partResults = detectRedactedInParts(message.parts);
      totalRedactedFiles += partResults.redactedFiles;
      totalRedactedTools += partResults.redactedTools;
      totalRedactedParts += partResults.redactedParts;
    }
  }

  const hasRedactedContent =
    totalRedactedFiles > 0 || totalRedactedTools > 0 || totalRedactedParts > 0;

  // Generate human-readable description
  let description = "Complete content available";
  if (hasRedactedContent) {
    const items: string[] = [];
    if (totalRedactedFiles > 0) {
      items.push(
        `${totalRedactedFiles} file${totalRedactedFiles === 1 ? "" : "s"}`
      );
    }
    if (totalRedactedTools > 0) {
      items.push(
        `${totalRedactedTools} tool call${totalRedactedTools === 1 ? "" : "s"}`
      );
    }
    if (totalRedactedParts > 0) {
      items.push(
        `${totalRedactedParts} message part${totalRedactedParts === 1 ? "" : "s"}`
      );
    }

    if (items.length === 1) {
      description = `Contains private ${items[0]}`;
    } else if (items.length === 2) {
      description = `Contains private ${items[0]} and ${items[1]}`;
    } else {
      description = `Contains private ${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
    }
  }

  return {
    hasRedactedContent,
    redactedFiles: totalRedactedFiles,
    redactedTools: totalRedactedTools,
    redactedParts: totalRedactedParts,
    description,
  };
}

/**
 * Quick check to determine if forking should be disabled
 *
 * @param messages Array of messages to check
 * @returns True if forking should be disabled due to redacted content
 */
export function shouldDisableFork(
  // biome-ignore lint/suspicious/noExplicitAny: messages can have various structures
  messages: any[]
): boolean {
  return detectRedactedContent(messages).hasRedactedContent;
}
