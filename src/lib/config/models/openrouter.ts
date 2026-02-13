import { REASONING_FEATURE, TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const OPENROUTER_MODELS = [
  {
    id: "openrouter/aurora-alpha",
    name: "Aurora Alpha",
    provider: "openrouter",
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: true,
    description:
      "Aurora Alpha is a free, reasoning-first OpenRouter model optimized for speed in coding assistants and agentic workflows.\nConfigured as always-on reasoning with no app rate limits.",
    api_sdk: openrouter("openrouter/aurora-alpha"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
  },
];
