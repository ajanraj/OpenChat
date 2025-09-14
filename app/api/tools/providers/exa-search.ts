import Exa from "exa-js";
import {
  PROVIDER_LIMITS,
  SEARCH_CONFIG,
  type SearchAdapter,
  type SearchOptions,
  type SearchResult,
} from "../types";

export class ExaSearchProvider implements SearchAdapter {
  readonly name = "exa";
  private readonly client: Exa;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Exa Search API key is required");
    }
    this.client = new Exa(apiKey);
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
      category,
    } = options;

    const limit = Math.min(maxResults, PROVIDER_LIMITS.exa.maxResults);

    // Log initial search parameters
    // console.log('[EXA] 🔍 Starting search with params:', {
    //   query,
    //   maxResults,
    //   scrapeContent,
    //   limit,
    //   configDefaults: {
    //     maxResults: SEARCH_CONFIG.maxResults,
    //     scrapeContent: SEARCH_CONFIG.scrapeContent,
    //     maxTextCharacters: SEARCH_CONFIG.maxTextCharacters
    //   }
    // });

    try {
      const searchOptions: Record<string, unknown> = {
        numResults: limit,
        type: "hybrid",
      };

      // Add text content options ONLY when scraping is enabled
      if (scrapeContent) {
        searchOptions.text = {
          maxCharacters: SEARCH_CONFIG.maxTextCharacters,
        };
        // console.log('[EXA] 📄 Scrape content ENABLED - requesting text content with max chars:', SEARCH_CONFIG.maxTextCharacters);
      } else {
        // console.log('[EXA] 🚫 Scrape content DISABLED - using basic search without text options');
      }

      // Add domain filters
      if (includeDomains && includeDomains.length > 0) {
        searchOptions.includeDomains = includeDomains;
        // console.log('[EXA] ✅ Including domains:', includeDomains);
      }
      if (excludeDomains && excludeDomains.length > 0) {
        searchOptions.excludeDomains = excludeDomains;
        // console.log('[EXA] ❌ Excluding domains:', excludeDomains);
      }

      // Add date filters
      if (startPublishedDate) {
        searchOptions.startPublishedDate = startPublishedDate;
        // console.log('[EXA] 📅 Start date filter:', startPublishedDate);
      }
      if (endPublishedDate) {
        searchOptions.endPublishedDate = endPublishedDate;
        // console.log('[EXA] 📅 End date filter:', endPublishedDate);
      }

      // Add category filter
      if (category) {
        searchOptions.category = category;
        // console.log('[EXA] 🎯 Category filter:', category);
      }

      // console.log(`[EXA] 🚀 Using ${scrapeContent ? 'searchAndContents' : 'search'} method with options:`, searchOptions);

      // Use searchAndContents when scraping is enabled, otherwise use regular search
      const result = scrapeContent
        ? await this.client.searchAndContents(query, searchOptions)
        : await this.client.search(query, searchOptions);

      // console.log('[EXA] 📦 Received response from Exa API:', {
      //   totalResults: result.results?.length || 0,
      //   resultsWithText: result.results?.filter((r: any) => r.text).length || 0,
      //   sampleResult: result.results?.[0] ? {
      //     url: (result.results[0] as any).url,
      //     title: (result.results[0] as any).title,
      //     hasText: !!(result.results[0] as any).text,
      //     textLength: ((result.results[0] as any).text)?.length || 0,
      //     snippet: ((result.results[0] as any).snippet)?.substring(0, 100) + '...' || 'No snippet'
      //   } : null
      // });

      return this.formatResults(result.results || [], scrapeContent);
    } catch (error) {
      // console.error('[EXA] ❌ Search failed:', error);
      throw new Error(
        `Failed to search with Exa: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private formatResults(
    results: unknown[],
    includeContent: boolean
  ): SearchResult[] {
    // console.log('[EXA] 🔧 Formatting results:', {
    //   totalResults: results.length,
    //   includeContent,
    //   resultsWithText: results.filter((r: any) => r.text).length
    // });

    const formattedResults = results.map((result: unknown) => {
      const item = result as {
        url?: string;
        title?: string;
        snippet?: string;
        text?: string;
      };

      const hasText = Boolean(item.text);
      const willIncludeContent = includeContent && hasText;

      // console.log(`[EXA] 📝 Result ${index + 1}:`, {
      //   url: item.url,
      //   title: item.title?.substring(0, 50) + '...',
      //   hasText,
      //   textLength,
      //   willIncludeContent,
      //   snippetLength: item.snippet?.length || 0
      // });

      return {
        url: item.url || "",
        title: item.title || "",
        description: item.snippet || "",
        content: willIncludeContent ? item.text : undefined,
        markdown: this.formatMarkdown(item, includeContent),
      };
    });

    // console.log('[EXA] ✅ Formatted results summary:', {
    //   totalResults: formattedResults.length,
    //   resultsWithContent: formattedResults.filter(r => r.content).length,
    //   avgContentLength: formattedResults.filter(r => r.content).reduce((sum, r) => sum + (r.content?.length || 0), 0) / formattedResults.filter(r => r.content).length || 0
    // });

    return formattedResults;
  }

  private formatMarkdown(result: unknown, includeContent: boolean): string {
    const item = result as {
      url?: string;
      title?: string;
      snippet?: string;
      text?: string;
    };

    let markdown = `### [${item.title || "Untitled"}](${item.url || "#"})\n${item.snippet || ""}`;

    if (includeContent && item.text) {
      // Truncate content if too long
      const originalLength = item.text.length;
      const needsTruncation = originalLength > SEARCH_CONFIG.maxTextCharacters;
      const truncatedContent = needsTruncation
        ? `${item.text.substring(0, SEARCH_CONFIG.maxTextCharacters - 3)}...`
        : item.text;

      // console.log('[EXA] 📄 Adding content to markdown:', {
      //   originalLength,
      //   maxAllowed: SEARCH_CONFIG.maxTextCharacters,
      //   needsTruncation,
      //   finalLength: truncatedContent.length
      // });

      markdown += `\n\n> ${truncatedContent}`;
    } else if (includeContent && !item.text) {
      // console.log('[EXA] ⚠️  Content requested but no text available for result:', item.url);
    }

    return markdown;
  }
}
