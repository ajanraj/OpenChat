import { describe, expect, it } from "vitest";

import {
  API_KEY_PATTERNS,
  getApiKeyProviders,
  validateApiKey,
} from "../api-keys";

describe("API Keys Config", () => {
  describe("API_KEY_PATTERNS map", () => {
    it("has pattern for openai", () => {
      expect(API_KEY_PATTERNS.openai).toBeDefined();
      expect(API_KEY_PATTERNS.openai instanceof RegExp).toBeTruthy();
    });

    it("has pattern for anthropic", () => {
      expect(API_KEY_PATTERNS.anthropic).toBeDefined();
      expect(API_KEY_PATTERNS.anthropic instanceof RegExp).toBeTruthy();
    });

    it("has pattern for gemini", () => {
      expect(API_KEY_PATTERNS.gemini).toBeDefined();
      expect(API_KEY_PATTERNS.gemini instanceof RegExp).toBeTruthy();
    });

    describe("OpenAI pattern", () => {
      it("matches valid sk- format keys", () => {
        expect(
          API_KEY_PATTERNS.openai.test("sk-proj-12345678901234567890")
        ).toBeTruthy();
        expect(
          API_KEY_PATTERNS.openai.test("sk-svcacct-12345678901234567890")
        ).toBeTruthy();
        expect(
          API_KEY_PATTERNS.openai.test("sk-admin-12345678901234567890")
        ).toBeTruthy();
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.openai.test("not-a-key")).toBeFalsy();
        expect(API_KEY_PATTERNS.openai.test("")).toBeFalsy();
        expect(API_KEY_PATTERNS.openai.test("sk-short")).toBeFalsy();
      });
    });

    describe("Anthropic pattern", () => {
      it("matches valid sk-ant- format keys", () => {
        expect(API_KEY_PATTERNS.anthropic.test("sk-ant-abcdefgh")).toBeTruthy();
        expect(
          API_KEY_PATTERNS.anthropic.test("sk-ant-api03-1234567890abcdefghij")
        ).toBeTruthy();
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.anthropic.test("not-a-key")).toBeFalsy();
        expect(API_KEY_PATTERNS.anthropic.test("sk-ant-")).toBeFalsy();
        expect(API_KEY_PATTERNS.anthropic.test("")).toBeFalsy();
      });
    });

    describe("Gemini pattern", () => {
      it("matches valid AIza format keys", () => {
        expect(
          API_KEY_PATTERNS.gemini.test(
            "AIza12345678901234567890123456789012345"
          )
        ).toBeTruthy();
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.gemini.test("not-a-key")).toBeFalsy();
        expect(API_KEY_PATTERNS.gemini.test("AIza")).toBeFalsy();
        expect(API_KEY_PATTERNS.gemini.test("")).toBeFalsy();
      });
    });
  });

  describe(validateApiKey, () => {
    it("returns invalid for empty key", () => {
      const result = validateApiKey("openai", "");
      expect(result.isValid).toBeFalsy();
      expect(result.error).toBeDefined();
    });

    it("returns invalid for whitespace-only key", () => {
      const result = validateApiKey("openai", "   ");
      expect(result.isValid).toBeFalsy();
      expect(result.error).toBeDefined();
    });

    it("returns valid for correct OpenAI key format", () => {
      const result = validateApiKey("openai", "sk-proj-12345678901234567890");
      expect(result.isValid).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect OpenAI key format", () => {
      const result = validateApiKey("openai", "not-a-valid-key");
      expect(result.isValid).toBeFalsy();
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("openai");
    });

    it("returns valid for correct Anthropic key format", () => {
      const result = validateApiKey("anthropic", "sk-ant-12345678");
      expect(result.isValid).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect Anthropic key format", () => {
      const result = validateApiKey("anthropic", "not-a-valid-key");
      expect(result.isValid).toBeFalsy();
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("anthropic");
    });

    it("returns valid for correct Gemini key format", () => {
      const result = validateApiKey(
        "gemini",
        "AIza12345678901234567890123456789012345"
      );
      expect(result.isValid).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect Gemini key format", () => {
      const result = validateApiKey("gemini", "not-a-valid-key");
      expect(result.isValid).toBeFalsy();
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("google");
    });

    it("returns valid for unknown provider without pattern", () => {
      // Provider without a specific pattern should pass
      const result = validateApiKey("openrouter", "any-key-format");
      expect(result.isValid).toBeTruthy();
    });
  });

  describe(getApiKeyProviders, () => {
    it("returns an array", () => {
      const providers = getApiKeyProviders();
      expect(Array.isArray(providers)).toBeTruthy();
    });

    it("each provider has required properties", () => {
      const providers = getApiKeyProviders();
      for (const provider of providers) {
        expect(provider.id).toBeDefined();
        expect(provider.title).toBeDefined();
        expect(provider.placeholder).toBeDefined();
        expect(provider.docs).toBeDefined();
        expect(Array.isArray(provider.models)).toBeTruthy();
      }
    });

    it("provider docs are valid URLs", () => {
      const providers = getApiKeyProviders();
      for (const provider of providers) {
        expect(provider.docs.startsWith("https://")).toBeTruthy();
      }
    });
  });
});
