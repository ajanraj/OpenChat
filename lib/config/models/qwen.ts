import { REASONING_FEATURE, TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const QWEN_MODELS = [
  {
    id: "qwen/qwen3-coder",
    name: "Qwen3 Coder",
    provider: "openrouter",
    displayProvider: "qwen",
    premium: false,
    usesPremiumCredits: false,
    description: `Qwen's Best Coder model.\nOffers agentic tools capabilities for various coding tasks.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("qwen/qwen3-coder:nitro"),
  },
  {
    id: "qwen/qwen3-235b-a22b-thinking-2507",
    name: "Qwen3 235B",
    subName: "Thinking",
    provider: "openrouter",
    displayProvider: "qwen",
    premium: true,
    usesPremiumCredits: false,
    description: `Qwen's Best Thinking model.\nOffers agentic tools capabilities for various thinking tasks.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
    api_sdk: openrouter("qwen/qwen3-235b-a22b-thinking-2507:nitro"),
  },
  {
    id: "qwen/qwen3-235b-a22b-2507",
    name: "Qwen3 235B",
    provider: "openrouter",
    displayProvider: "qwen",
    premium: false,
    usesPremiumCredits: false,
    description: `Qwen's Best 235B model.\nOffers agentic tools capabilities for various tasks.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("qwen/qwen3-235b-a22b-2507:nitro"),
  },
];
