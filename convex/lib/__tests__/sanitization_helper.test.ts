import { describe, expect, it, vi } from "vitest";
import { sanitizeMessageParts } from "../sanitization_helper";

describe("sanitizeMessageParts", () => {
  describe("basic behavior", () => {
    it("returns empty array for empty input", () => {
      const result = sanitizeMessageParts([], { hideFiles: false });

      expect(result).toEqual([]);
    });

    it("handles null input gracefully", () => {
      const result = sanitizeMessageParts(null as unknown as unknown[], {
        hideFiles: false,
      });

      expect(result).toEqual([]);
    });

    it("handles undefined input gracefully", () => {
      const result = sanitizeMessageParts(undefined as unknown as unknown[], {
        hideFiles: false,
      });

      expect(result).toEqual([]);
    });

    it("passes through primitive values unchanged", () => {
      const parts = ["string", 123, true, null];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result).toEqual(["string", 123, true, null]);
    });

    it("passes through text parts unchanged", () => {
      const parts = [{ type: "text", text: "Hello world" }];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result).toEqual([{ type: "text", text: "Hello world" }]);
    });
  });

  describe("tool use redaction", () => {
    it("redacts tool-call input", () => {
      const parts = [
        {
          type: "tool-call",
          toolName: "gmail_send",
          input: { to: "test@example.com", body: "secret" },
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].input).toBe("REDACTED");
      expect(result[0].type).toBe("tool-call");
      expect(result[0].toolName).toBe("gmail_send");
    });

    it("redacts tool-result output", () => {
      const parts = [
        {
          type: "tool-result",
          toolName: "gmail_send",
          output: { messageId: "123", status: "sent" },
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].output).toBe("REDACTED");
    });

    it("redacts tool-error error field", () => {
      const parts = [
        {
          type: "tool-error",
          toolName: "gmail_send",
          error: "API key expired: sk-secret-key-123",
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].error).toBe("REDACTED");
    });

    it("redacts all sensitive fields from tool parts", () => {
      const parts = [
        {
          type: "tool-invocation",
          toolName: "notion_create",
          input: { title: "secret doc" },
          output: { pageId: "abc123" },
          error: "some error",
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].input).toBe("REDACTED");
      expect(result[0].output).toBe("REDACTED");
      expect(result[0].error).toBe("REDACTED");
    });

    it("does not redact tool-search parts", () => {
      const parts = [
        {
          type: "tool-search",
          input: { query: "weather today" },
          output: [{ title: "Weather", url: "https://weather.com" }],
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].input).toEqual({ query: "weather today" });
      expect(result[0].output).toEqual([{ title: "Weather", url: "https://weather.com" }]);
    });
  });

  describe("file redaction", () => {
    it("redacts file URLs when hideFiles is true", () => {
      const parts = [
        {
          type: "file",
          url: "https://storage.example.com/files/secret-doc.pdf",
          fileName: "document.pdf",
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: true });

      expect(result[0].url).toBe("redacted");
      expect(result[0].fileName).toBe("document.pdf");
    });

    it("preserves file URLs when hideFiles is false", () => {
      const parts = [
        {
          type: "file",
          url: "https://storage.example.com/files/public-doc.pdf",
          fileName: "document.pdf",
        },
      ];
      const result = sanitizeMessageParts(parts, { hideFiles: false });

      expect(result[0].url).toBe("https://storage.example.com/files/public-doc.pdf");
    });
  });

  describe("mixed parts", () => {
    it("handles mixed content types correctly", () => {
      const parts = [
        { type: "text", text: "Here is the analysis:" },
        {
          type: "tool-call",
          toolName: "analyze",
          input: { data: "sensitive" },
        },
        {
          type: "file",
          url: "https://example.com/image.png",
          fileName: "chart.png",
        },
        {
          type: "tool-search",
          input: { query: "public search" },
        },
      ];

      const result = sanitizeMessageParts(parts, { hideFiles: true });

      // Text should be unchanged
      expect(result[0].text).toBe("Here is the analysis:");

      // Tool-call should be redacted
      expect(result[1].input).toBe("REDACTED");

      // File should be redacted
      expect(result[2].url).toBe("redacted");

      // tool-search should be preserved
      expect(result[3].input).toEqual({ query: "public search" });
    });
  });

  describe("error handling", () => {
    it("returns safe placeholder when processing throws", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Create a part that will throw when cloned
      const badPart = {
        type: "tool-call",
        get input() {
          throw new Error("Cannot access input");
        },
      };

      // Accessing input will throw, but the function should handle it
      const parts = [badPart];
      const result = sanitizeMessageParts(parts, { hideFiles: false });
      consoleSpy.mockRestore();

      // Should return a safe placeholder
      expect(result[0]).toEqual({
        type: "redacted",
        error: "Content sanitization failed",
      });
    });
  });
});
