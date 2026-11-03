import { afterEach, describe, expect, it, vi } from "vitest";

import { KeenableSearchProvider } from "../providers/keenable-search";

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
});
