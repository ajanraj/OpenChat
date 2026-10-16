import { handleSearchError } from "../search-errors";
import { PROVIDER_LIMITS, SEARCH_CONFIG } from "../types";
import type { SearchAdapter, SearchOptions, SearchResult } from "../types";

// Fields read from one entry of Brave's `web.results` array
interface BraveResult {
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
}

const getStringField = (value: object, key: string): string | undefined => {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : undefined;
};

// Reads the result entries from a Brave response body, ignoring anything malformed
const parseBraveResults = (data: unknown): BraveResult[] => {
  if (typeof data !== "object" || data === null || !("web" in data)) {
    return [];
  }
  const { web } = data;
  if (typeof web !== "object" || web === null || !("results" in web)) {
    return [];
  }
  const { results } = web;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map((result: unknown): BraveResult => {
    if (typeof result !== "object" || result === null) {
      return {};
    }
    return {
      url: getStringField(result, "url"),
      title: getStringField(result, "title"),
      description: getStringField(result, "description"),
      snippet: getStringField(result, "snippet"),
    };
  });
};

// `value || fallback` for optional strings: empty strings fall through too
const orElse = <T>(value: string | undefined, fallback: T): string | T =>
  value !== undefined && value !== "" ? value : fallback;

const formatMarkdown = (item: BraveResult, includeContent: boolean): string => {
  const text = orElse(item.description, item.snippet);
  let markdown = `### [${orElse(item.title, "Untitled")}](${orElse(item.url, "#")})\n${text ?? ""}`;

  if (includeContent && text !== undefined && text !== "") {
    const truncatedContent =
      text.length > SEARCH_CONFIG.maxTextCharacters
        ? `${text.slice(0, SEARCH_CONFIG.maxTextCharacters - 3)}...`
        : text;
    markdown += `\n\n> ${truncatedContent}`;
  }

  return markdown;
};

const formatResults = (
  results: BraveResult[],
  includeContent: boolean
): SearchResult[] =>
  results.map((item) => ({
    url: item.url ?? "",
    title: item.title ?? "",
    description: orElse(item.description, item.snippet) ?? "",
    content: includeContent
      ? orElse(item.description, item.snippet)
      : undefined,
    markdown: formatMarkdown(item, includeContent),
  }));

export class BraveSearchProvider implements SearchAdapter {
  readonly name = "brave";
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Brave Search API key is required");
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
      signal,
    } = options;

    const limit = Math.min(maxResults, PROVIDER_LIMITS.brave.maxResults);

    try {
      const params = new URLSearchParams({
        q: query,
        count: limit.toString(),
        safesearch: "moderate",
        search_lang: "en",
        country: "US",
      });

      // Add domain filters if provided
      if (includeDomains && includeDomains.length > 0) {
        params.append("site", includeDomains.join(" OR site:"));
      }
      if (excludeDomains && excludeDomains.length > 0) {
        params.append("exclude", excludeDomains.join(" -site:"));
      }

      const response = await fetch(`${this.baseUrl}?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Brave Search failed: ${response.status} ${response.statusText}`
        );
      }

      const data: unknown = await response.json();

      return formatResults(parseBraveResults(data), scrapeContent);
    } catch (error) {
      return handleSearchError(error, "brave");
    }
  }
}
