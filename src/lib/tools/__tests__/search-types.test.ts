import { describe, expect, it } from "vitest";

import { PROVIDER_LIMITS, SEARCH_CONFIG } from "../types";

describe("PROVIDER_LIMITS", () => {
  it("is defined and has entries for all providers", () => {
    expect(PROVIDER_LIMITS).toBeDefined();
    expect(PROVIDER_LIMITS.exa).toBeDefined();
    expect(PROVIDER_LIMITS.tavily).toBeDefined();
    expect(PROVIDER_LIMITS.brave).toBeDefined();
  });

  it("exa has expected limits", () => {
    expect(PROVIDER_LIMITS.exa.maxResults).toBe(10);
    expect(PROVIDER_LIMITS.exa.maxChunks).toBe(3);
  });

  it("tavily has expected limits", () => {
    expect(PROVIDER_LIMITS.tavily.maxResults).toBe(20);
    expect(PROVIDER_LIMITS.tavily.maxChunks).toBe(8);
  });

  it("brave has expected limits", () => {
    expect(PROVIDER_LIMITS.brave.maxResults).toBe(20);
    expect(PROVIDER_LIMITS.brave.maxChunks).toBe(3);
  });
});

describe("SEARCH_CONFIG", () => {
  it("is defined", () => {
    expect(SEARCH_CONFIG).toBeDefined();
  });

  it("has maxResults defined", () => {
    expect(SEARCH_CONFIG.maxResults).toBe(3);
  });

  it("has scrapeContent enabled by default", () => {
    expect(SEARCH_CONFIG.scrapeContent).toBe(true);
  });

  it("has maxTextCharacters defined", () => {
    expect(SEARCH_CONFIG.maxTextCharacters).toBe(1000);
  });
});
