/**
 * Sanitization utilities for public sharing and data export
 *
 * This module provides centralized sanitization logic to ensure consistent
 * data protection across all public-facing endpoints and operations.
 */

export type SanitizationOptions = {
  /** Whether to redact file URLs and replace with 'redacted' placeholder */
  hideFiles: boolean;
};

/**
 * Sanitizes message parts for public sharing by redacting sensitive information
 *
 * This function handles:
 * - Tool call redaction: inputs, outputs, and errors are replaced with 'REDACTED'
 * - File URL redaction: URLs replaced with 'redacted' when hideFiles is true
 * - Error handling: fails closed with safe placeholder on processing errors
 *
 * @param parts Array of message parts to sanitize
 * @param options Sanitization configuration options
 * @returns Array of sanitized message parts
 */
export function sanitizeMessageParts(
  // biome-ignore lint/suspicious/noExplicitAny: parts can be any; we validate properties at runtime
  parts: any[],
  options: SanitizationOptions
  // biome-ignore lint/suspicious/noExplicitAny: parts can be any; we validate properties at runtime
): any[] {
  // biome-ignore lint/suspicious/noExplicitAny: parts can be any; we validate properties at runtime
  return (parts ?? []).map((p: any) => {
    try {
      if (!p || typeof p !== "object") {
        return p;
      }

      // Redact sensitive tool use info (except tool-search which is public)
      if (
        typeof p.type === "string" &&
        p.type.startsWith("tool-") &&
        p.type !== "tool-search"
      ) {
        const cloned = { ...p } as Record<string, unknown>;
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
      if (options.hideFiles && p.type === "file") {
        return { ...p, url: "redacted" };
      }

      return p;
    } catch (_err) {
      // Fail closed: return safe placeholder instead of potentially sensitive original
      return { type: "redacted", error: "Content sanitization failed" };
    }
  });
}
