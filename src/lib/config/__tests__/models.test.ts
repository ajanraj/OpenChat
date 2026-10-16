import { describe, expect, it } from "vitest";
import { z } from "zod";

import { RECOMMENDED_MODELS } from "../constants";
import {
  MODELS,
  MODELS_DATA,
  MODELS_MAP,
  MODELS_OPTIONS,
  MODELS_RAW,
} from "../models/index";
import { ModelSchema } from "../schemas";

describe("Models Configuration", () => {
  describe("model data", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(MODELS_DATA)).toBeTruthy();
      expect(MODELS_DATA.length).toBeGreaterThan(0);
    });
  });

  describe("parsed model data", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(MODELS_RAW)).toBeTruthy();
      expect(MODELS_RAW.length).toBeGreaterThan(0);
    });

    it("validates all models through Zod schema", () => {
      const schema = z.array(ModelSchema);
      const result = schema.safeParse(MODELS_DATA);
      expect(result.success).toBeTruthy();
    });

    it("rejects invalid model data", () => {
      const invalidModel = {
        id: 123,
        name: "Test",
        provider: "test",
        premium: "not-boolean",
        description: "Test",
      };
      const result = ModelSchema.safeParse(invalidModel);
      expect(result.success).toBeFalsy();
    });

    it("requires mandatory fields", () => {
      const missingFields = { id: "test" };
      const result = ModelSchema.safeParse(missingFields);
      expect(result.success).toBeFalsy();
    });
  });

  describe("model list", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(MODELS)).toBeTruthy();
      expect(MODELS.length).toBeGreaterThan(0);
    });

    it("each model has required properties", () => {
      for (const model of MODELS) {
        expect(model.id).toBeTypeOf("string");
        expect(model.id.length).toBeGreaterThan(0);

        expect(model.name).toBeTypeOf("string");

        expect(model.provider).toBeTypeOf("string");
      }
    });

    it("model ids are unique", () => {
      const ids = MODELS.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("contains models from multiple providers", () => {
      const providers = new Set(MODELS.map((m) => m.provider));
      expect(providers.size).toBeGreaterThan(1);
    });

    it("includes major AI providers", () => {
      const providers = MODELS.map((m) => m.provider);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      expect(providers).toContain("gemini");
    });

    it("includes DeepSeek models", () => {
      const providers = MODELS.map((m) => m.provider);
      expect(providers).toContain("deepseek");
    });

    it("includes xAI models", () => {
      const providers = MODELS.map((m) => m.provider);
      expect(providers).toContain("xai");
    });
  });

  describe("model lookup map", () => {
    it("is an object", () => {
      expect(MODELS_MAP).toBeTypeOf("object");
      expect(MODELS_MAP).not.toBeNull();
    });

    it("contains all models from MODELS array", () => {
      for (const model of MODELS) {
        expect(MODELS_MAP[model.id]).toBeDefined();
        expect(MODELS_MAP[model.id].id).toBe(model.id);
      }
    });

    it("provides O(1) lookup by id", () => {
      const [firstModel] = MODELS;
      expect(firstModel).toBeDefined();
      const lookedUp = MODELS_MAP[firstModel.id];
      expect(lookedUp).toBeDefined();
      expect(lookedUp.id).toBe(firstModel.id);
    });

    it("returns undefined for non-existent id", () => {
      expect(MODELS_MAP["non-existent-model"]).toBeUndefined();
    });
  });

  describe("selectable model options", () => {
    it("excludes retired models while preserving them for historical lookup", () => {
      expect(
        MODELS_OPTIONS.every((model) => model.retired !== true)
      ).toBeTruthy();

      for (const model of MODELS.filter(
        (candidate) => candidate.retired === true
      )) {
        expect(MODELS_OPTIONS).not.toContain(model);
        expect(MODELS_MAP[model.id]).toBe(model);
      }
    });
  });

  describe("Model features", () => {
    it("some models have features array", () => {
      const modelsWithFeatures = MODELS.filter((m) => m.features.length > 0);
      expect(modelsWithFeatures.length).toBeGreaterThan(0);
    });

    it("some models support reasoning", () => {
      const reasoningModels = MODELS.filter((m) =>
        m.features?.some((f) => f.id === "reasoning" && f.enabled)
      );
      expect(reasoningModels.length).toBeGreaterThan(0);
    });

    it("some models support file upload", () => {
      const fileUploadModels = MODELS.filter((m) =>
        m.features?.some((f) => f.id === "file-upload" && f.enabled)
      );
      expect(fileUploadModels.length).toBeGreaterThan(0);
    });

    it("some models support tool calling", () => {
      const toolCallingModels = MODELS.filter((m) =>
        m.features?.some((f) => f.id === "tool-calling" && f.enabled)
      );
      expect(toolCallingModels.length).toBeGreaterThan(0);
    });
  });

  describe("Model premium status", () => {
    it("some models are premium", () => {
      const premiumModels = MODELS.filter((m) => m.premium);
      expect(premiumModels.length).toBeGreaterThan(0);
    });

    it("some models are not premium", () => {
      const nonPremiumModels = MODELS.filter((m) => !m.premium);
      expect(nonPremiumModels.length).toBeGreaterThan(0);
    });

    it("keeps only GPT-5.4 Nano and OpenRouter Free available without a subscription", () => {
      expect(
        MODELS.filter((model) => !model.premium)
          .map((model) => model.id)
          .toSorted()
      ).toStrictEqual(["gpt-5.4-nano", "openrouter/free"]);
    });

    it("gates every new paid chat model behind a subscription", () => {
      const newPaidChatModelIds = [
        "gpt-5.5",
        "gpt-5.6-terra",
        "gpt-6-luna",
        "gpt-6.1-sol",
        "gpt-6-astra",
        "claude-sonnet-5-5",
        "claude-opus-5-5",
        "claude-fable-5-1",
        "claude-haiku-5-5",
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "xai/grok-4.7",
        "x-ai/grok-4.20",
        "deepseek/deepseek-v4.1-flash",
        "deepseek/deepseek-v4-pro",
        "meta/muse-spark-1.3",
        "meta/muse-glimmer-30b",
        "mistral-large-4",
        "mistral-medium-latest",
        "mistral-small-latest",
        "qwen/qwen3.7-plus",
        "qwen/qwen3.8-max",
        "qwen/qwen3.8-flash",
        "moonshotai/kimi-k3",
        "moonshotai/kimi-k2.6",
        "moonshotai/kimi-k2.7-code",
        "z-ai/glm-5.3",
        "z-ai/glm-5.3-flash",
        "z-ai/glm-5v-turbo",
        "minimax/minimax-m3",
      ];

      for (const modelId of newPaidChatModelIds) {
        expect(MODELS_MAP[modelId]?.premium).toBeTruthy();
      }
    });

    it("charges only selected high-cost new chat models to premium credits", () => {
      const premiumCreditModelIds = new Set([
        "gpt-5.5",
        "gpt-5.6-terra",
        "gpt-6.1-sol",
        "gpt-6-astra",
        "claude-sonnet-5-5",
        "claude-opus-5-5",
        "claude-fable-5-1",
        "xai/grok-4.7",
        "qwen/qwen3.8-max",
        "moonshotai/kimi-k3",
      ]);
      const newChatModels = MODELS.filter(
        (model) =>
          model.premium &&
          model.legacy !== true &&
          model.id !== "gemini-3.1-pro-preview" &&
          !model.features.some(
            (feature) => feature.id === "image-generation" && feature.enabled
          )
      );

      for (const model of newChatModels) {
        expect(model.usesPremiumCredits).toBe(
          premiumCreditModelIds.has(model.id)
        );
      }
    });

    it("gates every image model behind subscription and premium credits", () => {
      const imageModels = MODELS.filter((model) =>
        model.features.some(
          (feature) => feature.id === "image-generation" && feature.enabled
        )
      );

      expect(imageModels.length).toBeGreaterThan(0);
      for (const model of imageModels) {
        expect(model.premium).toBeTruthy();
        expect(model.usesPremiumCredits).toBeTruthy();
      }
    });

    it("keeps OpenRouter Free unrestricted and unmetered", () => {
      expect(MODELS_MAP["openrouter/free"]).toMatchObject({
        premium: false,
        usesPremiumCredits: false,
        skipRateLimit: true,
      });
    });
  });

  describe("Catalog curation", () => {
    it("keeps every recommendation available and non-legacy", () => {
      for (const modelId of RECOMMENDED_MODELS) {
        const model = MODELS_MAP[modelId];
        expect(model).toBeDefined();
        expect(model.legacy).not.toBeTruthy();
        expect(model.retired).not.toBeTruthy();
      }
    });

    it("preserves known retired model metadata", () => {
      const retiredModelIds = [
        "gpt-4.5",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-3.1-flash-lite-preview",
        "gemini-3.1-flash-lite-preview-thinking",
        "openrouter/aurora-alpha",
        "x-ai/grok-4.1-fast",
        "x-ai/grok-4.1-fast-thinking",
        "deepseek/deepseek-chat-v3-0324:free",
        "deepseek/deepseek-r1-distill-llama-70b:free",
      ];

      for (const modelId of retiredModelIds) {
        expect(MODELS_MAP[modelId]?.retired).toBeTruthy();
      }
    });
  });
});
