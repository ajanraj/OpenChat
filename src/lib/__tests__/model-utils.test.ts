import { describe, expect, it } from "vitest";

import { MODEL_DEFAULT } from "@/lib/config/constants";
import { MODELS } from "@/lib/config/models";

import {
  createModelValidator,
  getDefaultReasoningEffort,
  getMessageReasoningEffort,
  getModelById,
  getModelProvider,
  getOpenRouterReasoningOptions,
  getReasoningEffortOptions,
  isModelPremium,
  normalizeReasoningEffort,
  requiresUserApiKey,
  resolveReasoningEffort,
  supportsReasoningEffort,
} from "../model-utils";

type Model = (typeof MODELS)[number];

/** Finds a configured model matching `predicate`, failing the test when there is none. */
const findModel = (predicate: (model: Model) => boolean): Model => {
  const model = MODELS.find(predicate);
  if (model === undefined) {
    throw new Error("Expected MODELS to include a matching model");
  }
  return model;
};

describe("model-utils", () => {
  describe(supportsReasoningEffort, () => {
    it("returns false for non-existent model", () => {
      expect(supportsReasoningEffort("non-existent-model")).toBeFalsy();
    });

    it("returns false for models without features", () => {
      // Find a model without reasoning feature
      const modelWithoutReasoning = findModel(
        (m) => !m.features?.some((f) => f.id === "reasoning")
      );
      expect(supportsReasoningEffort(modelWithoutReasoning.id)).toBeFalsy();
    });

    it("returns true for models with reasoning effort options", () => {
      const modelWithReasoning = findModel((m) =>
        m.features?.some(
          (f) =>
            f.id === "reasoning" &&
            f.enabled &&
            (f.effortOptions?.length ?? 0) > 0
        )
      );
      expect(supportsReasoningEffort(modelWithReasoning.id)).toBeTruthy();
    });

    it("returns false for fixed reasoning models", () => {
      const modelWithBasicReasoning = findModel((m) =>
        m.features?.some(
          (f) =>
            f.id === "reasoning" && f.enabled && f.effortOptions === undefined
        )
      );
      expect(supportsReasoningEffort(modelWithBasicReasoning.id)).toBeFalsy();
    });

    it("returns configured options and defaults", () => {
      const optionalModel = findModel((model) =>
        model.features.some(
          (feature) => feature.effortOptions?.includes("none") === true
        )
      );
      expect(getReasoningEffortOptions(optionalModel.id)).toContain("none");
      expect(getDefaultReasoningEffort(optionalModel.id)).toBe("none");
      expect(resolveReasoningEffort(optionalModel.id, "high")).toStrictEqual({
        success: true,
        effort: "high",
      });
      expect(resolveReasoningEffort(optionalModel.id)).toStrictEqual({
        success: true,
        effort: "none",
      });
    });

    it("rejects efforts outside the model's exact options", () => {
      const toggleModel = MODELS.find((model) =>
        model.features.some(
          (feature) =>
            feature.effortOptions?.length === 2 &&
            feature.effortOptions.includes("high")
        )
      );
      if (!toggleModel) {
        throw new Error("Expected a model with toggle reasoning");
      }
      expect(resolveReasoningEffort(toggleModel.id, "medium")).toStrictEqual({
        success: false,
      });
    });

    it("normalizes edit effort to the selected model", () => {
      expect(normalizeReasoningEffort("xai/grok-4.5", "none")).toBe("low");
      expect(normalizeReasoningEffort("xai/grok-4.5", "high")).toBe("high");
      expect(normalizeReasoningEffort("z-ai/glm-5.2", "medium")).toBe("none");
    });

    it("resolves edit effort from message history before chat fallback", () => {
      expect(getMessageReasoningEffort("xai/grok-4.5", "high", "none")).toBe(
        "high"
      );
      expect(getMessageReasoningEffort("xai/grok-4.5", undefined, "none")).toBe(
        "low"
      );
      expect(
        getMessageReasoningEffort("xai/grok-4.5", "invalid", "medium")
      ).toBe("medium");
    });

    it("matches provider-specific reasoning capabilities", () => {
      expect(getReasoningEffortOptions("xai/grok-4.5")).toStrictEqual([
        "low",
        "medium",
        "high",
      ]);
      expect(getReasoningEffortOptions("moonshotai/kimi-k3")).toStrictEqual([
        "xhigh",
        "high",
        "low",
      ]);
      expect(getDefaultReasoningEffort("moonshotai/kimi-k3")).toBe("xhigh");
      expect(getReasoningEffortOptions("mistral-medium-latest")).toStrictEqual(
        []
      );
      expect(getReasoningEffortOptions("z-ai/glm-5.2")).toStrictEqual([
        "none",
        "high",
      ]);

      const fixedReasoningModelIds = [
        "minimax/minimax-m2.7",
        "minimax/minimax-m2.5",
        "minimax/minimax-m2.1",
        "minimax/minimax-m2",
        "qwen/qwen3-235b-a22b-thinking-2507",
      ];

      for (const modelId of fixedReasoningModelIds) {
        const reasoningFeature = MODELS.find(
          (model) => model.id === modelId
        )?.features.find((feature) => feature.id === "reasoning");
        expect(reasoningFeature).toMatchObject({ enabled: true });
        expect(reasoningFeature).not.toHaveProperty("effortOptions");
        expect(supportsReasoningEffort(modelId)).toBeFalsy();
      }
    });

    it("rejects unsupported provider-specific efforts", () => {
      expect(resolveReasoningEffort("xai/grok-4.5", "none")).toStrictEqual({
        success: false,
      });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "low")).toStrictEqual({
        success: false,
      });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "medium")).toStrictEqual({
        success: false,
      });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "high")).toStrictEqual({
        success: true,
        effort: "high",
      });
      expect(
        resolveReasoningEffort("mistral-medium-latest", "high")
      ).toStrictEqual({
        success: false,
      });

      for (const modelId of [
        "minimax/minimax-m2.7",
        "minimax/minimax-m2.5",
        "minimax/minimax-m2.1",
        "minimax/minimax-m2",
        "qwen/qwen3-235b-a22b-thinking-2507",
      ]) {
        expect(resolveReasoningEffort(modelId, "none")).toStrictEqual({
          success: false,
        });
        expect(resolveReasoningEffort(modelId)).toStrictEqual({
          success: true,
          effort: undefined,
        });
      }
    });

    it("maps OpenRouter effort to call-level provider options", () => {
      const openRouterReasoningModel = MODELS.find(
        (model) =>
          model.provider === "openrouter" &&
          getReasoningEffortOptions(model.id).length > 0
      );
      if (!openRouterReasoningModel) {
        throw new Error("Expected a configurable OpenRouter reasoning model");
      }

      expect(
        getOpenRouterReasoningOptions(openRouterReasoningModel.id, "none")
      ).toStrictEqual({
        reasoning: { enabled: false, effort: "none" },
      });
      expect(
        getOpenRouterReasoningOptions(openRouterReasoningModel.id, "high")
      ).toStrictEqual({
        reasoning: { enabled: true, effort: "high" },
      });
      expect(
        getOpenRouterReasoningOptions(MODEL_DEFAULT, "high")
      ).toStrictEqual({});
    });
  });

  describe(createModelValidator, () => {
    it("returns a function", () => {
      const validator = createModelValidator();
      expect(validator).toBeTypeOf("function");
    });

    it("returns preferred model when it exists", () => {
      const validator = createModelValidator();
      const validModel = MODELS[0]?.id;
      expect(validModel).toBeDefined();
      expect(validator(validModel)).toBe(validModel);
    });

    it("returns default model for non-existent model", () => {
      const validator = createModelValidator();
      expect(validator("non-existent-model")).toBe(MODEL_DEFAULT);
    });

    it("returns default model when preferred is disabled", () => {
      const validator = createModelValidator();
      const validModel = MODELS[0]?.id;
      expect(validModel).toBeDefined();
      expect(validator(validModel, [validModel])).toBe(MODEL_DEFAULT);
    });

    it("returns default model for retired models", () => {
      const validator = createModelValidator();
      const retiredModel = findModel((model) => model.retired === true);
      expect(validator(retiredModel.id)).toBe(MODEL_DEFAULT);
    });

    it("returns preferred model when not in disabled list", () => {
      const validator = createModelValidator();
      const validModel = MODELS[0]?.id;
      expect(validModel).toBeDefined();
      expect(validator(validModel, ["some-other-model"])).toBe(validModel);
    });
  });

  describe(getModelById, () => {
    it("returns undefined for non-existent model", () => {
      expect(getModelById("non-existent-model")).toBeUndefined();
    });

    it("returns model for existing id", () => {
      const [model] = MODELS;
      expect(model).toBeDefined();
      const result = getModelById(model.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(model.id);
    });

    it("returns model with all expected properties", () => {
      const [model] = MODELS;
      expect(model).toBeDefined();
      const result = getModelById(model.id);
      expect(result?.id).toBeDefined();
      expect(result?.name).toBeDefined();
      expect(result?.provider).toBeDefined();
    });
  });

  describe(isModelPremium, () => {
    it("returns false for non-existent model", () => {
      expect(isModelPremium("non-existent-model")).toBeFalsy();
    });

    it("returns true for premium models", () => {
      const premiumModel = findModel((m) => m.premium);
      expect(isModelPremium(premiumModel.id)).toBeTruthy();
    });

    it("returns false for non-premium models", () => {
      const nonPremiumModel = findModel((m) => !m.premium);
      expect(isModelPremium(nonPremiumModel.id)).toBeFalsy();
    });
  });

  describe(requiresUserApiKey, () => {
    it("returns false for non-existent model", () => {
      expect(requiresUserApiKey("non-existent-model")).toBeFalsy();
    });

    it("returns true for models requiring user API key", () => {
      const userKeyModel = findModel((m) => m.apiKeyUsage.userKeyOnly);
      expect(requiresUserApiKey(userKeyModel.id)).toBeTruthy();
    });

    it("returns false for models not requiring user API key", () => {
      const noUserKeyModel = findModel((m) => !m.apiKeyUsage?.userKeyOnly);
      expect(requiresUserApiKey(noUserKeyModel.id)).toBeFalsy();
    });
  });

  describe(getModelProvider, () => {
    it("returns undefined for non-existent model", () => {
      expect(getModelProvider("non-existent-model")).toBeUndefined();
    });

    it("returns provider for existing model", () => {
      const [model] = MODELS;
      expect(model).toBeDefined();
      const provider = getModelProvider(model.id);
      expect(provider).toBeDefined();
      expect(provider).toBeTypeOf("string");
    });

    it("returns correct provider for different models", () => {
      // Test a few known providers
      const openaiModel = findModel((m) => m.provider === "openai");
      expect(getModelProvider(openaiModel.id)).toBe("openai");

      const anthropicModel = findModel((m) => m.provider === "anthropic");
      expect(getModelProvider(anthropicModel.id)).toBe("anthropic");

      const googleModel = findModel((m) => m.provider === "gemini");
      expect(getModelProvider(googleModel.id)).toBe("gemini");
    });
  });
});
