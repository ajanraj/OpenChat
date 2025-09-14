import {
  PROVIDER_LIMITS,
  SEARCH_CONFIG,
  type SearchAdapter,
  type SearchOptions,
  type SearchResult,
} from "../types";

export class TavilySearchProvider implements SearchAdapter {
  readonly name = "tavily";
  private readonly apiKey: string;
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
        ...(startPublishedDate && { start_published_date: startPublishedDate }),
        ...(endPublishedDate && { end_published_date: endPublishedDate }),
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `Tavily Search failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      return this.formatResults(data.results || [], scrapeContent);
    } catch (error) {
      throw new Error(
        `Failed to search with Tavily: ${error instanceof Error ? error.message : "Unknown error"}`
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
        content?: string;
        raw_content?: string;
      };

      return {
        url: item.url || "",
        title: item.title || "",
        description: item.content || "",
        content: includeContent ? item.raw_content : undefined,
        markdown: this.formatMarkdown(item, includeContent),
      };
    });
  }

  private formatMarkdown(result: unknown, includeContent: boolean): string {
    const item = result as {
      url?: string;
      title?: string;
      content?: string;
      raw_content?: string;
    };

    let markdown = `### [${item.title || "Untitled"}](${item.url || "#"})\n${item.content || ""}`;

    if (includeContent && item.raw_content) {
      const truncatedContent =
        item.raw_content.length > SEARCH_CONFIG.maxTextCharacters
          ? item.raw_content.substring(0, SEARCH_CONFIG.maxTextCharacters - 3) +
            "..."
          : item.raw_content;
      markdown += `\n\n> ${truncatedContent}`;
    }

    return markdown;
  }
}
