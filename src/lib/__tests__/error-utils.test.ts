import { describe, expect, it } from "vitest";

import {
  classifyError,
  classifyStreamingError,
  createErrorPart,
  createErrorPartFromDetectedError,
  createStreamingError,
  shouldShowAsToast,
  shouldShowInConversation,
} from "../error-utils";

describe("classifyStreamingError", () => {
  it("classifies rate limit errors correctly", () => {
    const error = {
      type: "rate_limit",
      provider: "openai",
      message: "Rate limit exceeded",
      userFriendlyMessage: "Please slow down",
      isRateLimit: true,
    };

    const result = classifyStreamingError(error);

    expect(result.code).toBe("PROVIDER_STREAM_RATE_LIMIT");
    expect(result.displayType).toBe("conversation");
    expect(result.httpStatus).toBe(429);
    expect(result.responseType).toBe("provider_rate_limit");
  });

  it("classifies quota exceeded errors correctly", () => {
    const error = {
      type: "quota_exceeded",
      provider: "openai",
      message: "Quota exceeded",
      userFriendlyMessage: "Usage limit reached",
      isQuotaExceeded: true,
    };

    const result = classifyStreamingError(error);

    expect(result.code).toBe("PROVIDER_STREAM_QUOTA_EXCEEDED");
    expect(result.httpStatus).toBe(402);
    expect(result.responseType).toBe("provider_quota_exceeded");
  });

  it("classifies insufficient balance errors correctly", () => {
    const error = {
      type: "insufficient_balance",
      provider: "openai",
      message: "Insufficient balance",
      userFriendlyMessage: "Add credits",
      isInsufficientBalance: true,
    };

    const result = classifyStreamingError(error);

    expect(result.code).toBe("PROVIDER_STREAM_INSUFFICIENT_BALANCE");
    expect(result.httpStatus).toBe(402);
    expect(result.responseType).toBe("provider_insufficient_balance");
  });

  it("classifies auth errors correctly", () => {
    const error = {
      type: "auth_error",
      provider: "openai",
      message: "Invalid API key",
      userFriendlyMessage: "Authentication failed",
      isAuthError: true,
    };

    const result = classifyStreamingError(error);

    expect(result.code).toBe("PROVIDER_STREAM_AUTH_ERROR");
    expect(result.httpStatus).toBe(401);
    expect(result.responseType).toBe("provider_auth_error");
  });

  it("defaults to throttled for unknown error types", () => {
    const error = {
      type: "unknown",
      provider: "openai",
      message: "Some error",
      userFriendlyMessage: "Something went wrong",
    };

    const result = classifyStreamingError(error);

    expect(result.code).toBe("PROVIDER_STREAM_THROTTLED");
    expect(result.responseType).toBe("provider_throttled");
  });
});

describe("classifyError", () => {
  it("classifies detected errors", () => {
    const error = {
      type: "rate_limit",
      provider: "openai",
      message: "Rate limit",
      userFriendlyMessage: "Slow down",
      isRateLimit: true,
    };

    const result = classifyError(error);

    expect(result.code).toBe("PROVIDER_STREAM_RATE_LIMIT");
  });

  it("handles plain Error objects", () => {
    const error = new Error("Something went wrong");

    const result = classifyError(error);

    expect(result.code).toBe("SYSTEM_ERROR");
    expect(result.message).toBe("Something went wrong");
    expect(result.userFriendlyMessage).toBe(
      "An unexpected error occurred. Please try again."
    );
    expect(result.httpStatus).toBe(500);
  });

  it("handles objects with message property", () => {
    const error = { message: "Custom error message" };

    const result = classifyError(error);

    expect(result.message).toBe("Custom error message");
  });

  it("handles string errors", () => {
    const result = classifyError("String error");

    expect(result.message).toBe("String error");
  });

  it("handles null/undefined errors", () => {
    const nullResult = classifyError(null);
    expect(nullResult.message).toBe("null");

    const undefinedResult = classifyError(undefined);
    expect(undefinedResult.message).toBe("undefined");
  });
});

describe("createErrorPart", () => {
  it("creates error part without raw error", () => {
    const result = createErrorPart("TEST_ERROR", "Test message");

    expect(result.type).toBe("error");
    expect(result.error.code).toBe("TEST_ERROR");
    expect(result.error.message).toBe("Test message");
    expect(result.error.rawError).toBeUndefined();
  });

  it("creates error part with raw error", () => {
    const result = createErrorPart("TEST_ERROR", "Test message", "Raw error");

    expect(result.error.rawError).toBe("Raw error");
  });
});

describe("createErrorPartFromDetectedError", () => {
  it("creates error part from detected rate limit error", () => {
    const detectedError = {
      type: "rate_limit",
      provider: "openai",
      message: "Rate limit exceeded",
      userFriendlyMessage: "Please slow down",
      isRateLimit: true,
    };

    const result = createErrorPartFromDetectedError(detectedError);

    expect(result.type).toBe("error");
    expect(result.error.code).toBe("PROVIDER_STREAM_RATE_LIMIT");
    expect(result.error.message).toBe("Please slow down");
    expect(result.error.rawError).toBe("Rate limit exceeded");
  });
});

describe("createStreamingError", () => {
  it("returns shouldSaveToConversation as true for conversation errors", () => {
    const error = {
      type: "rate_limit",
      provider: "openai",
      message: "Rate limit",
      userFriendlyMessage: "Slow down",
      isRateLimit: true,
    };

    const result = createStreamingError(error);

    expect(result.shouldSaveToConversation).toBe(true);
    expect(result.errorPayload.error.type).toBe("provider_rate_limit");
    expect(result.errorPayload.error.message).toBe("Slow down");
  });
});

describe("shouldShowInConversation", () => {
  it("returns true for conversation display type errors", () => {
    const error = {
      type: "error",
      provider: "openai",
      message: "Error",
      userFriendlyMessage: "Error occurred",
      isRateLimit: true,
    };

    expect(shouldShowInConversation(error)).toBe(true);
  });

  it("returns true for plain errors (defaults to conversation)", () => {
    const error = new Error("Test error");
    expect(shouldShowInConversation(error)).toBe(true);
  });
});

describe("shouldShowAsToast", () => {
  it("returns false for conversation-only errors", () => {
    const error = {
      type: "rate_limit",
      provider: "openai",
      message: "Rate limit",
      userFriendlyMessage: "Slow down",
      isRateLimit: true,
    };

    expect(shouldShowAsToast(error)).toBe(false);
  });

  it("returns false for plain errors (defaults to conversation)", () => {
    const error = new Error("Test error");
    expect(shouldShowAsToast(error)).toBe(false);
  });
});
