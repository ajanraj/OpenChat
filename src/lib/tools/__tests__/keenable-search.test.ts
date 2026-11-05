import { afterEach, describe, expect, it, vi } from "vitest";

import { KeenableSearchProvider } from "../providers/keenable-search";
import { SearchError } from "../search-errors";

const reply = {
  results: [
    {
      url: "https://example.com",
      title: "Example",
      description: "",
      snippet: "Example snippet",
    },
  ],
};

describe(KeenableSearchProvider, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the keyless public endpoint without an API key", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => await Promise.resolve(Response.json(reply)));
    vi.stubGlobal("fetch", fetchMock);

    const results = await new KeenableSearchProvider().search("example");

    const [[url, init]] = fetchMock.mock.calls;
    expect(url).toBe("https://api.keenable.ai/v1/search/public");
    expect(init.headers).toMatchObject({ "X-Keenable-Title": "OpenChat" });
    expect(results[0]).toMatchObject({
      url: "https://example.com",
      title: "Example",
      description: "Example snippet",
    });
  });

  it("uses the keyed endpoint when an API key is set", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => await Promise.resolve(Response.json(reply)));
    vi.stubGlobal("fetch", fetchMock);

    await new KeenableSearchProvider("test-key").search("example");

    const [[url, init]] = fetchMock.mock.calls;
    expect(url).toBe("https://api.keenable.ai/v1/search");
    expect(init.headers).toMatchObject({ "X-API-Key": "test-key" });
  });

  it("drops results from excluded domains and clamps max_results to at least 1", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(
      async () =>
        await Promise.resolve(
          Response.json({
            results: [
              { url: "https://blocked.com/a", title: "Blocked" },
              { url: "https://sub.blocked.com/b", title: "Blocked sub" },
              { url: "https://kept.org", title: "Kept" },
            ],
          })
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await new KeenableSearchProvider().search("example", {
      excludeDomains: ["blocked.com"],
      maxResults: 0,
    });

    const [[, init]] = fetchMock.mock.calls;
    expect(init.body).toContain('"max_results":1');
    expect(results.map((r) => r.url)).toStrictEqual(["https://kept.org"]);
  });

  it("does not quote a long snippet that already backs an empty description", async () => {
    const longSnippet = "a".repeat(5000);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          await Promise.resolve(
            Response.json({
              results: [
                {
                  url: "https://x.com",
                  title: "X",
                  description: "",
                  snippet: longSnippet,
                },
              ],
            })
          )
      )
    );

    const [result] = await new KeenableSearchProvider().search("example", {
      scrapeContent: true,
    });

    expect(result.markdown).not.toContain("\n\n> ");
  });

  it.each([null, { results: {} }, { results: "none" }])(
    "throws SearchError when Keenable returns malformed results: %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => await Promise.resolve(Response.json(body)))
      );

      await expect(
        new KeenableSearchProvider().search("example")
      ).rejects.toBeInstanceOf(SearchError);
    }
  );

  it.each([{}, { results: [] }])(
    "treats a reply without result entries as no results: %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => await Promise.resolve(Response.json(body)))
      );

      await expect(
        new KeenableSearchProvider().search("example")
      ).resolves.toStrictEqual([]);
    }
  );
});
