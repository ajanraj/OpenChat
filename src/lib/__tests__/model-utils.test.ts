import { describe, expect, it } from "vitest";
import { MODEL_DEFAULT, MODELS } from "@/lib/config";
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

describe("model-utils", () => {
  describe("supportsReasoningEffort", () => {
    it("returns false for non-existent model", () => {
      expect(supportsReasoningEffort("non-existent-model")).toBe(false);
    });

    it("returns false for models without features", () => {
      // Find a model without reasoning feature
      const modelWithoutReasoning = MODELS.find(
        (m) => !m.features?.some((f) => f.id === "reasoning"),
      );
      expect(modelWithoutReasoning).toBeDefined();
      expect(supportsReasoningEffort(modelWithoutReasoning!.id)).toBe(false);
    });

    it("returns true for models with reasoning effort options", () => {
      const modelWithReasoning = MODELS.find((m) =>
        m.features?.some(
          (f) => f.id === "reasoning" && f.enabled && (f.effortOptions?.length ?? 0) > 0,
        ),
      );
      expect(modelWithReasoning).toBeDefined();
      expect(supportsReasoningEffort(modelWithReasoning!.id)).toBe(true);
    });

    it("returns false for fixed reasoning models", () => {
      const modelWithBasicReasoning = MODELS.find((m) =>
        m.features?.some((f) => f.id === "reasoning" && f.enabled && f.effortOptions === undefined),
      );
      expect(modelWithBasicReasoning).toBeDefined();
      expect(supportsReasoningEffort(modelWithBasicReasoning!.id)).toBe(false);
    });

    it("returns configured options and defaults", () => {
      const optionalModel = MODELS.find((model) =>
        model.features.some((feature) => feature.effortOptions?.includes("none")),
      );
      expect(optionalModel).toBeDefined();
      expect(getReasoningEffortOptions(optionalModel!.id)).toContain("none");
      expect(getDefaultReasoningEffort(optionalModel!.id)).toBe("none");
      expect(resolveReasoningEffort(optionalModel!.id, "high")).toEqual({
        success: true,
        effort: "high",
      });
      expect(resolveReasoningEffort(optionalModel!.id)).toEqual({
        success: true,
        effort: "none",
      });
    });

    it("rejects efforts outside the model's exact options", () => {
      const toggleModel = MODELS.find((model) =>
        model.features.some(
          (feature) =>
            feature.effortOptions?.length === 2 && feature.effortOptions.includes("high"),
        ),
      );
      if (!toggleModel) {
        throw new Error("Expected a model with toggle reasoning");
      }
      expect(resolveReasoningEffort(toggleModel.id, "medium")).toEqual({ success: false });
    });

    it("normalizes edit effort to the selected model", () => {
      expect(normalizeReasoningEffort("xai/grok-4.5", "none")).toBe("low");
      expect(normalizeReasoningEffort("xai/grok-4.5", "high")).toBe("high");
      expect(normalizeReasoningEffort("z-ai/glm-5.2", "medium")).toBe("none");
    });

    it("resolves edit effort from message history before chat fallback", () => {
      expect(getMessageReasoningEffort("xai/grok-4.5", "high", "none")).toBe("high");
      expect(getMessageReasoningEffort("xai/grok-4.5", undefined, "none")).toBe("low");
      expect(getMessageReasoningEffort("xai/grok-4.5", "invalid", "medium")).toBe("medium");
    });

    it("matches provider-specific reasoning capabilities", () => {
      expect(getReasoningEffortOptions("xai/grok-4.5")).toEqual(["low", "medium", "high"]);
      expect(getReasoningEffortOptions("moonshotai/kimi-k3")).toEqual(["xhigh", "high", "low"]);
      expect(getDefaultReasoningEffort("moonshotai/kimi-k3")).toBe("xhigh");
      expect(getReasoningEffortOptions("mistral-medium-latest")).toEqual([]);
      expect(getReasoningEffortOptions("z-ai/glm-5.2")).toEqual(["none", "high"]);

      const fixedReasoningModelIds = [
        "minimax/minimax-m2.7",
        "minimax/minimax-m2.5",
        "minimax/minimax-m2.1",
        "minimax/minimax-m2",
        "qwen/qwen3-235b-a22b-thinking-2507",
      ];

      for (const modelId of fixedReasoningModelIds) {
        const reasoningFeature = MODELS.find((model) => model.id === modelId)?.features.find(
          (feature) => feature.id === "reasoning",
        );
        expect(reasoningFeature).toMatchObject({ enabled: true });
        expect(reasoningFeature).not.toHaveProperty("effortOptions");
        expect(supportsReasoningEffort(modelId)).toBe(false);
      }
    });

    it("rejects unsupported provider-specific efforts", () => {
      expect(resolveReasoningEffort("xai/grok-4.5", "none")).toEqual({ success: false });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "low")).toEqual({ success: false });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "medium")).toEqual({ success: false });
      expect(resolveReasoningEffort("z-ai/glm-5.2", "high")).toEqual({
        success: true,
        effort: "high",
      });
      expect(resolveReasoningEffort("mistral-medium-latest", "high")).toEqual({
        success: false,
      });

      for (const modelId of [
        "minimax/minimax-m2.7",
        "minimax/minimax-m2.5",
        "minimax/minimax-m2.1",
        "minimax/minimax-m2",
        "qwen/qwen3-235b-a22b-thinking-2507",
      ]) {
        expect(resolveReasoningEffort(modelId, "none")).toEqual({ success: false });
        expect(resolveReasoningEffort(modelId)).toEqual({
          success: true,
          effort: undefined,
        });
      }
    });

    it("maps OpenRouter effort to call-level provider options", () => {
      const openRouterReasoningModel = MODELS.find(
        (model) =>
          model.provider === "openrouter" && getReasoningEffortOptions(model.id).length > 0,
      );
      if (!openRouterReasoningModel) {
        throw new Error("Expected a configurable OpenRouter reasoning model");
      }

      expect(getOpenRouterReasoningOptions(openRouterReasoningModel.id, "none")).toEqual({
        reasoning: { enabled: false, effort: "none" },
      });
      expect(getOpenRouterReasoningOptions(openRouterReasoningModel.id, "high")).toEqual({
        reasoning: { enabled: true, effort: "high" },
      });
      expect(getOpenRouterReasoningOptions(MODEL_DEFAULT, "high")).toEqual({});
    });
  });

  describe("createModelValidator", () => {
    it("returns a function", () => {
      const validator = createModelValidator();
      expect(typeof validator).toBe("function");
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
      const retiredModel = MODELS.find((model) => model.retired);
      expect(retiredModel).toBeDefined();
      expect(validator(retiredModel!.id)).toBe(MODEL_DEFAULT);
    });

    it("returns preferred model when not in disabled list", () => {
      const validator = createModelValidator();
      const validModel = MODELS[0]?.id;
      expect(validModel).toBeDefined();
      expect(validator(validModel, ["some-other-model"])).toBe(validModel);
    });
  });

  describe("getModelById", () => {
    it("returns undefined for non-existent model", () => {
      expect(getModelById("non-existent-model")).toBeUndefined();
    });

    it("returns model for existing id", () => {
      const model = MODELS[0];
      expect(model).toBeDefined();
      const result = getModelById(model.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(model.id);
    });

    it("returns model with all expected properties", () => {
      const model = MODELS[0];
      expect(model).toBeDefined();
      const result = getModelById(model.id);
      expect(result?.id).toBeDefined();
      expect(result?.name).toBeDefined();
      expect(result?.provider).toBeDefined();
    });
  });

  describe("isModelPremium", () => {
    it("returns false for non-existent model", () => {
      expect(isModelPremium("non-existent-model")).toBe(false);
    });

    it("returns true for premium models", () => {
      const premiumModel = MODELS.find((m) => m.premium === true);
      expect(premiumModel).toBeDefined();
      expect(isModelPremium(premiumModel!.id)).toBe(true);
    });

    it("returns false for non-premium models", () => {
      const nonPremiumModel = MODELS.find((m) => !m.premium);
      expect(nonPremiumModel).toBeDefined();
      expect(isModelPremium(nonPremiumModel!.id)).toBe(false);
    });
  });

  describe("requiresUserApiKey", () => {
    it("returns false for non-existent model", () => {
      expect(requiresUserApiKey("non-existent-model")).toBe(false);
    });

    it("returns true for models requiring user API key", () => {
      const userKeyModel = MODELS.find((m) => m.apiKeyUsage?.userKeyOnly === true);
      expect(userKeyModel).toBeDefined();
      expect(requiresUserApiKey(userKeyModel!.id)).toBe(true);
    });

    it("returns false for models not requiring user API key", () => {
      const noUserKeyModel = MODELS.find((m) => !m.apiKeyUsage?.userKeyOnly);
      expect(noUserKeyModel).toBeDefined();
      expect(requiresUserApiKey(noUserKeyModel!.id)).toBe(false);
    });
  });

  describe("getModelProvider", () => {
    it("returns undefined for non-existent model", () => {
      expect(getModelProvider("non-existent-model")).toBeUndefined();
    });

    it("returns provider for existing model", () => {
      const model = MODELS[0];
      expect(model).toBeDefined();
      const provider = getModelProvider(model.id);
      expect(provider).toBeDefined();
      expect(typeof provider).toBe("string");
    });

    it("returns correct provider for different models", () => {
      // Test a few known providers
      const openaiModel = MODELS.find((m) => m.provider === "openai");
      expect(openaiModel).toBeDefined();
      expect(getModelProvider(openaiModel!.id)).toBe("openai");

      const anthropicModel = MODELS.find((m) => m.provider === "anthropic");
      expect(anthropicModel).toBeDefined();
      expect(getModelProvider(anthropicModel!.id)).toBe("anthropic");

      const googleModel = MODELS.find((m) => m.provider === "gemini");
      expect(googleModel).toBeDefined();
      expect(getModelProvider(googleModel!.id)).toBe("gemini");
    });
  });
});
