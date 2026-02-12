import { REASONING_FEATURE, TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const MINIMAX_MODELS = [
  {
    id: "minimax/minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    description:
      "MiniMax M2.5, released February 12, 2026 with 204,800 context.\nExtends M2.1 from coding into office and multi-agent workflows with stronger planning and token efficiency.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
    api_sdk: openrouter("minimax/minimax-m2.5"),
  },
  {
    id: "minimax/minimax-m2.1",
    name: "MiniMax M2.1",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    description:
      "MiniMax's latest model with 204K context.\nExcels in multilingual coding, agentic workflows, and clean concise outputs with faster response times.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
    api_sdk: openrouter("minimax/minimax-m2.1"),
  },
  {
    id: "minimax/minimax-m2",
    name: "MiniMax M2",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description:
      "MiniMax's high-efficiency model optimized for coding and agentic workflows.\nExcels in multi-step reasoning and tool use.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
    api_sdk: openrouter("minimax/minimax-m2"),
  },
];
