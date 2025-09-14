import { mistral } from "@ai-sdk/mistral";
import {
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  TOOL_CALLING_FEATURE,
} from "../features";

export const MISTRAL_MODELS = [
  {
    id: "pixtral-large-latest",
    name: "Pixtral Large",
    provider: "mistral",
    premium: false,
    usesPremiumCredits: false,
    description:
      "124B multimodal model leading on mathematical reasoning benchmarks.\nExcels at document analysis and complex visual comprehension.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [
      FILE_UPLOAD_FEATURE,
      PDF_PROCESSING_FEATURE,
      TOOL_CALLING_FEATURE,
    ],
    api_sdk: mistral("pixtral-large-latest"),
  },
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    provider: "mistral",
    premium: false,
    usesPremiumCredits: false,
    description: `Mistral's flagship text-focused model for general tasks.\nDelivers reliable performance across diverse applications.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: mistral("mistral-large-latest"),
  },
];
