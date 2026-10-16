import { describe, expect, it } from "vitest";

import {
  API_KEY_PATTERNS,
  getApiKeyProviders,
  validateApiKey,
} from "../api-keys";

describe("API Keys Config", () => {
  describe("API_KEY_PATTERNS", () => {
    it("has pattern for openai", () => {
      expect(API_KEY_PATTERNS.openai).toBeDefined();
      expect(API_KEY_PATTERNS.openai instanceof RegExp).toBe(true);
    });

    it("has pattern for anthropic", () => {
      expect(API_KEY_PATTERNS.anthropic).toBeDefined();
      expect(API_KEY_PATTERNS.anthropic instanceof RegExp).toBe(true);
    });

    it("has pattern for gemini", () => {
      expect(API_KEY_PATTERNS.gemini).toBeDefined();
      expect(API_KEY_PATTERNS.gemini instanceof RegExp).toBe(true);
    });

    describe("OpenAI pattern", () => {
      it("matches valid sk- format keys", () => {
        expect(
          API_KEY_PATTERNS.openai.test("sk-proj-12345678901234567890")
        ).toBe(true);
        expect(
          API_KEY_PATTERNS.openai.test("sk-svcacct-12345678901234567890")
        ).toBe(true);
        expect(
          API_KEY_PATTERNS.openai.test("sk-admin-12345678901234567890")
        ).toBe(true);
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.openai.test("not-a-key")).toBe(false);
        expect(API_KEY_PATTERNS.openai.test("")).toBe(false);
        expect(API_KEY_PATTERNS.openai.test("sk-short")).toBe(false);
      });
    });

    describe("Anthropic pattern", () => {
      it("matches valid sk-ant- format keys", () => {
        expect(API_KEY_PATTERNS.anthropic.test("sk-ant-abcdefgh")).toBe(true);
        expect(
          API_KEY_PATTERNS.anthropic.test("sk-ant-api03-1234567890abcdefghij")
        ).toBe(true);
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.anthropic.test("not-a-key")).toBe(false);
        expect(API_KEY_PATTERNS.anthropic.test("sk-ant-")).toBe(false);
        expect(API_KEY_PATTERNS.anthropic.test("")).toBe(false);
      });
    });

    describe("Gemini pattern", () => {
      it("matches valid AIza format keys", () => {
        expect(
          API_KEY_PATTERNS.gemini.test(
            "AIza12345678901234567890123456789012345"
          )
        ).toBe(true);
      });

      it("rejects invalid keys", () => {
        expect(API_KEY_PATTERNS.gemini.test("not-a-key")).toBe(false);
        expect(API_KEY_PATTERNS.gemini.test("AIza")).toBe(false);
        expect(API_KEY_PATTERNS.gemini.test("")).toBe(false);
      });
    });
  });

  describe("validateApiKey", () => {
    it("returns invalid for empty key", () => {
      const result = validateApiKey("openai", "");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns invalid for whitespace-only key", () => {
      const result = validateApiKey("openai", "   ");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns valid for correct OpenAI key format", () => {
      const result = validateApiKey("openai", "sk-proj-12345678901234567890");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect OpenAI key format", () => {
      const result = validateApiKey("openai", "not-a-valid-key");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("openai");
    });

    it("returns valid for correct Anthropic key format", () => {
      const result = validateApiKey("anthropic", "sk-ant-12345678");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect Anthropic key format", () => {
      const result = validateApiKey("anthropic", "not-a-valid-key");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("anthropic");
    });

    it("returns valid for correct Gemini key format", () => {
      const result = validateApiKey(
        "gemini",
        "AIza12345678901234567890123456789012345"
      );
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns invalid for incorrect Gemini key format", () => {
      const result = validateApiKey("gemini", "not-a-valid-key");
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain("google");
    });

    it("returns valid for unknown provider without pattern", () => {
      // Provider without a specific pattern should pass
      const result = validateApiKey("openrouter", "any-key-format");
      expect(result.isValid).toBe(true);
    });
  });

  describe("getApiKeyProviders", () => {
    it("returns an array", () => {
      const providers = getApiKeyProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it("each provider has required properties", () => {
      const providers = getApiKeyProviders();
      for (const provider of providers) {
        expect(provider.id).toBeDefined();
        expect(provider.title).toBeDefined();
        expect(provider.placeholder).toBeDefined();
        expect(provider.docs).toBeDefined();
        expect(Array.isArray(provider.models)).toBe(true);
      }
    });

    it("provider docs are valid URLs", () => {
      const providers = getApiKeyProviders();
      for (const provider of providers) {
        expect(provider.docs.startsWith("https://")).toBe(true);
      }
    });
  });
});
