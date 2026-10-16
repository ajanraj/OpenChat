import { describe, expect, it } from "vitest";

import {
  detectProviderErrorFromObject,
  detectProviderErrorInText,
  shouldTriggerFallback,
} from "../provider-error-detector";

describe("detectProviderErrorInText", () => {
  describe("OpenAI errors", () => {
    it("detects quota exceeded errors", () => {
      const result = detectProviderErrorInText(
        "Error: You exceeded your current quota",
        "openai"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("QUOTA_EXCEEDED");
      expect(result?.provider).toBe("openai");
      expect(result?.isQuotaExceeded).toBe(true);
    });

    it("detects rate limit errors", () => {
      const result = detectProviderErrorInText(
        "Rate limit reached for requests",
        "openai"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("RATE_LIMIT");
      expect(result?.isRateLimit).toBe(true);
    });

    it("detects authentication errors", () => {
      const result = detectProviderErrorInText(
        "Invalid API key provided",
        "openai"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("AUTH_ERROR");
      expect(result?.isAuthError).toBe(true);
    });
  });

  describe("Anthropic errors", () => {
    it("detects insufficient credits errors", () => {
      const result = detectProviderErrorInText(
        "Your credit balance is too low",
        "anthropic"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("INSUFFICIENT_BALANCE");
      expect(result?.provider).toBe("anthropic");
      expect(result?.isInsufficientBalance).toBe(true);
    });

    it("detects rate limit errors", () => {
      const result = detectProviderErrorInText(
        "Rate limit exceeded for Claude",
        "anthropic"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("RATE_LIMIT");
    });
  });

  describe("Google errors", () => {
    it("detects resource exhausted errors", () => {
      const result = detectProviderErrorInText(
        "RESOURCE_EXHAUSTED: Quota exceeded",
        "google"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("QUOTA_EXCEEDED");
      expect(result?.provider).toBe("google");
    });

    it("detects authentication errors", () => {
      const result = detectProviderErrorInText(
        "API key not valid. Please pass a valid API key",
        "google"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("AUTH_ERROR");
    });
  });

  describe("xAI errors", () => {
    it("detects rate limit errors", () => {
      const result = detectProviderErrorInText(
        "Too many requests to Grok API",
        "xai"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("RATE_LIMIT");
      expect(result?.provider).toBe("xai");
    });
  });

  describe("DeepSeek errors", () => {
    it("detects timeout errors", () => {
      const result = detectProviderErrorInText(
        "Request timeout. Please try again.",
        "deepseek"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("RATE_LIMIT");
      expect(result?.provider).toBe("deepseek");
    });
  });

  describe("OpenRouter errors", () => {
    it("detects insufficient balance errors", () => {
      const result = detectProviderErrorInText(
        "You have a negative credit balance",
        "openrouter"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("INSUFFICIENT_BALANCE");
      expect(result?.provider).toBe("openrouter");
    });
  });

  describe("Generic errors", () => {
    it("detects rate limit patterns for unknown providers", () => {
      const result = detectProviderErrorInText(
        "Too many requests, please slow down",
        "unknown_provider"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("RATE_LIMIT");
      expect(result?.provider).toBe("unknown_provider");
    });

    it("detects quota patterns for unknown providers", () => {
      const result = detectProviderErrorInText(
        "Your usage limit has been reached",
        "unknown_provider"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("QUOTA_EXCEEDED");
    });

    it("detects auth patterns for unknown providers", () => {
      const result = detectProviderErrorInText(
        "Unauthorized: 401 error",
        "unknown_provider"
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe("AUTH_ERROR");
    });
  });

  it("returns null for empty text", () => {
    expect(detectProviderErrorInText("", "openai")).toBeNull();
  });

  it("returns null for empty provider", () => {
    expect(detectProviderErrorInText("Some error", "")).toBeNull();
  });

  it("returns null when no error pattern matches", () => {
    const result = detectProviderErrorInText(
      "Hello world, this is a normal response",
      "openai"
    );
    expect(result).toBeNull();
  });
});

describe("detectProviderErrorFromObject", () => {
  it("extracts error from string", () => {
    const result = detectProviderErrorFromObject(
      "Rate limit exceeded",
      "openai"
    );
    expect(result).not.toBeNull();
    expect(result?.type).toBe("RATE_LIMIT");
  });

  it("extracts error from Error object", () => {
    const error = new Error("You exceeded your current quota");
    const result = detectProviderErrorFromObject(error, "openai");
    expect(result).not.toBeNull();
    expect(result?.type).toBe("QUOTA_EXCEEDED");
  });

  it("extracts error from object with message property", () => {
    const error = { message: "Invalid API key provided" };
    const result = detectProviderErrorFromObject(error, "openai");
    expect(result).not.toBeNull();
    expect(result?.type).toBe("AUTH_ERROR");
  });

  it("returns null for null error", () => {
    expect(detectProviderErrorFromObject(null, "openai")).toBeNull();
  });

  it("returns null for null provider", () => {
    expect(
      detectProviderErrorFromObject("Some error", null as unknown as string)
    ).toBeNull();
  });
});

describe("shouldTriggerFallback", () => {
  it("returns true for auth errors", () => {
    const error = {
      type: "AUTH_ERROR",
      provider: "openai",
      message: "Invalid API key",
      userFriendlyMessage: "Invalid API key",
      isAuthError: true,
    };
    expect(shouldTriggerFallback(error)).toBe(true);
  });

  it("returns true for insufficient balance", () => {
    const error = {
      type: "INSUFFICIENT_BALANCE",
      provider: "anthropic",
      message: "Balance too low",
      userFriendlyMessage: "Balance too low",
      isInsufficientBalance: true,
    };
    expect(shouldTriggerFallback(error)).toBe(true);
  });

  it("returns true for quota exceeded", () => {
    const error = {
      type: "QUOTA_EXCEEDED",
      provider: "openai",
      message: "Quota exceeded",
      userFriendlyMessage: "Quota exceeded",
      isQuotaExceeded: true,
    };
    expect(shouldTriggerFallback(error)).toBe(true);
  });

  it("returns false for rate limit errors", () => {
    const error = {
      type: "RATE_LIMIT",
      provider: "openai",
      message: "Rate limit",
      userFriendlyMessage: "Rate limit",
      isRateLimit: true,
    };
    expect(shouldTriggerFallback(error)).toBe(false);
  });
});
