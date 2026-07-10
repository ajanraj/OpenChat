import { REASONING_FEATURE_FIXED, TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const OPENROUTER_MODELS = [
  {
    id: "openrouter/free",
    name: "OpenRouter Free",
    provider: "openrouter",
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: true,
    description:
      "OpenRouter's free model router.\nSelects an available free model based on the request's required capabilities.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    api_sdk: openrouter("openrouter/free"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
  },
  {
    id: "openrouter/aurora-alpha",
    name: "Aurora Alpha",
    provider: "openrouter",
    premium: true,
    usesPremiumCredits: false,
    skipRateLimit: true,
    legacy: true,
    retired: true,
    description:
      "Retired OpenRouter preview model.\nExisting chats automatically switch to the default model.",
    api_sdk: openrouter("openrouter/aurora-alpha"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
  },
];
