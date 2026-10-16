import { describe, expect, it } from "vitest";

import { handleSearchError, SearchError } from "../search-errors";
import type { SearchErrorCode } from "../search-errors";

/** Returns whatever `fn` throws, so its fields can be asserted. */
const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
};

describe(SearchError, () => {
  it("is an Error subclass", () => {
    const error = new SearchError("Test error", "exa", "AUTH_ERROR");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SearchError);
  });

  it("creates error with correct properties", () => {
    const error = new SearchError("Test error", "exa");

    expect(error).toMatchObject({
      name: "SearchError",
      message: "[exa] Test error",
      provider: "exa",
      code: "SEARCH_ERROR",
    });
  });

  it.each<SearchErrorCode>([
    "AUTH_ERROR",
    "NETWORK_ERROR",
    "RATE_LIMIT_ERROR",
    "INVALID_RESPONSE",
  ])("keeps the %s code", (code) => {
    const error = new SearchError("Custom message", "tavily", code);

    expect(error).toMatchObject({
      name: "SearchError",
      message: "[tavily] Custom message",
      provider: "tavily",
      code,
    });
  });
});

describe(handleSearchError, () => {
  it("re-throws SearchError instances", () => {
    const originalError = new SearchError("Original", "exa");

    expect(thrownBy(() => handleSearchError(originalError, "tavily"))).toBe(
      originalError
    );
  });

  it.each<[string, SearchErrorCode]>([
    ["Request failed with status 401", "AUTH_ERROR"],
    ["Request failed with status 403", "AUTH_ERROR"],
    ["Request failed with status 429", "RATE_LIMIT_ERROR"],
    ["getaddrinfo ENOTFOUND api.example.com", "NETWORK_ERROR"],
    ["connect ETIMEDOUT", "NETWORK_ERROR"],
    ["Something went wrong", "SEARCH_ERROR"],
  ])("converts %j to a %s SearchError", (message, code) => {
    const thrown = thrownBy(() =>
      handleSearchError(new Error(message), "brave")
    );

    expect(thrown).toBeInstanceOf(SearchError);
    expect(thrown).toMatchObject({ code, message: `[brave] ${message}` });
  });

  it.each([["string error"], [null], [undefined]])(
    "handles unknown error type %j",
    (value) => {
      expect(() => handleSearchError(value, "exa")).toThrow(
        "[exa] Unknown error occurred"
      );
    }
  );
});
