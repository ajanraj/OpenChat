import { handleSearchError } from "../search-errors";
import { PROVIDER_LIMITS, SEARCH_CONFIG } from "../types";
import type { SearchAdapter, SearchOptions, SearchResult } from "../types";

// Fields read from one entry of Tavily's `results` array
interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
  raw_content?: string;
}

const getStringField = (value: object, key: string): string | undefined => {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : undefined;
};

/**
 * Reads the result entries from a Tavily response body. A reply without results has none; any
 * other malformed reply throws, so the search falls back to the next provider.
 */
const parseTavilyResults = (data: unknown): TavilyResult[] => {
  if (typeof data !== "object" || data === null) {
    throw new TypeError("Tavily returned a malformed reply");
  }
  const results: unknown = "results" in data ? data.results : undefined;
  if (results === undefined || results === null) {
    return [];
  }
  if (!Array.isArray(results)) {
    throw new TypeError("Tavily returned malformed results");
  }
  return results.map((result: unknown): TavilyResult => {
    if (typeof result !== "object" || result === null) {
      return {};
    }
    return {
      url: getStringField(result, "url"),
      title: getStringField(result, "title"),
      content: getStringField(result, "content"),
      raw_content: getStringField(result, "raw_content"),
    };
  });
};

const formatMarkdown = (
  item: TavilyResult,
  includeContent: boolean
): string => {
  const title =
    item.title !== undefined && item.title !== "" ? item.title : "Untitled";
  const url = item.url !== undefined && item.url !== "" ? item.url : "#";
  let markdown = `### [${title}](${url})\n${item.content ?? ""}`;

  if (
    includeContent &&
    item.raw_content !== undefined &&
    item.raw_content !== ""
  ) {
    const truncatedContent =
      item.raw_content.length > SEARCH_CONFIG.maxTextCharacters
        ? `${item.raw_content.slice(0, SEARCH_CONFIG.maxTextCharacters - 3)}...`
        : item.raw_content;
    markdown += `\n\n> ${truncatedContent}`;
  }

  return markdown;
};

const formatResults = (
  results: TavilyResult[],
  includeContent: boolean
): SearchResult[] =>
  results.map((item) => ({
    url: item.url ?? "",
    title: item.title ?? "",
    description: item.content ?? "",
    content: includeContent ? item.raw_content : undefined,
    markdown: formatMarkdown(item, includeContent),
  }));

export class TavilySearchProvider implements SearchAdapter {
  readonly name = "tavily";
  readonly apiKey: string;
  private readonly baseUrl = "https://api.tavily.com/search";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Tavily Search API key is required");
    }
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      maxResults = SEARCH_CONFIG.maxResults,
      scrapeContent = SEARCH_CONFIG.scrapeContent,
      includeDomains,
      excludeDomains,
      startPublishedDate,
      endPublishedDate,
      signal,
    } = options;

    const limit = Math.min(maxResults, PROVIDER_LIMITS.tavily.maxResults);
    const chunksPerSource = scrapeContent
      ? PROVIDER_LIMITS.tavily.maxChunks
      : 3;

    try {
      const requestBody = {
        query,
        max_results: limit,
        search_depth: scrapeContent ? "advanced" : "basic",
        include_content: scrapeContent,
        chunks_per_source: chunksPerSource,
        api_key: this.apiKey,
        ...(includeDomains && { include_domains: includeDomains }),
        ...(excludeDomains && { exclude_domains: excludeDomains }),
        ...(startPublishedDate !== undefined &&
          startPublishedDate !== "" && {
            start_published_date: startPublishedDate,
          }),
        ...(endPublishedDate !== undefined &&
          endPublishedDate !== "" && { end_published_date: endPublishedDate }),
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Tavily Search failed: ${response.status} ${response.statusText}`
        );
      }

      const data: unknown = await response.json();

      return formatResults(parseTavilyResults(data), scrapeContent);
    } catch (error) {
      return handleSearchError(error, "tavily");
    }
  }
}
