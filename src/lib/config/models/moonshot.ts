import {
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  REASONING_FEATURE,
  TOOL_CALLING_FEATURE,
} from "../features";
import { openrouter } from "../openrouter";

export const MOONSHOT_MODELS = [
  {
    id: "moonshotai/kimi-k2-0711",
    name: "Kimi K2",
    subName: "0711",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description: `Moonshot AI's Kimi K2 model.\nOffers agentic tools capabilities for various tasks.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2:nitro"),
  },
  {
    id: "moonshotai/kimi-k2-0905",
    name: "Kimi K2",
    subName: "0905",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: false,
    usesPremiumCredits: false,
    description:
      "Kimi K2 0905 is the September update of Kimi K2 model. \nThis update improves agentic coding with higher accuracy and frontend coding with more aesthetic and functional outputs for web, 3D, and related tasks.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2-0905:nitro"),
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: false,
    usesPremiumCredits: false,
    description:
      "Moonshot AI's flagship K2.5 model with 262K context and multimodal input.\nStrong coding and agentic tool use.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [FILE_UPLOAD_FEATURE, PDF_PROCESSING_FEATURE, TOOL_CALLING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2.5"),
  },
  {
    id: "moonshotai/kimi-k2.5:reasoning",
    name: "Kimi K2.5",
    subName: "Thinking",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Moonshot AI's K2.5 with reasoning enabled.\nOptimized for complex multi-step workflows and deep analysis.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      TOOL_CALLING_FEATURE,
      REASONING_FEATURE,
    ],
    api_sdk: openrouter("moonshotai/kimi-k2.5"),
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: true,
    usesPremiumCredits: true,
    legacy: true,
    description:
      "Moonshot AI's advanced open reasoning model.\nOptimized for persistent step-by-step thought and complex workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2-thinking"),
  },
];
