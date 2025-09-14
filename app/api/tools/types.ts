// Search provider interfaces and types
export type SearchAdapter = {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
};

export type SearchResult = {
  url: string;
  title: string;
  description: string;
  content?: string;
  markdown?: string;
};

// Exa search category types for targeted content filtering
export type ExaSearchCategory =
  | "company"
  | "research paper"
  | "news"
  | "linkedin profile"
  | "github"
  | "tweet"
  | "movie"
  | "song"
  | "personal site"
  | "pdf"
  | "financial report";

export type SearchOptions = {
  maxResults?: number;
  scrapeContent?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?: ExaSearchCategory;
};

export type SearchProvider = "exa" | "tavily" | "brave";

// Provider-specific limits from documentation
export const PROVIDER_LIMITS = {
  exa: { maxResults: 10, maxChunks: 3 },
  tavily: { maxResults: 20, maxChunks: 8 },
  brave: { maxResults: 20, maxChunks: 3 },
} as const;

// Validation function to ensure environment variable is a valid SearchProvider
function isValidSearchProvider(
  value: string | undefined
): value is SearchProvider {
  return value === "exa" || value === "tavily" || value === "brave";
}

// Get validated search provider from environment variable
function getValidatedSearchProvider(): SearchProvider {
  const envProvider = process.env.DEFAULT_SEARCH_PROVIDER;
  return isValidSearchProvider(envProvider) ? envProvider : "brave";
}

// Search configuration
export const SEARCH_CONFIG = {
  defaultProvider: getValidatedSearchProvider(),
  maxResults: 3,
  scrapeContent: true,
  maxTextCharacters: 1000,
};
