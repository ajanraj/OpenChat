import { fal } from "@ai-sdk/fal";
import { IMAGE_GENERATION_FEATURE } from "../features";

export const FAL_MODELS = [
  {
    id: "flux-2",
    name: "Flux 2",
    provider: "fal",
    premium: true,
    usesPremiumCredits: true,
    description:
      "Black Forest Labs' fast Flux 2 image model.\nSupports high-quality generation and image editing workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [IMAGE_GENERATION_FEATURE],
    api_sdk: fal.image("fal-ai/flux-2"),
  },
  {
    id: "flux-2-pro",
    name: "Flux 2 Pro",
    provider: "fal",
    premium: true,
    usesPremiumCredits: true,
    description:
      "Black Forest Labs' highest-quality Flux 2 model.\nBuilt for precise generation, editing, and production image workflows.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [IMAGE_GENERATION_FEATURE],
    api_sdk: fal.image("fal-ai/flux-2-pro"),
  },
  {
    id: "flux-schnell",
    name: "Flux Schnell",
    provider: "fal",
    premium: true,
    usesPremiumCredits: true,
    legacy: true,
    description:
      "Ultra-fast text-to-image model with sub-second generation.\nDelivers high-quality visuals optimized for speed and efficiency.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [IMAGE_GENERATION_FEATURE],
    api_sdk: fal.image("fal-ai/flux/schnell"),
  },
];
