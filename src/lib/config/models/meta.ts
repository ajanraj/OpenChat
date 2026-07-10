import { gateway } from "@ai-sdk/gateway";
import { FILE_UPLOAD_FEATURE, REASONING_FEATURE_FIXED, TOOL_CALLING_FEATURE } from "../features";

export const META_MODELS = [
  {
    id: "meta/muse-spark-1.1",
    name: "Muse Spark 1.1",
    provider: "meta",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Meta's multimodal reasoning model for agentic work.\nSupports long-context understanding, tool use, and rich media inputs.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [FILE_UPLOAD_FEATURE, TOOL_CALLING_FEATURE, REASONING_FEATURE_FIXED],
    api_sdk: gateway("meta/muse-spark-1.1"),
  },
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "meta",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Meta's natively multimodal mixture-of-experts model.\nBuilt for image understanding, multilingual tasks, and tool use.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [FILE_UPLOAD_FEATURE, TOOL_CALLING_FEATURE],
    api_sdk: gateway("meta/llama-4-maverick"),
  },
  {
    id: "meta-llama/llama-4-scout",
    name: "Llama 4 Scout",
    provider: "meta",
    premium: true,
    usesPremiumCredits: false,
    description:
      "Meta's efficient multimodal Llama 4 model.\nCombines long-context understanding with 17B active parameters.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [FILE_UPLOAD_FEATURE, TOOL_CALLING_FEATURE],
    api_sdk: gateway("meta/llama-4-scout"),
  },
];
