import { describe, expect, it } from "vitest";

import {
  handleSearchError,
  SearchAuthenticationError,
  SearchError,
  SearchInvalidResponseError,
  SearchNetworkError,
  SearchRateLimitError,
} from "../search-errors";

describe("SearchError", () => {
  it("creates error with correct properties", () => {
    const error = new SearchError("Test error", "exa", "TEST_CODE");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SearchError);
    expect(error.name).toBe("SearchError");
    expect(error.message).toBe("[exa] Test error");
    expect(error.provider).toBe("exa");
    expect(error.code).toBe("TEST_CODE");
  });

  it("uses default code when not provided", () => {
    const error = new SearchError("Test error", "tavily");

    expect(error.code).toBe("SEARCH_ERROR");
  });
});

describe("SearchAuthenticationError", () => {
  it("creates error with correct properties", () => {
    const error = new SearchAuthenticationError("exa");

    expect(error).toBeInstanceOf(SearchError);
    expect(error.name).toBe("SearchAuthenticationError");
    expect(error.message).toBe("[exa] Authentication failed");
    expect(error.provider).toBe("exa");
    expect(error.code).toBe("AUTH_ERROR");
  });

  it("accepts custom message", () => {
    const error = new SearchAuthenticationError("exa", "Invalid API key");

    expect(error.message).toBe("[exa] Invalid API key");
  });
});

describe("SearchNetworkError", () => {
  it("creates error with correct properties", () => {
    const error = new SearchNetworkError("tavily");

    expect(error).toBeInstanceOf(SearchError);
    expect(error.name).toBe("SearchNetworkError");
    expect(error.message).toBe("[tavily] Network request failed");
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("accepts custom message", () => {
    const error = new SearchNetworkError("tavily", "Connection timeout");

    expect(error.message).toBe("[tavily] Connection timeout");
  });
});

describe("SearchRateLimitError", () => {
  it("creates error with correct properties", () => {
    const error = new SearchRateLimitError("brave");

    expect(error).toBeInstanceOf(SearchError);
    expect(error.name).toBe("SearchRateLimitError");
    expect(error.message).toBe("[brave] Rate limit exceeded");
    expect(error.code).toBe("RATE_LIMIT_ERROR");
  });

  it("accepts custom message", () => {
    const error = new SearchRateLimitError("brave", "Too many requests");

    expect(error.message).toBe("[brave] Too many requests");
  });
});

describe("SearchInvalidResponseError", () => {
  it("creates error with correct properties", () => {
    const error = new SearchInvalidResponseError("exa");

    expect(error).toBeInstanceOf(SearchError);
    expect(error.name).toBe("SearchInvalidResponseError");
    expect(error.message).toBe("[exa] Invalid response format");
    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it("accepts custom message", () => {
    const error = new SearchInvalidResponseError(
      "exa",
      "Missing results field"
    );

    expect(error.message).toBe("[exa] Missing results field");
  });
});

describe("handleSearchError", () => {
  it("re-throws SearchError instances", () => {
    const originalError = new SearchError("Original", "exa");

    expect(() => handleSearchError(originalError, "tavily")).toThrow(
      SearchError
    );
    expect(() => handleSearchError(originalError, "tavily")).toThrow(
      "[exa] Original"
    );
  });

  it("converts 401 errors to SearchAuthenticationError", () => {
    const error = new Error("Request failed with status 401");

    expect(() => handleSearchError(error, "exa")).toThrow(
      SearchAuthenticationError
    );
  });

  it("converts 403 errors to SearchAuthenticationError", () => {
    const error = new Error("Request failed with status 403");

    expect(() => handleSearchError(error, "exa")).toThrow(
      SearchAuthenticationError
    );
  });

  it("converts 429 errors to SearchRateLimitError", () => {
    const error = new Error("Request failed with status 429");

    expect(() => handleSearchError(error, "tavily")).toThrow(
      SearchRateLimitError
    );
  });

  it("converts ENOTFOUND errors to SearchNetworkError", () => {
    const error = new Error("getaddrinfo ENOTFOUND api.example.com");

    expect(() => handleSearchError(error, "brave")).toThrow(SearchNetworkError);
  });

  it("converts ETIMEDOUT errors to SearchNetworkError", () => {
    const error = new Error("connect ETIMEDOUT");

    expect(() => handleSearchError(error, "brave")).toThrow(SearchNetworkError);
  });

  it("wraps generic errors in SearchError", () => {
    const error = new Error("Something went wrong");

    expect(() => handleSearchError(error, "exa")).toThrow(SearchError);
    expect(() => handleSearchError(error, "exa")).toThrow(
      "[exa] Something went wrong"
    );
  });

  it("handles unknown error types", () => {
    expect(() => handleSearchError("string error", "exa")).toThrow(
      "[exa] Unknown error occurred"
    );
    expect(() => handleSearchError(null, "exa")).toThrow(
      "[exa] Unknown error occurred"
    );
    expect(() => handleSearchError(undefined, "exa")).toThrow(
      "[exa] Unknown error occurred"
    );
  });
});
