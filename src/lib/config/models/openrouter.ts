import { REASONING_FEATURE_DISABLED, TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const OPENROUTER_MODELS = [
  {
    id: "openrouter/pony-alpha",
    name: "Pony Alpha",
    provider: "openrouter",
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: true,
    description:
      "Pony is a foundation model tuned for coding, agentic workflows, and roleplay.\nOpenRouter lists this model at $0/M input and $0/M output tokens.",
    api_sdk: openrouter("openrouter/pony-alpha"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_DISABLED],
  },
];
