/**
 * Sanitization utilities for public sharing and data export
 *
 * This module provides centralized sanitization logic to ensure consistent
 * data protection across all public-facing endpoints and operations.
 */

export interface SanitizationOptions {
  /** Whether to redact file URLs and replace with 'redacted' placeholder */
  hideFiles: boolean;
}

// Any non-null object, arrays included
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Sanitizes one message part; see sanitizeMessageParts. */
const sanitizePart = <Part>(
  p: Part,
  options: SanitizationOptions
): Part | Record<string, unknown> => {
  try {
    if (!isObject(p)) {
      return p;
    }
    const { type } = p;

    // Redact sensitive tool use info (except tool-search which is public)
    if (
      typeof type === "string" &&
      type.startsWith("tool-") &&
      type !== "tool-search"
    ) {
      const cloned: Record<string, unknown> = { ...p };
      if ("input" in cloned) {
        cloned.input = "REDACTED";
      }
      if ("output" in cloned) {
        cloned.output = "REDACTED";
      }
      if ("error" in cloned) {
        cloned.error = "REDACTED";
      }
      return cloned;
    }

    // Hide files/images if requested
    if (options.hideFiles && (type === "file" || type === "reasoning-file")) {
      return { ...p, url: "redacted" };
    }

    return p;
  } catch (error) {
    console.error("Content sanitization failed:", error);
    return { type: "redacted", error: "Content sanitization failed" };
  }
};

/**
 * Sanitizes message parts for public sharing by redacting sensitive information
 *
 * This function handles:
 * - Tool call redaction: inputs, outputs, and errors are replaced with 'REDACTED'
 * - File URL redaction: URLs replaced with 'redacted' when hideFiles is true
 * - Error handling: fails closed with safe placeholder on processing errors
 *
 * @param parts Array of message parts to sanitize; null or undefined sanitize as no parts
 * @param options Sanitization configuration options
 * @returns Array of sanitized message parts, typed like the input's (`any` for untyped stored
 * parts)
 */
export const sanitizeMessageParts = <
  Parts extends readonly unknown[] | null | undefined,
>(
  parts: Parts,
  options: SanitizationOptions
): (NonNullable<Parts>[number] | Record<string, unknown>)[] => {
  const sanitized: (NonNullable<Parts>[number] | Record<string, unknown>)[] =
    [];
  if (parts === null || parts === undefined) {
    return sanitized;
  }
  for (const p of parts) {
    sanitized.push(sanitizePart(p, options));
  }
  return sanitized;
};
