import { TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const OPENROUTER_MODELS = [
  {
    id: "openrouter/sonoma-dusk-alpha",
    name: "Sonoma Dusk Alpha",
    provider: "openrouter",
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: true,
    description: `OpenRouter's new stealth model. \nA fast and intelligent general-purpose frontier model with a 2 million token context window. Supports image inputs and parallel tool calling.`,
    api_sdk: openrouter("openrouter/sonoma-dusk-alpha"),
    features: [TOOL_CALLING_FEATURE],
  },
  {
    id: "openrouter/sonoma-sky-alpha",
    name: "Sonoma Sky Alpha",
    provider: "openrouter",
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: true,
    description: `OpenRouter's new stealth model. \n A maximally intelligent general-purpose frontier model with a 2 million token context window. Supports image inputs and parallel tool calling.`,
    api_sdk: openrouter("openrouter/sonoma-sky-alpha"),
    features: [TOOL_CALLING_FEATURE],
  },
];
