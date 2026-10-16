import type { SearchProvider } from "./types";

export class SearchError extends Error {
  provider: SearchProvider;
  code: string;

  constructor(
    message: string,
    provider: SearchProvider,
    code = "SEARCH_ERROR"
  ) {
    super(`[${provider}] ${message}`);
    this.name = "SearchError";
    this.provider = provider;
    this.code = code;
  }
}

export class SearchAuthenticationError extends SearchError {
  constructor(provider: SearchProvider, message = "Authentication failed") {
    super(message, provider, "AUTH_ERROR");
    this.name = "SearchAuthenticationError";
  }
}

export class SearchNetworkError extends SearchError {
  constructor(provider: SearchProvider, message = "Network request failed") {
    super(message, provider, "NETWORK_ERROR");
    this.name = "SearchNetworkError";
  }
}

export class SearchRateLimitError extends SearchError {
  constructor(provider: SearchProvider, message = "Rate limit exceeded") {
    super(message, provider, "RATE_LIMIT_ERROR");
    this.name = "SearchRateLimitError";
  }
}

export class SearchInvalidResponseError extends SearchError {
  constructor(provider: SearchProvider, message = "Invalid response format") {
    super(message, provider, "INVALID_RESPONSE");
    this.name = "SearchInvalidResponseError";
  }
}

export function handleSearchError(
  error: unknown,
  provider: SearchProvider
): never {
  // Handle search errors without console logging to avoid linting issues

  if (error instanceof SearchError) {
    throw error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes("401") || error.message.includes("403")) {
      throw new SearchAuthenticationError(provider, error.message);
    }

    if (error.message.includes("429")) {
      throw new SearchRateLimitError(provider, error.message);
    }

    if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ETIMEDOUT")
    ) {
      throw new SearchNetworkError(provider, error.message);
    }

    throw new SearchError(error.message, provider);
  }

  throw new SearchError("Unknown error occurred", provider);
}
