import { describe, expect, it } from "vitest";
import { ANTHROPIC_MODELS } from "../anthropic";
import { DEEPSEEK_MODELS } from "../deepseek";
import { FAL_MODELS } from "../fal";
import { GOOGLE_MODELS } from "../google";
import { META_MODELS } from "../meta";
import { MINIMAX_MODELS } from "../minimax";
import { MISTRAL_MODELS } from "../mistral";
import { MOONSHOT_MODELS } from "../moonshot";
import { OPENAI_MODELS } from "../openai";
import { OPENROUTER_MODELS } from "../openrouter";
import { QWEN_MODELS } from "../qwen";
import { XAI_MODELS } from "../xai";
import { ZAI_MODELS } from "../zai";

// Helper to test model arrays
const testModelArray = (
  models: Array<{
    id: string;
    name: string;
    provider: string;
    premium?: boolean;
    features?: Array<{ id: string; enabled: boolean }>;
    api_sdk?: unknown;
  }>,
  providerName: string,
  expectedProviders: string[],
) => {
  describe(`${providerName} Models`, () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it("each model has required properties and valid provider", () => {
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(typeof model.id).toBe("string");
        expect(model.id.length).toBeGreaterThan(0);

        expect(model.name).toBeDefined();
        expect(typeof model.name).toBe("string");

        expect(expectedProviders).toContain(model.provider);
      }
    });

    it("model ids are unique", () => {
      const ids = models.map((m) => m.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("all models have api_sdk defined", () => {
      for (const model of models) {
        expect(model.api_sdk).toBeDefined();
      }
    });

    it("some models have features defined", () => {
      const modelsWithFeatures = models.filter((m) => m.features && m.features.length > 0);

      expect(modelsWithFeatures.length).toBeGreaterThan(0);
    });
  });
};

// Universal providers that can route to any model
const GATEWAY_PROVIDERS = ["openrouter", "ai-gateway", "gateway"];

// Test each provider's models
testModelArray(OPENAI_MODELS, "OpenAI", ["openai", ...GATEWAY_PROVIDERS]);
testModelArray(ANTHROPIC_MODELS, "Anthropic", ["anthropic", ...GATEWAY_PROVIDERS]);
testModelArray(GOOGLE_MODELS, "Google", ["gemini", ...GATEWAY_PROVIDERS]);
testModelArray(DEEPSEEK_MODELS, "DeepSeek", ["deepseek", ...GATEWAY_PROVIDERS]);
testModelArray(XAI_MODELS, "xAI", ["xai", ...GATEWAY_PROVIDERS]);
testModelArray(META_MODELS, "Meta", ["meta", ...GATEWAY_PROVIDERS]);
testModelArray(MISTRAL_MODELS, "Mistral", ["mistral", ...GATEWAY_PROVIDERS]);
testModelArray(FAL_MODELS, "Fal", ["fal", ...GATEWAY_PROVIDERS]);
testModelArray(MOONSHOT_MODELS, "Moonshot", ["moonshot", ...GATEWAY_PROVIDERS]);
testModelArray(ZAI_MODELS, "Zai", ["zai", ...GATEWAY_PROVIDERS]);
testModelArray(MINIMAX_MODELS, "Minimax", ["minimax", ...GATEWAY_PROVIDERS]);
testModelArray(QWEN_MODELS, "Qwen", ["qwen", ...GATEWAY_PROVIDERS]);
testModelArray(OPENROUTER_MODELS, "OpenRouter", ["openrouter", ...GATEWAY_PROVIDERS]);

describe("Model Provider Specific Tests", () => {
  describe("OpenAI Models", () => {
    it("includes GPT-5 series models", () => {
      const gpt5Models = OPENAI_MODELS.filter((m) => m.id.startsWith("gpt-5"));

      expect(gpt5Models.length).toBeGreaterThan(0);
    });

    it("includes image generation models", () => {
      const imageModels = OPENAI_MODELS.filter((m) =>
        m.features?.some((f) => f.id === "image-generation" && f.enabled),
      );

      expect(imageModels.length).toBeGreaterThan(0);
    });

    it("includes reasoning models", () => {
      const reasoningModels = OPENAI_MODELS.filter((m) =>
        m.features?.some((f) => f.id === "reasoning" && f.enabled),
      );

      expect(reasoningModels.length).toBeGreaterThan(0);
    });
  });

  describe("Anthropic Models", () => {
    it("includes Claude 4.5 models", () => {
      const claude45Models = ANTHROPIC_MODELS.filter((m) => m.id.includes("claude-4-5"));

      expect(claude45Models.length).toBeGreaterThan(0);
    });

    it("includes Opus, Sonnet, and Haiku variants", () => {
      const opusModels = ANTHROPIC_MODELS.filter((m) => m.id.includes("opus"));
      const sonnetModels = ANTHROPIC_MODELS.filter((m) => m.id.includes("sonnet"));
      const haikuModels = ANTHROPIC_MODELS.filter((m) => m.id.includes("haiku"));

      expect(opusModels.length).toBeGreaterThan(0);
      expect(sonnetModels.length).toBeGreaterThan(0);
      expect(haikuModels.length).toBeGreaterThan(0);
    });
  });

  describe("Google Models", () => {
    it("includes Gemini 2.5 models", () => {
      const gemini25Models = GOOGLE_MODELS.filter((m) => m.id.includes("gemini-2.5"));

      expect(gemini25Models.length).toBeGreaterThan(0);
    });

    it("includes image generation models (Imagen)", () => {
      const imagenModels = GOOGLE_MODELS.filter(
        (m) =>
          m.id.includes("imagen") ||
          m.features?.some((f) => f.id === "image-generation" && f.enabled),
      );

      expect(imagenModels.length).toBeGreaterThan(0);
    });

    it("includes thinking variants", () => {
      const thinkingModels = GOOGLE_MODELS.filter((m) => m.id.includes("thinking"));

      expect(thinkingModels.length).toBeGreaterThan(0);
    });
  });

  describe("DeepSeek Models", () => {
    it("includes V3 series models", () => {
      const v3Models = DEEPSEEK_MODELS.filter(
        (m) => m.id.includes("v3") || m.id.includes("deepseek-chat-v3"),
      );

      expect(v3Models.length).toBeGreaterThan(0);
    });

    it("includes R1 reasoning models", () => {
      const r1Models = DEEPSEEK_MODELS.filter((m) => m.id.includes("r1"));

      expect(r1Models.length).toBeGreaterThan(0);
    });

    it("includes reasoning variants", () => {
      const reasoningModels = DEEPSEEK_MODELS.filter((m) => m.id.includes(":reasoning"));

      expect(reasoningModels.length).toBeGreaterThan(0);
    });
  });

  describe("xAI Models", () => {
    it("includes Grok models", () => {
      const grokModels = XAI_MODELS.filter((m) => m.id.includes("grok"));

      expect(grokModels.length).toBeGreaterThan(0);
    });
  });
});
