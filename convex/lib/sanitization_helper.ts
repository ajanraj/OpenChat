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
export function sanitizeMessageParts(parts: any[], options: SanitizationOptions): any[] {
  return (parts ?? []).map((p: any) => {
    try {
      if (!p || typeof p !== "object") {
        return p;
      }

      // Redact sensitive tool use info (except tool-search which is public)
      if (typeof p.type === "string" && p.type.startsWith("tool-") && p.type !== "tool-search") {
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
      if (options.hideFiles && (p.type === "file" || p.type === "reasoning-file")) {
        return { ...p, url: "redacted" };
      }

      return p;
    } catch (error) {
      console.error("Content sanitization failed:", error);
      return { type: "redacted", error: "Content sanitization failed" };
    }
  });
}
