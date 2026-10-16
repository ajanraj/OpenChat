import type { SearchProvider } from "./types";

export type SearchErrorCode =
  | "SEARCH_ERROR"
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMIT_ERROR"
  | "INVALID_RESPONSE";

/** A failed search, tagged with the provider and what went wrong. */
export class SearchError extends Error {
  readonly provider: SearchProvider;
  readonly code: SearchErrorCode;

  constructor(
    message: string,
    provider: SearchProvider,
    code: SearchErrorCode = "SEARCH_ERROR"
  ) {
    super(`[${provider}] ${message}`);
    this.name = "SearchError";
    this.provider = provider;
    this.code = code;
  }
}

// Explicitly typed so TypeScript treats calls as never-returning in control-flow analysis
export const handleSearchError: (
  error: unknown,
  provider: SearchProvider
) => never = (error, provider) => {
  // Handle search errors without console logging to avoid linting issues

  if (error instanceof SearchError) {
    throw error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes("401") || error.message.includes("403")) {
      throw new SearchError(error.message, provider, "AUTH_ERROR");
    }

    if (error.message.includes("429")) {
      throw new SearchError(error.message, provider, "RATE_LIMIT_ERROR");
    }

    if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ETIMEDOUT")
    ) {
      throw new SearchError(error.message, provider, "NETWORK_ERROR");
    }

    throw new SearchError(error.message, provider);
  }

  throw new SearchError("Unknown error occurred", provider);
};
