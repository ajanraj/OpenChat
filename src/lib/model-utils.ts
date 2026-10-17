/**
 * Model Utilities
 * Helper functions for model validation, feature detection, and configuration
 */

import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";

import { MODEL_DEFAULT } from "@/lib/config/constants";
import { MODELS } from "@/lib/config/models";
import { ReasoningEffortSchema } from "@/lib/config/schemas";
import type { ReasoningEffort } from "@/lib/config/schemas";

export const getReasoningEffortOptions = (
  modelId: string
): ReasoningEffort[] => {
  const model = MODELS.find((candidate) => candidate.id === modelId);
  const reasoningFeature = model?.features.find(
    (feature) => feature.id === "reasoning" && feature.enabled
  );
  return reasoningFeature?.effortOptions ?? [];
};

export const getDefaultReasoningEffort = (
  modelId: string
): ReasoningEffort | undefined => {
  const effortOptions = getReasoningEffortOptions(modelId);
  return effortOptions.includes("none") ? "none" : effortOptions[0];
};

export const normalizeReasoningEffort = (
  modelId: string,
  requestedEffort: ReasoningEffort
): ReasoningEffort => {
  const effortOptions = getReasoningEffortOptions(modelId);
  return effortOptions.includes(requestedEffort)
    ? requestedEffort
    : (getDefaultReasoningEffort(modelId) ?? requestedEffort);
};

export const getMessageReasoningEffort = (
  modelId: string,
  storedEffort: string | undefined,
  fallbackEffort: ReasoningEffort
): ReasoningEffort => {
  const parsedEffort = ReasoningEffortSchema.safeParse(storedEffort);
  return normalizeReasoningEffort(
    modelId,
    parsedEffort.success ? parsedEffort.data : fallbackEffort
  );
};

export const resolveReasoningEffort = (
  modelId: string,
  requestedEffort?: ReasoningEffort
):
  | { success: true; effort: ReasoningEffort | undefined }
  | { success: false } => {
  const effortOptions = getReasoningEffortOptions(modelId);
  if (requestedEffort === undefined) {
    return { success: true, effort: getDefaultReasoningEffort(modelId) };
  }
  return effortOptions.includes(requestedEffort)
    ? { success: true, effort: requestedEffort }
    : { success: false };
};

export const getOpenRouterReasoningOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort
): OpenRouterProviderOptions => {
  const model = MODELS.find((candidate) => candidate.id === modelId);
  const hasReasoning = model?.features.some(
    (feature) => feature.id === "reasoning" && feature.enabled
  );
  if (
    model?.provider !== "openrouter" ||
    hasReasoning !== true ||
    reasoningEffort === undefined
  ) {
    return {};
  }
  return {
    reasoning:
      reasoningEffort === "none"
        ? { enabled: false, effort: "none" }
        : { enabled: true, effort: reasoningEffort },
  };
};

/**
 * Checks if a model supports configurable reasoning effort
 */
export const supportsReasoningEffort = (modelId: string): boolean =>
  getReasoningEffortOptions(modelId).length > 0;

/**
 * Creates a memoized model validator function
 */
export const createModelValidator = () => {
  const validModels = new Set(
    MODELS.filter((model) => model.retired !== true).map((model) => model.id)
  );

  return function getValidModel(
    preferredModel: string,
    disabledModels: string[] = []
  ): string {
    // Check if model exists and is not disabled
    if (!validModels.has(preferredModel)) {
      return MODEL_DEFAULT;
    }

    // Check if model is disabled by user
    const disabledSet = new Set(disabledModels);
    if (disabledSet.has(preferredModel)) {
      return MODEL_DEFAULT;
    }

    return preferredModel;
  };
};

/**
 * Gets model configuration by ID
 */
export const getModelById = (modelId: string) =>
  MODELS.find((m) => m.id === modelId);

/**
 * Checks if a model requires premium access
 */
export const isModelPremium = (modelId: string): boolean => {
  const model = getModelById(modelId);
  return model?.premium === true;
};

/**
 * Checks if a model requires user API key
 */
export const requiresUserApiKey = (modelId: string): boolean => {
  const model = getModelById(modelId);
  return model?.apiKeyUsage?.userKeyOnly === true;
};

/**
 * Gets the provider for a model
 */
export const getModelProvider = (modelId: string): string | undefined => {
  const model = getModelById(modelId);
  return model?.provider;
};
