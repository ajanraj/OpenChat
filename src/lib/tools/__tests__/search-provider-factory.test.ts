import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tavilyHit = {
  results: [{ url: "https://tavily.example", title: "Tavily hit" }],
};
const braveHit = {
  web: {
    results: [{ url: "https://brave.example", title: "Brave hit" }],
  },
};

/** Answers each provider's request with its reply, as HTTP 200 JSON. */
const stubReplies = (replies: { brave: unknown; tavily: unknown }) => {
  process.env.BRAVE_API_KEY = "brave-key";
  process.env.TAVILY_API_KEY = "tavily-key";
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    return await Promise.resolve(
      Response.json(url.includes("brave") ? replies.brave : replies.tavily)
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

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
        "BRAVE_API_KEY environment variable is not set"
      );
    });

    it("throws when TAVILY_API_KEY is not set for tavily provider", async () => {
      process.env.TAVILY_API_KEY = undefined;
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("tavily")).toThrow(
        "TAVILY_API_KEY environment variable is not set"
      );
    });

    it("throws when EXA_API_KEY is not set for exa provider", async () => {
      process.env.EXA_API_KEY = undefined;
      const module = await import("../search-provider-factory");

      expect(() => module.getProvider("exa")).toThrow(
        "EXA_API_KEY environment variable is not set"
      );
    });

    it("throws for unknown provider", async () => {
      const module = await import("../search-provider-factory");

      // An untyped caller can pass a provider outside SearchProvider
      expect(() => {
        Reflect.apply(module.getProvider, undefined, ["unknown"]);
      }).toThrow("Unknown search provider: unknown");
    });

    it("creates brave provider when API key is set", async () => {
      process.env.BRAVE_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("brave");

      expect(provider).toBeDefined();
      expect(provider.search).toBeTypeOf("function");
    });

    it("creates tavily provider when API key is set", async () => {
      process.env.TAVILY_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("tavily");

      expect(provider).toBeDefined();
      expect(provider.search).toBeTypeOf("function");
    });

    it("creates exa provider when API key is set", async () => {
      process.env.EXA_API_KEY = "test-key";
      const module = await import("../search-provider-factory");

      const provider = module.getProvider("exa");

      expect(provider).toBeDefined();
      expect(provider.search).toBeTypeOf("function");
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

      expect(module.searchWithFallback).toBeTypeOf("function");
    });

    it("rejects when no API keys are configured", async () => {
      // Ensure no API keys are set
      process.env.EXA_API_KEY = undefined;
      process.env.TAVILY_API_KEY = undefined;
      process.env.BRAVE_API_KEY = undefined;

      const module = await import("../search-provider-factory");

      await expect(module.searchWithFallback("test query")).rejects.toThrow(
        "All search providers failed"
      );
    });

    it("passes the abort signal to the provider request and stops falling back once aborted", async () => {
      process.env.BRAVE_API_KEY = "brave-key";
      process.env.TAVILY_API_KEY = "tavily-key";
      const controller = new AbortController();
      const fetchMock = vi.fn<typeof fetch>(async () => {
        controller.abort();
        return await Promise.reject(
          new DOMException("This operation was aborted", "AbortError")
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      const module = await import("../search-provider-factory");

      await expect(
        module.searchWithFallback("test query", { signal: controller.signal }, [
          "brave",
          "tavily",
        ])
      ).rejects.toThrow("All search providers failed");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        signal: controller.signal,
      });
    });

    describe("replies that parse as JSON", () => {
      it.each([null, { web: "none" }, { web: { results: {} } }])(
        "falls back to Tavily when Brave's reply is malformed: %j",
        async (brave) => {
          const fetchMock = stubReplies({ brave, tavily: tavilyHit });
          const module = await import("../search-provider-factory");

          const results = await module.searchWithFallback("test query", {}, [
            "brave",
            "tavily",
          ]);

          expect(results.map((r) => r.title)).toStrictEqual(["Tavily hit"]);
          expect(fetchMock).toHaveBeenCalledTimes(2);
        }
      );

      it.each([null, { results: {} }, { results: "none" }])(
        "falls back to Brave when Tavily's reply is malformed: %j",
        async (tavily) => {
          const fetchMock = stubReplies({ brave: braveHit, tavily });
          const module = await import("../search-provider-factory");

          const results = await module.searchWithFallback("test query", {}, [
            "tavily",
            "brave",
          ]);

          expect(results.map((r) => r.title)).toStrictEqual(["Brave hit"]);
          expect(fetchMock).toHaveBeenCalledTimes(2);
        }
      );

      it.each([{}, { web: {} }, { web: { results: [] } }])(
        "treats a Brave reply without results as no results: %j",
        async (brave) => {
          const fetchMock = stubReplies({ brave, tavily: tavilyHit });
          const module = await import("../search-provider-factory");

          await expect(
            module.searchWithFallback("test query", {}, ["brave", "tavily"])
          ).resolves.toStrictEqual([]);
          expect(fetchMock).toHaveBeenCalledOnce();
        }
      );

      it.each([{}, { results: [] }])(
        "treats a Tavily reply without results as no results: %j",
        async (tavily) => {
          const fetchMock = stubReplies({ brave: braveHit, tavily });
          const module = await import("../search-provider-factory");

          await expect(
            module.searchWithFallback("test query", {}, ["tavily", "brave"])
          ).resolves.toStrictEqual([]);
          expect(fetchMock).toHaveBeenCalledOnce();
        }
      );
    });

    it("accepts query parameter", async () => {
      const module = await import("../search-provider-factory");

      expect(module.searchWithFallback.length).toBeGreaterThanOrEqual(1);
    });
  });
});
