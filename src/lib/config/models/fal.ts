import { fal } from "@ai-sdk/fal";
import { IMAGE_GENERATION_FEATURE } from "../features";

export const FAL_MODELS = [
  {
    id: "flux-schnell",
    name: "Flux Schnell",
    provider: "fal",
    premium: false,
    usesPremiumCredits: false,
    description:
      "Ultra-fast text-to-image model with sub-second generation.\nDelivers high-quality visuals optimized for speed and efficiency.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [IMAGE_GENERATION_FEATURE],
    api_sdk: fal.image("fal-ai/flux/schnell"),
  },
];
