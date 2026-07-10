import {
  FILE_UPLOAD_FEATURE,
  REASONING_FEATURE_FIXED,
  REASONING_FEATURE_TOGGLE,
  TOOL_CALLING_FEATURE,
} from "../features";
import { openrouter } from "../openrouter";

export const SCHEDULED_AGENT_MODEL_ID = "minimax/minimax-m3";

export const MINIMAX_MODELS = [
  {
    id: SCHEDULED_AGENT_MODEL_ID,
    name: "MiniMax M3",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    description:
      "MiniMax's multimodal agentic flagship with one-million-token context.\nSupports optional reasoning, tools, images, and video understanding.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [FILE_UPLOAD_FEATURE, TOOL_CALLING_FEATURE, REASONING_FEATURE_TOGGLE],
    api_sdk: openrouter(SCHEDULED_AGENT_MODEL_ID),
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description: "MiniMax's previous agentic model.\nStrong software engineering and tool use.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
    api_sdk: openrouter("minimax/minimax-m2.7"),
  },
  {
    id: "minimax/minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description:
      "MiniMax's previous coding and office-work model.\nSupports multi-agent workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
    api_sdk: openrouter("minimax/minimax-m2.5"),
  },
  {
    id: "minimax/minimax-m2.1",
    name: "MiniMax M2.1",
    provider: "openrouter",
    displayProvider: "minimax",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description: "MiniMax's earlier multilingual coding model.\nSupports agentic workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
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
      "MiniMax's earlier coding and agentic model.\nSupports multi-step reasoning and tools.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
    api_sdk: openrouter("minimax/minimax-m2"),
  },
];
