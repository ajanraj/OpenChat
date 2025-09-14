import { MODELS_RAW } from "./models";
import type { Model } from "./schemas";

// Define the provider type to match the API keys page requirements
export type ApiKeyProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "mistral"
  | "meta"
  | "Qwen"
  | "gemini";

// API key validation patterns
export const API_KEY_PATTERNS = {
  openai:
    /^sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}(?:T3BlbkFJ[A-Za-z0-9_-]{20,})?$/,
  anthropic: /^sk-ant-[a-zA-Z0-9_-]{8,}$/,
  gemini: /^AIza[a-zA-Z0-9_-]{35,}$/,
} as const;

// Provider configuration with metadata for API keys page
const PROVIDER_CONFIGS = [
  {
    id: "anthropic" as const,
    title: "Anthropic API Key",
    placeholder: "sk-ant...",
    docs: "https://console.anthropic.com/account/keys",
  },
  {
    id: "openai" as const,
    title: "OpenAI API Key",
    placeholder: "sk-...",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini" as const,
    title: "Google API Key",
    placeholder: "AIza...",
    docs: "https://console.cloud.google.com/apis/credentials",
  },
] as const;

/**
 * Generate display name for a model, combining name and subName if present
 */
function getModelDisplayName(model: Model): string {
  return model.subName ? `${model.name} (${model.subName})` : model.name;
}

/**
 * Get providers that support API keys along with their models
 * This replaces the hardcoded PROVIDERS array in the API keys page
 */
export function getApiKeyProviders() {
  // Filter models that allow user API keys
  const apiKeyModels = MODELS_RAW.filter(
    (model) => model.apiKeyUsage?.allowUserKey === true
  );

  // Group models by provider
  const providerGroups = new Map<string, string[]>();

  for (const model of apiKeyModels) {
    const providerId = model.provider;
    if (!providerGroups.has(providerId)) {
      providerGroups.set(providerId, []);
    }
    const displayName = getModelDisplayName(model);
    providerGroups.get(providerId)?.push(displayName);
  }

  // Return only providers that have models with API key support
  return PROVIDER_CONFIGS.filter((config) => providerGroups.has(config.id)).map(
    (config) => ({
      id: config.id as ApiKeyProvider,
      title: config.title,
      placeholder: config.placeholder,
      docs: config.docs,
      models: providerGroups.get(config.id) || [],
    })
  );
}

/**
 * Validation function for API keys
 */
export function validateApiKey(
  provider: ApiKeyProvider,
  key: string
): { isValid: boolean; error?: string } {
  if (!key.trim()) {
    return { isValid: false, error: "API key is required" };
  }

  const pattern = API_KEY_PATTERNS[provider as keyof typeof API_KEY_PATTERNS];
  if (!pattern) {
    return { isValid: true }; // No specific pattern for this provider
  }

  if (!pattern.test(key)) {
    switch (provider) {
      case "openai":
        return {
          isValid: false,
          error:
            "OpenAI API keys should start with 'sk-' followed by at least 20 characters",
        };
      case "anthropic":
        return {
          isValid: false,
          error:
            "Anthropic API keys should start with 'sk-ant-' followed by at least 8 characters (letters, numbers, hyphens, underscores)",
        };
      case "gemini":
        return {
          isValid: false,
          error:
            "Google API keys should start with 'AIza' followed by 35+ characters",
        };
      default:
        return { isValid: false, error: "Invalid API key format" };
    }
  }

  return { isValid: true };
}
