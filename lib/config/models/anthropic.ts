import { anthropic } from "@ai-sdk/anthropic";
import {
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  REASONING_FEATURE,
  REASONING_FEATURE_DISABLED,
  TOOL_CALLING_FEATURE,
} from "../features";

export const ANTHROPIC_MODELS = [
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    premium: true,
    usesPremiumCredits: true,
    description:
      "First model which excels at coding and tool calling.\nExcels at agentic coding, tool use, and complex reasoning tasks.",
    apiKeyUsage: { allowUserKey: true, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE_DISABLED,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-3-5-sonnet-20241022"),
  },
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    premium: true,
    usesPremiumCredits: true,
    description:
      "First hybrid reasoning model with visible thinking process.\nDelivers enhanced coding and math performance with step-by-step reasoning.",
    apiKeyUsage: { allowUserKey: true, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE_DISABLED,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-3-7-sonnet-20250219"),
  },
  {
    id: "claude-3-7-sonnet-reasoning",
    name: "Claude 3.7 Sonnet",
    subName: "Reasoning",
    provider: "anthropic",
    premium: true,
    usesPremiumCredits: true,
    description:
      "Claude 3.7 with thinking capabilities enabled.\nProvides deeper reasoning for complex analytical and coding tasks.",
    apiKeyUsage: { allowUserKey: true, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-3-7-sonnet-20250219"),
  },
  {
    id: "claude-4-opus",
    name: "Claude 4 Opus",
    provider: "anthropic",
    premium: false,
    usesPremiumCredits: false,
    description: `World's best coding model with 73% on SWE-bench.\nExcels at sustained performance on complex, long-running tasks.`,
    apiKeyUsage: { allowUserKey: true, userKeyOnly: true },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-opus-4-20250514"),
  },
  {
    id: "claude-4-sonnet",
    name: "Claude 4 Sonnet",
    provider: "anthropic",
    premium: true,
    usesPremiumCredits: true,
    description: `Anthropic's flagship multimodal model which excels at coding.\nDelivers precise instruction following and enhanced problem-solving.`,
    apiKeyUsage: { allowUserKey: true, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE_DISABLED,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-sonnet-4-20250514"),
  },
  {
    id: "claude-4-sonnet-reasoning",
    name: "Claude 4 Sonnet",
    subName: "Reasoning",
    provider: "anthropic",
    premium: true,
    usesPremiumCredits: true,
    description:
      "Claude 4 Sonnet with thinking capabilities.\nOptimal for complex reasoning, coding, and agentic workflows.",
    apiKeyUsage: { allowUserKey: true, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      REASONING_FEATURE,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: anthropic("claude-sonnet-4-20250514"),
  },
];
