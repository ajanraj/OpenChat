// Search provider interfaces and types
export interface SearchAdapter {
  readonly name: string;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  content?: string;
  markdown?: string;
}

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

export interface SearchOptions {
  maxResults?: number;
  scrapeContent?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?: ExaSearchCategory;
  // Cancels the provider request (Brave and Tavily; exa-js takes no signal) and further fallbacks
  signal?: AbortSignal;
}

export const SEARCH_PROVIDERS = ["exa", "tavily", "brave"] as const;
export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

const toSearchProvider = (
  value: string | undefined
): SearchProvider | undefined =>
  SEARCH_PROVIDERS.find((provider) => provider === value);

// Provider-specific limits from documentation
export const PROVIDER_LIMITS = {
  exa: { maxResults: 10, maxChunks: 3 },
  tavily: { maxResults: 20, maxChunks: 8 },
  brave: { maxResults: 20, maxChunks: 3 },
} as const;

// Search configuration
export const SEARCH_CONFIG = {
  // Unset or unknown values leave no default, so callers must name a provider
  defaultProvider: toSearchProvider(process.env.DEFAULT_SEARCH_PROVIDER),
  maxResults: 3,
  scrapeContent: true,
  maxTextCharacters: 1000,
};
