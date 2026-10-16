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
    /^sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}(?:T3BlbkFJ[A-Za-z0-9_-]{20,})?$/u,
  anthropic: /^sk-ant-[a-zA-Z0-9_-]{8,}$/u,
  gemini: /^AIza[a-zA-Z0-9_-]{35,}$/u,
} as const;

type PatternProvider = keyof typeof API_KEY_PATTERNS;

const hasKeyPattern = (provider: ApiKeyProvider): provider is PatternProvider =>
  provider in API_KEY_PATTERNS;

// Shown when a key doesn't match its provider's pattern
const API_KEY_FORMAT_ERRORS: Record<PatternProvider, string> = {
  openai:
    "OpenAI API keys should start with 'sk-' followed by at least 20 characters",
  anthropic:
    "Anthropic API keys should start with 'sk-ant-' followed by at least 8 characters (letters, numbers, hyphens, underscores)",
  gemini: "Google API keys should start with 'AIza' followed by 35+ characters",
};

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
const getModelDisplayName = (model: Model): string =>
  model.subName !== undefined && model.subName !== ""
    ? `${model.name} (${model.subName})`
    : model.name;

/**
 * Get providers that support API keys along with their models
 * This replaces the hardcoded PROVIDERS array in the API keys page
 */
export const getApiKeyProviders = () => {
  // Filter models that allow user API keys
  const apiKeyModels = MODELS_RAW.filter(
    (model) => model.apiKeyUsage?.allowUserKey
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
      id: config.id,
      title: config.title,
      placeholder: config.placeholder,
      docs: config.docs,
      models: providerGroups.get(config.id) ?? [],
    })
  );
};

/**
 * Validation function for API keys
 */
export const validateApiKey = (
  provider: ApiKeyProvider,
  key: string
): { isValid: boolean; error?: string } => {
  if (!key.trim()) {
    return { isValid: false, error: "API key is required" };
  }

  if (!hasKeyPattern(provider)) {
    // No specific pattern for this provider
    return { isValid: true };
  }

  if (!API_KEY_PATTERNS[provider].test(key)) {
    return { isValid: false, error: API_KEY_FORMAT_ERRORS[provider] };
  }

  return { isValid: true };
};
