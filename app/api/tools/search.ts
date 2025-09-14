import { tool } from "ai";
import { z } from "zod";
import { searchWithFallback } from "./search-provider-factory";
import {
  type ExaSearchCategory,
  SEARCH_CONFIG,
  type SearchOptions,
  type SearchResult,
} from "./types";

// Result processing utilities
export const truncateContent = (
  content: string,
  maxLength: number = SEARCH_CONFIG.maxTextCharacters
): string => {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.substring(0, maxLength - 3)}...`;
};

export const formatMarkdown = (result: SearchResult): string => {
  let markdown = `### [${result.title}](${result.url})\n${result.description}`;

  if (result.content) {
    const truncatedContent = truncateContent(result.content);
    markdown += `\n\n> ${truncatedContent}`;
  }

  return markdown;
};

export const processResults = (results: SearchResult[]): SearchResult[] => {
  return results.map((result) => ({
    ...result,
    content: result.content ? truncateContent(result.content) : undefined,
    markdown: result.markdown || formatMarkdown(result),
  }));
};

// Main search tool
export const searchTool = tool({
  description:
    "Search the web for current information and facts. Use this when you need to verify current facts, find recent events, or get real-time data.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query string to find relevant web content"),
    maxResults: z
      .number()
      .optional()
      .default(SEARCH_CONFIG.maxResults)
      .describe(
        "Maximum number of search results to return (default: 3). Use higher values (5-10) for comprehensive research, lower values (1-2) for quick facts"
      ),
    scrapeContent: z
      .boolean()
      .optional()
      .default(SEARCH_CONFIG.scrapeContent)
      .describe(
        "Whether to fetch and include the full text content from web pages (default: true). Enable for detailed analysis, disable for faster searches when only titles/descriptions are needed"
      ),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe(
        'Restrict search to specific domains (e.g., ["nytimes.com", "reuters.com"] for news). Use when you need information from trusted or specific sources'
      ),
    excludeDomains: z
      .array(z.string())
      .optional()
      .describe(
        'Exclude specific domains from search results (e.g., ["reddit.com", "pinterest.com"]). Use to filter out any website, forums, or unreliable sources'
      ),
    startPublishedDate: z
      .string()
      .optional()
      .describe(
        "Filter results published after this date (YYYY-MM-DD format). Use for recent events, news, or time-sensitive information"
      ),
    endPublishedDate: z
      .string()
      .optional()
      .describe(
        "Filter results published before this date (YYYY-MM-DD format). Use to find historical information or exclude very recent unverified content"
      ),
    category: z
      .enum([
        "company",
        "research paper",
        "news",
        "linkedin profile",
        "github",
        "tweet",
        "movie",
        "song",
        "personal site",
        "pdf",
        "financial report",
      ] as const)
      .optional()
      .describe(
        'Focus search on specific content type for more targeted results. Options: "company" (businesses/corporations), "research paper" (academic papers), "news" (current events/articles), "linkedin profile" (professional profiles), "github" (code repositories), "tweet" (twitter/X posts), "movie" (film content), "song" (music), "personal site" (blogs/portfolios), "pdf" (PDF documents), "financial report" (financial documents)'
      ),
  }),
  execute: async ({
    query,
    maxResults,
    scrapeContent,
    includeDomains,
    excludeDomains,
    startPublishedDate,
    endPublishedDate,
    category,
  }) => {
    const options: SearchOptions = {
      maxResults,
      scrapeContent,
      includeDomains,
      excludeDomains,
      startPublishedDate,
      endPublishedDate,
      category: category as ExaSearchCategory,
    };

    try {
      // Try primary provider first, then fallback to others if needed
      const results = await searchWithFallback(query, options);
      const processedResults = processResults(results);

      return {
        success: true,
        query,
        results: processedResults,
        count: processedResults.length,
      };
    } catch (error) {
      // Return error response that can be handled gracefully
      return {
        success: false,
        query,
        results: [],
        count: 0,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});
