import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, vi } from "vitest";

import type { toast } from "@/components/ui/toast";
import { MESSAGE_MAX_LENGTH } from "@/lib/config/constants";

import type { convertConvexToAISDK } from "../ai-sdk-utils";
import {
  createPlaceholderId,
  createTempMessageId,
  validateQueryParam,
} from "../message-utils";

// Mock dependencies
vi.mock(import("@/components/ui/toast"), () => ({
  toast: vi.fn<typeof toast>(),
}));

// mapMessage isn't tested here; the mock keeps the AI SDK conversion module out
vi.mock(import("@/lib/ai-sdk-utils"), () => ({
  convertConvexToAISDK: vi.fn<typeof convertConvexToAISDK>(),
}));

// Reads the timestamp an ID embeds after `prefix`
const timestampOf = (id: string, prefix: string): number =>
  Number(id.slice(prefix.length).split("-", 1)[0]);

describe("message-utils", () => {
  describe(createTempMessageId, () => {
    it("returns a string starting with temp-", () => {
      const id = createTempMessageId();

      expect(id).toBeTypeOf("string");
      expect(id.startsWith("temp-")).toBeTruthy();
    });

    it("includes a timestamp", () => {
      const before = Date.now();
      const id = createTempMessageId();
      const after = Date.now();

      const timestamp = timestampOf(id, "temp-");

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("generates unique ids on subsequent calls", async () => {
      const ids = new Set<string>();
      const promises = Array.from({ length: 10 }, async (_, i) => {
        await sleep(i);
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
      expect(id.startsWith("temp-")).toBeTruthy();
    });
  });

  describe(createPlaceholderId, () => {
    it("returns a string starting with placeholder-", () => {
      const id = createPlaceholderId();

      expect(id).toBeTypeOf("string");
      expect(id.startsWith("placeholder-")).toBeTruthy();
    });

    it("includes a timestamp", () => {
      const before = Date.now();
      const id = createPlaceholderId();
      const after = Date.now();

      const timestamp = timestampOf(id, "placeholder-");

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe(validateQueryParam, () => {
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
      const longQuery = "a".repeat(MESSAGE_MAX_LENGTH + 1);
      const result = validateQueryParam(longQuery);

      expect(result).toBeNull();
    });

    it("returns query at exactly max length", () => {
      const maxLengthQuery = "a".repeat(MESSAGE_MAX_LENGTH);
      const result = validateQueryParam(maxLengthQuery);

      expect(result).toBe(maxLengthQuery);
    });
  });
});
