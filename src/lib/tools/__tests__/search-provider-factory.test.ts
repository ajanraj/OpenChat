import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("search-provider-factory", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Clear module cache to reset cached instances
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getProvider", () => {
    it("throws when BRAVE_API_KEY is not set for brave provider", async () => {
      process.env.BRAVE_API_KEY = undefined;
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("brave")).toThrow(
        "BRAVE_API_KEY environment variable is not set",
      );
    });

    it("throws when TAVILY_API_KEY is not set for tavily provider", async () => {
      process.env.TAVILY_API_KEY = undefined;
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("tavily")).toThrow(
        "TAVILY_API_KEY environment variable is not set",
      );
    });

    it("throws when EXA_API_KEY is not set for exa provider", async () => {
      process.env.EXA_API_KEY = undefined;
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("exa")).toThrow(
        "EXA_API_KEY environment variable is not set",
      );
    });

    it("throws for unknown provider", async () => {
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("unknown" as never)).toThrow(
        "Unknown search provider: unknown",
      );
    });

    it("creates brave provider when API key is set", async () => {
      process.env.BRAVE_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("brave");

      expect(provider).toBeDefined();
      expect(typeof provider.search).toBe("function");
    });

    it("creates tavily provider when API key is set", async () => {
      process.env.TAVILY_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("tavily");

      expect(provider).toBeDefined();
      expect(typeof provider.search).toBe("function");
    });

    it("creates exa provider when API key is set", async () => {
      process.env.EXA_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("exa");

      expect(provider).toBeDefined();
      expect(typeof provider.search).toBe("function");
    });

    it("returns cached instance on subsequent calls", async () => {
      process.env.EXA_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider1 = module.getProvider("exa");
      const provider2 = module.getProvider("exa");

      expect(provider1).toBe(provider2);
    });
  });

  describe("searchWithFallback", () => {
    it("is exported as a function", async () => {
      const module = await import("../search-provider-factory");

      expect(typeof module.searchWithFallback).toBe("function");
    });

    it("rejects when no API keys are configured", async () => {
      // Ensure no API keys are set
      process.env.EXA_API_KEY = undefined;
      process.env.TAVILY_API_KEY = undefined;
      process.env.BRAVE_API_KEY = undefined;

      const module = await import("../search-provider-factory");

      await expect(module.searchWithFallback("test query")).rejects.toThrow(
        "All search providers failed",
      );
    });

    it("passes the abort signal to the provider request and stops falling back once aborted", async () => {
      process.env.BRAVE_API_KEY = "brave-key";
      process.env.TAVILY_API_KEY = "tavily-key";
      const controller = new AbortController();
      const fetchMock = vi.fn<typeof fetch>(async () => {
        controller.abort();
        throw new DOMException("This operation was aborted", "AbortError");
      });
      vi.stubGlobal("fetch", fetchMock);
      const module = await import("../search-provider-factory");

      await expect(
        module.searchWithFallback("test query", { signal: controller.signal }, ["brave", "tavily"]),
      ).rejects.toThrow("All search providers failed");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
    });

    it("accepts query parameter", async () => {
      const module = await import("../search-provider-factory");

      expect(module.searchWithFallback.length).toBeGreaterThanOrEqual(1);
    });
  });
});
