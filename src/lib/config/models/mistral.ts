import { mistral } from "@ai-sdk/mistral";
import {
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  REASONING_FEATURE_TOGGLE,
  TOOL_CALLING_FEATURE,
} from "../features";

const MISTRAL_MULTIMODAL_FEATURES = [
  FILE_UPLOAD_FEATURE,
  PDF_PROCESSING_FEATURE,
  TOOL_CALLING_FEATURE,
];

export const MISTRAL_MODELS = [
  {
    id: "mistral-large-4",
    name: "Mistral Large 4",
    provider: "mistral",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Mistral's open-weight multimodal flagship with one-million-token context.\nSupports optional reasoning, documents, images, and tool use.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [...MISTRAL_MULTIMODAL_FEATURES, REASONING_FEATURE_TOGGLE],
    api_sdk: mistral("mistral-large-4"),
  },
  {
    // Keeps the historical id for existing chats, pinned to the Large 3 snapshot.
    id: "mistral-large-latest",
    name: "Mistral Large 3",
    provider: "mistral",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description:
      "Mistral's previous flagship multimodal model.\nHandles documents, images, tool use, and long-context professional work.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: MISTRAL_MULTIMODAL_FEATURES,
    api_sdk: mistral("mistral-large-2512"),
  },
  {
    id: "mistral-medium-latest",
    name: "Mistral Medium 3.5",
    provider: "mistral",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Mistral's balanced multimodal model.\nCombines strong reasoning and tool use with efficient deployment.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: MISTRAL_MULTIMODAL_FEATURES,
    api_sdk: mistral("mistral-medium-latest"),
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small 4",
    provider: "mistral",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Mistral's efficient multimodal model.\nOptimized for fast reasoning, documents, and tool-driven workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [...MISTRAL_MULTIMODAL_FEATURES, REASONING_FEATURE_TOGGLE],
    api_sdk: mistral("mistral-small-latest"),
  },
  {
    id: "pixtral-large-latest",
    name: "Pixtral Large",
    provider: "mistral",
    premium: true,
    usesPremiumCredits: false,
    legacy: true,
    description:
      "124B multimodal model for document analysis and visual comprehension.\nUse Mistral Large 4 for new chats.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: MISTRAL_MULTIMODAL_FEATURES,
    api_sdk: mistral("pixtral-large-latest"),
  },
];
