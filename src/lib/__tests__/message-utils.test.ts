import { describe, expect, it, vi } from "vitest";
import type { toast } from "@/components/ui/toast";
import type { convertConvexToAISDK } from "../ai-sdk-utils";
import { createPlaceholderId, createTempMessageId, validateQueryParam } from "../message-utils";

// Mock dependencies
vi.mock("@/components/ui/toast", () => ({
  toast: vi.fn<typeof toast>(),
}));

vi.mock("@/lib/ai-sdk-utils", () => ({
  convertConvexToAISDK: vi.fn<typeof convertConvexToAISDK>((msg) => ({
    id: msg._id,
    role: msg.role,
    parts: msg.parts || [],
  })),
}));

vi.mock("@/lib/config", () => ({
  MESSAGE_MAX_LENGTH: 100,
}));

describe("message-utils", () => {
  describe("createTempMessageId", () => {
    it("returns a string starting with temp-", () => {
      const id = createTempMessageId();

      expect(typeof id).toBe("string");
      expect(id.startsWith("temp-")).toBe(true);
    });

    it("includes a timestamp", () => {
      const before = Date.now();
      const id = createTempMessageId();
      const after = Date.now();

      const timestamp = Number.parseInt(id.replace("temp-", ""), 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("generates unique ids on subsequent calls", async () => {
      const ids = new Set<string>();
      const promises = Array.from({ length: 10 }, async (_, i) => {
        await new Promise((resolve) => setTimeout(resolve, i));
        return createTempMessageId();
      });
      const results = await Promise.all(promises);
      for (const id of results) {
        ids.add(id);
      }
      // All 10 IDs should be unique
      expect(ids.size).toBe(10);
    });

    it("has correct format", () => {
      const id = createTempMessageId();
      expect(id.startsWith("temp-")).toBe(true);
    });
  });

  describe("createPlaceholderId", () => {
    it("returns a string starting with placeholder-", () => {
      const id = createPlaceholderId();

      expect(typeof id).toBe("string");
      expect(id.startsWith("placeholder-")).toBe(true);
    });

    it("includes a timestamp", () => {
      const before = Date.now();
      const id = createPlaceholderId();
      const after = Date.now();

      const timestamp = Number.parseInt(id.replace("placeholder-", ""), 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("validateQueryParam", () => {
    it("returns trimmed query for valid input", () => {
      const result = validateQueryParam("  valid query  ");

      expect(result).toBe("valid query");
    });

    it("returns null for empty string", () => {
      const result = validateQueryParam("");

      expect(result).toBeNull();
    });

    it("returns null for whitespace only", () => {
      const result = validateQueryParam("   ");

      expect(result).toBeNull();
    });

    it("returns null for query exceeding max length", () => {
      const longQuery = "a".repeat(101); // Exceeds mocked MESSAGE_MAX_LENGTH of 100
      const result = validateQueryParam(longQuery);

      expect(result).toBeNull();
    });

    it("returns query at exactly max length", () => {
      const maxLengthQuery = "a".repeat(100);
      const result = validateQueryParam(maxLengthQuery);

      expect(result).toBe(maxLengthQuery);
    });
  });
});
