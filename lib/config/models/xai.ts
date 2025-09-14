import { gateway } from "@ai-sdk/gateway";
import {
  REASONING_FEATURE_BASIC,
  REASONING_FEATURE_DISABLED,
  TOOL_CALLING_FEATURE,
} from "../features";

export const XAI_MODELS = [
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    premium: true,
    usesPremiumCredits: true,
    description: `xAI's most advanced reasoning model with frontier-level intelligence.\nFeatures real-time X data access, advanced reasoning, and native tool use.\nExcels at mathematical reasoning, coding, and complex problem-solving.`,
    api_sdk: gateway("xai/grok-4"),
    features: [REASONING_FEATURE_BASIC, TOOL_CALLING_FEATURE],
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    premium: true,
    usesPremiumCredits: true,
    description: `xAI's flagship model.\nFeatures real-time X data access.`,
    api_sdk: gateway("xai/grok-3-latest"),
    features: [REASONING_FEATURE_DISABLED],
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xai",
    premium: false,
    usesPremiumCredits: false,
    description:
      "Cost-efficient reasoning model from xAI.\nExcels at STEM tasks requiring less world knowledge.",
    api_sdk: gateway("xai/grok-3-mini"),
    features: [REASONING_FEATURE_BASIC, TOOL_CALLING_FEATURE],
  },
];
