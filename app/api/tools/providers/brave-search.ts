import {
  PROVIDER_LIMITS,
  SEARCH_CONFIG,
  type SearchAdapter,
  type SearchOptions,
  type SearchResult,
} from "../types";

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
      });

      if (!response.ok) {
        throw new Error(
          `Brave Search failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      return this.formatResults(data.web?.results || [], scrapeContent);
    } catch (error) {
      throw new Error(
        `Failed to search with Brave: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private formatResults(
    results: unknown[],
    includeContent: boolean
  ): SearchResult[] {
    return results.map((result: unknown) => {
      const item = result as {
        url?: string;
        title?: string;
        description?: string;
        snippet?: string;
      };

      return {
        url: item.url || "",
        title: item.title || "",
        description: item.description || item.snippet || "",
        content: includeContent ? item.description || item.snippet : undefined,
        markdown: this.formatMarkdown(item, includeContent),
      };
    });
  }

  private formatMarkdown(result: unknown, includeContent: boolean): string {
    const item = result as {
      url?: string;
      title?: string;
      description?: string;
      snippet?: string;
    };

    let markdown = `### [${item.title || "Untitled"}](${item.url || "#"})\n${item.description || item.snippet || ""}`;

    if (includeContent && (item.description || item.snippet)) {
      const content = item.description || item.snippet || "";
      const truncatedContent =
        content.length > SEARCH_CONFIG.maxTextCharacters
          ? `${content.substring(0, SEARCH_CONFIG.maxTextCharacters - 3)}...`
          : content;
      markdown += `\n\n> ${truncatedContent}`;
    }

    return markdown;
  }
}
