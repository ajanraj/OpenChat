/**
 * Model Utilities
 * Helper functions for model validation, feature detection, and configuration
 */

import { MODEL_DEFAULT, MODELS } from "@/lib/config";

/**
 * Checks if a model supports configurable reasoning effort
 */
export function supportsReasoningEffort(modelId: string): boolean {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model?.features) {
    return false;
  }
  const reasoningFeature = model.features.find((f) => f.id === "reasoning");
  return (
    reasoningFeature?.enabled === true &&
    reasoningFeature?.supportsEffort === true
  );
}

/**
 * Creates a memoized model validator function
 */
export function createModelValidator() {
  const validModels = new Set(MODELS.map((m) => m.id));

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
}

/**
 * Gets model configuration by ID
 */
export function getModelById(modelId: string) {
  return MODELS.find((m) => m.id === modelId);
}

/**
 * Checks if a model requires premium access
 */
export function isModelPremium(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.premium === true;
}

/**
 * Checks if a model requires user API key
 */
export function requiresUserApiKey(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.apiKeyUsage?.userKeyOnly === true;
}

/**
 * Gets the provider for a model
 */
export function getModelProvider(modelId: string): string | undefined {
  const model = getModelById(modelId);
  return model?.provider;
}
