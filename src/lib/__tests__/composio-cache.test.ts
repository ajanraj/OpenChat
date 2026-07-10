import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRedisHealth,
  getCachedSessionId,
  invalidateUserToolsCache,
  setCachedSessionId,
} from "../composio-cache";

// Use vi.hoisted to define mock functions that will be available when mock is hoisted
const { mockJsonGet, mockJsonSet, mockExpire, mockKeys, mockDel, mockPing } = vi.hoisted(() => ({
  mockJsonGet: vi.fn(),
  mockJsonSet: vi.fn(),
  mockExpire: vi.fn(),
  mockKeys: vi.fn(),
  mockDel: vi.fn(),
  mockPing: vi.fn(),
}));

// Mock Redis before importing the module
vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    json = {
      get: mockJsonGet,
      set: mockJsonSet,
    };
    expire = mockExpire;
    keys = mockKeys;
    del = mockDel;
    ping = mockPing;
  },
}));

const getFirstStringArgument = (mock: typeof mockJsonGet): string => {
  const firstCall = mock.mock.calls[0];
  expect(firstCall).toBeDefined();

  const [value] = firstCall ?? [];
  expect(typeof value).toBe("string");

  return typeof value === "string" ? value : "";
};

describe("composio-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedSessionId", () => {
    it("returns null when cache is empty", async () => {
      mockJsonGet.mockResolvedValue(null);

      const result = await getCachedSessionId("user-123", ["gmail", "notion"]);

      expect(result).toBeNull();
      expect(mockJsonGet).toHaveBeenCalled();
    });

    it("returns null when cached value is empty array", async () => {
      mockJsonGet.mockResolvedValue([]);

      const result = await getCachedSessionId("user-123", ["gmail"]);

      expect(result).toBeNull();
    });

    it("returns cached session id when available", async () => {
      mockJsonGet.mockResolvedValue([{ sessionId: "session-123", strategy: "router-meta-v1" }]);

      const result = await getCachedSessionId("user-123", ["gmail"]);

      expect(result).toBe("session-123");
    });

    it("rejects a legacy direct-tools session", async () => {
      mockJsonGet.mockResolvedValue([{ sessionId: "legacy-session" }]);

      const result = await getCachedSessionId("user-123", ["gmail"]);

      expect(result).toBeNull();
    });

    it("rejects a session from another strategy", async () => {
      mockJsonGet.mockResolvedValue([{ sessionId: "other-session", strategy: "direct-tools-v1" }]);

      const result = await getCachedSessionId("user-123", ["gmail"]);

      expect(result).toBeNull();
    });

    it("returns null when cached value has invalid shape", async () => {
      mockJsonGet.mockResolvedValue([{ sessionId: "" }]);

      const result = await getCachedSessionId("user-123", ["gmail"]);

      expect(result).toBeNull();
    });

    it("sorts toolkit slugs for consistent cache keys", async () => {
      mockJsonGet.mockResolvedValue(null);

      await getCachedSessionId("user-123", ["notion", "gmail"]);

      const callArg = getFirstStringArgument(mockJsonGet);
      expect(callArg).toContain("gmail,notion");
    });

    it("uses correct cache key prefix", async () => {
      mockJsonGet.mockResolvedValue(null);

      await getCachedSessionId("user-123", ["gmail"]);

      const callArg = getFirstStringArgument(mockJsonGet);
      expect(callArg).toContain("composio:session:");
      expect(callArg).toContain("user-123");
    });
  });

  describe("setCachedSessionId", () => {
    it("sets session id in cache with correct key", async () => {
      mockJsonSet.mockResolvedValue("OK");
      mockExpire.mockResolvedValue(1);

      await setCachedSessionId("user-123", ["gmail"], "session-123");

      expect(mockJsonSet).toHaveBeenCalledWith("composio:session:user-123:gmail", "$", {
        sessionId: "session-123",
        strategy: "router-meta-v1",
      });
      expect(mockExpire).toHaveBeenCalled();
    });

    it("sorts toolkit slugs for consistent cache keys", async () => {
      mockJsonSet.mockResolvedValue("OK");
      mockExpire.mockResolvedValue(1);

      await setCachedSessionId("user-123", ["notion", "gmail"], "session-123");

      const callArg = getFirstStringArgument(mockJsonSet);
      expect(callArg).toContain("gmail,notion");
    });

    it("silently fails on error", async () => {
      mockJsonSet.mockRejectedValue(new Error("Redis error"));

      // Should not throw - simply await to verify it resolves
      await setCachedSessionId("user-123", ["gmail"], "session-123");
      expect(mockJsonSet).toHaveBeenCalled();
    });

    it("sets TTL of 48 hours", async () => {
      mockJsonSet.mockResolvedValue("OK");
      mockExpire.mockResolvedValue(1);

      await setCachedSessionId("user-123", ["gmail"], "session-123");

      // 48 hours = 48 * 60 * 60 = 172800 seconds
      expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 172_800);
    });
  });

  describe("invalidateUserToolsCache", () => {
    it("deletes all cache keys for user", async () => {
      mockKeys.mockResolvedValue([
        "composio:session:user-123:gmail",
        "composio:session:user-123:notion",
      ]);
      mockDel.mockResolvedValue(2);

      await invalidateUserToolsCache("user-123");

      expect(mockKeys).toHaveBeenCalledWith("composio:session:user-123:*");
      expect(mockDel).toHaveBeenCalled();
    });

    it("does not call del when no keys found", async () => {
      mockKeys.mockResolvedValue([]);

      await invalidateUserToolsCache("user-123");

      expect(mockDel).not.toHaveBeenCalled();
    });

    it("silently fails on error", async () => {
      mockKeys.mockRejectedValue(new Error("Redis error"));

      // Should not throw - simply await to verify it resolves
      await invalidateUserToolsCache("user-123");
      expect(mockKeys).toHaveBeenCalled();
    });
  });

  describe("checkRedisHealth", () => {
    it("returns true when Redis is healthy", async () => {
      mockPing.mockResolvedValue("PONG");

      const result = await checkRedisHealth();

      expect(result).toBe(true);
      expect(mockPing).toHaveBeenCalled();
    });

    it("returns false when Redis is unhealthy", async () => {
      mockPing.mockRejectedValue(new Error("Connection failed"));

      const result = await checkRedisHealth();

      expect(result).toBe(false);
    });
  });
});
