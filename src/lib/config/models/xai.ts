import { gateway } from "@ai-sdk/gateway";
import {
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  REASONING_FEATURE,
  REASONING_FEATURE_ALWAYS,
  REASONING_FEATURE_BASIC,
  REASONING_FEATURE_DISABLED,
  REASONING_FEATURE_TOGGLE,
  TOOL_CALLING_FEATURE,
} from "../features";
import { openrouter } from "../openrouter";

const GROK_MULTIMODAL_FEATURES = [
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  TOOL_CALLING_FEATURE,
];

export const XAI_MODELS = [
  {
    id: "xai/grok-4.5",
    name: "Grok 4.5",
    provider: "xai",
    premium: true,
    usesPremiumCredits: true,
    description:
      "xAI's latest high-capability reasoning model.\nSupports multimodal input, tools, and configurable reasoning across long context.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    api_sdk: gateway("xai/grok-4.5"),
    features: [...GROK_MULTIMODAL_FEATURES, REASONING_FEATURE_ALWAYS],
  },
  {
    id: "x-ai/grok-4.20",
    name: "Grok 4.20",
    provider: "openrouter",
    displayProvider: "xai",
    premium: true,
    usesPremiumCredits: false,
    description:
      "xAI's efficient Grok 4.20 model for agentic work.\nSupports optional reasoning, multimodal input, and tools.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    api_sdk: openrouter("x-ai/grok-4.20"),
    features: [...GROK_MULTIMODAL_FEATURES, REASONING_FEATURE_TOGGLE],
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    premium: true,
    usesPremiumCredits: true,
    legacy: true,
    description:
      "xAI's previous flagship reasoning model.\nSupports tools and complex problem solving.",
    api_sdk: gateway("xai/grok-4"),
    features: [REASONING_FEATURE_BASIC, TOOL_CALLING_FEATURE],
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    premium: true,
    usesPremiumCredits: true,
    legacy: true,
    description: "xAI's earlier flagship model.\nBuilt for general-purpose conversations.",
    api_sdk: gateway("xai/grok-3-latest"),
    features: [REASONING_FEATURE_DISABLED],
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xai",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description: "xAI's earlier cost-efficient reasoning model.\nDesigned for STEM tasks.",
    api_sdk: gateway("xai/grok-3-mini"),
    features: [REASONING_FEATURE_BASIC, TOOL_CALLING_FEATURE],
  },
  {
    id: "x-ai/grok-4.1-fast-thinking",
    name: "Grok 4.1 Fast",
    subName: "Thinking",
    provider: "openrouter",
    displayProvider: "xai",
    premium: true,
    usesPremiumCredits: false,
    skipRateLimit: true,
    legacy: true,
    retired: true,
    description:
      "Retired Grok 4.1 Fast reasoning route.\nExisting chats automatically switch to the default model.",
    api_sdk: openrouter("x-ai/grok-4.1-fast"),
    features: [...GROK_MULTIMODAL_FEATURES, REASONING_FEATURE],
  },
  {
    id: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "openrouter",
    displayProvider: "xai",
    premium: true,
    usesPremiumCredits: false,
    skipRateLimit: true,
    legacy: true,
    retired: true,
    description:
      "Retired Grok 4.1 Fast route.\nExisting chats automatically switch to the default model.",
    api_sdk: openrouter("x-ai/grok-4.1-fast"),
    features: [...GROK_MULTIMODAL_FEATURES, REASONING_FEATURE_DISABLED],
  },
];
