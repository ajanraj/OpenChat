import {
  FILE_UPLOAD_FEATURE,
  REASONING_FEATURE,
  TOOL_CALLING_FEATURE,
} from "../features";
import { openrouter } from "../openrouter";

export const ZAI_MODELS = [
  {
    id: "glm-4.5",
    name: "GLM 4.5",
    provider: "openrouter",
    displayProvider: "z-ai",
    premium: true,
    usesPremiumCredits: false,
    description: `ZAI's flagship reasoning model. \nFeatures 355B total parameters with 32B active, native agent capabilities for autonomous task planning, and achieves third place globally across 12 industry benchmarks while being more cost-efficient than DeepSeek.`,
    api_sdk: openrouter("z-ai/glm-4.5"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
  },
  {
    id: "glm-4.5-air",
    name: "GLM 4.5 Air",
    provider: "openrouter",
    displayProvider: "z-ai",
    premium: false,
    usesPremiumCredits: false,
    description: `ZAI's streamlined efficiency model. \nFeatures 106B total parameters with 12B active, runs on just eight H20 GPUs, delivers exceptional performance in its parameter category, and offers superior cost-effectiveness for accessible deployment.`,
    api_sdk: openrouter("z-ai/glm-4.5-air"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE],
  },
  {
    id: "glm-4.5v",
    name: "GLM 4.5V",
    provider: "openrouter",
    displayProvider: "z-ai",
    premium: true,
    usesPremiumCredits: false,
    description: `ZAI's flagship vision model. \n `,
    api_sdk: openrouter("z-ai/glm-4.5v"),
    features: [TOOL_CALLING_FEATURE, REASONING_FEATURE, FILE_UPLOAD_FEATURE],
  },
];
