import { handleSearchError } from "../search-errors";
import { PROVIDER_LIMITS, SEARCH_CONFIG } from "../types";
import type { SearchAdapter, SearchOptions, SearchResult } from "../types";

// Fields read from one entry of Keenable's `results` array
interface KeenableResult {
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
}

const getStringField = (value: object, key: string): string | undefined => {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : undefined;
};

/**
 * Reads the result entries from a Keenable response body. A reply without results has none; any
 * other malformed reply throws, so the search falls back to the next provider.
 */
const parseKeenableResults = (data: unknown): KeenableResult[] => {
  if (typeof data !== "object" || data === null) {
    throw new TypeError("Keenable returned a malformed reply");
  }
  const results: unknown = "results" in data ? data.results : undefined;
  if (results === undefined || results === null) {
    return [];
  }
  if (!Array.isArray(results)) {
    throw new TypeError("Keenable returned malformed results");
  }
  return results.map((result: unknown): KeenableResult => {
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

const truncate = (text: string): string =>
  text.length > SEARCH_CONFIG.maxTextCharacters
    ? `${text.slice(0, SEARCH_CONFIG.maxTextCharacters - 3)}...`
    : text;

const hostMatches = (url: string, domains: string[]): boolean => {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => {
    const d = domain.toLowerCase().replace(/^\*?\./u, "");
    return host === d || host.endsWith(`.${d}`);
  });
};

const formatResults = (
  results: KeenableResult[],
  includeContent: boolean
): SearchResult[] =>
  results.map((item) => {
    const title =
      item.title !== undefined && item.title !== "" ? item.title : "Untitled";
    const url = item.url !== undefined && item.url !== "" ? item.url : "#";
    const snippet = item.snippet ?? "";
    const description =
      item.description !== undefined && item.description !== ""
        ? item.description
        : truncate(snippet);
    let markdown = `### [${title}](${url})\n${description}`;
    // Only quote the snippet when the description came from Keenable itself;
    // otherwise the description is already the (truncated) snippet.
    const hasOwnDescription =
      item.description !== undefined && item.description !== "";
    if (
      includeContent &&
      hasOwnDescription &&
      snippet !== "" &&
      truncate(snippet) !== description
    ) {
      markdown += `\n\n> ${truncate(snippet)}`;
    }
    return {
      url: item.url ?? "",
      title: item.title ?? "",
      description,
      content: includeContent && snippet !== "" ? snippet : undefined,
      markdown,
    };
  });

/**
 * Keenable web search (https://keenable.ai). Works without an API key on the
 * rate-limited public endpoint; set KEENABLE_API_KEY for the keyed endpoint.
 */
export class KeenableSearchProvider implements SearchAdapter {
  readonly name = "keenable";
  readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey === undefined || apiKey === "" ? undefined : apiKey;
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

    // Keenable has no exclude filter, so excluded domains are removed from the results
    const limit = Math.max(
      1,
      Math.min(maxResults, PROVIDER_LIMITS.keenable.maxResults)
    );

    try {
      const requestBody = {
        query,
        max_results: limit,
        ...(includeDomains !== undefined &&
          includeDomains.length > 0 && { site: includeDomains[0] }),
        ...(startPublishedDate !== undefined &&
          startPublishedDate !== "" && { published_after: startPublishedDate }),
        ...(endPublishedDate !== undefined &&
          endPublishedDate !== "" && { published_before: endPublishedDate }),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      let url = "https://api.keenable.ai/v1/search/public";
      if (this.apiKey === undefined) {
        headers["X-Keenable-Title"] = "OpenChat";
      } else {
        url = "https://api.keenable.ai/v1/search";
        headers["X-API-Key"] = this.apiKey;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Keenable Search failed: ${response.status} ${response.statusText}`
        );
      }

      const data: unknown = await response.json();

      const parsed = parseKeenableResults(data);
      const kept =
        excludeDomains !== undefined && excludeDomains.length > 0
          ? parsed.filter(
              (item) =>
                item.url === undefined || !hostMatches(item.url, excludeDomains)
            )
          : parsed;
      return formatResults(kept, scrapeContent);
    } catch (error) {
      return handleSearchError(error, "keenable");
    }
  }
}
