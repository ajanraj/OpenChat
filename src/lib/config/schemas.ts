import type { ImageModel, LanguageModel } from "ai";
import { z } from "zod";

/** The AI SDK model a config entry runs on: a language or image model object, or a gateway model id. */
export type SdkModel =
  | string
  | Exclude<LanguageModel, string>
  | Exclude<ImageModel, string>;

const SDK_SPEC_VERSIONS = new Set(["v2", "v3", "v4"]);

/** Runtime check behind ModelSchema.api_sdk: a model id or an AI SDK model object of a known spec. */
const isSdkModel = (value: unknown): value is SdkModel =>
  typeof value === "string" ||
  (typeof value === "object" &&
    value !== null &&
    "specificationVersion" in value &&
    typeof value.specificationVersion === "string" &&
    SDK_SPEC_VERSIONS.has(value.specificationVersion));

export const ReasoningEffortSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ModelFeatureSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  label: z.string().optional(),
  effortOptions: z.array(ReasoningEffortSchema).min(1).optional(),
});

export type ModelFeature = z.infer<typeof ModelFeatureSchema>;

export const ApiKeyUsageSchema = z.object({
  allowUserKey: z.boolean(),
  userKeyOnly: z.boolean(),
});

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  subName: z.string().optional(),
  // Main provider for API routing and parameter configuration
  provider: z.string(),
  // Optional provider name for UI display/icons only
  displayProvider: z.string().optional(),
  api_sdk: z.custom<SdkModel>(isSdkModel).optional(),
  premium: z.boolean(),
  usesPremiumCredits: z.boolean(),
  // Skip rate limiting completely for this model
  skipRateLimit: z.boolean().optional(),
  // Mark older models as legacy
  legacy: z.boolean().optional(),
  // Preserve metadata but prevent new requests
  retired: z.boolean().optional(),
  description: z.string(),
  features: z.array(ModelFeatureSchema).default([]),
  apiKeyUsage: ApiKeyUsageSchema.default({
    allowUserKey: false,
    userKeyOnly: false,
  }),
});

export type Model = z.infer<typeof ModelSchema>;

/** A model's language model for streamText/agents; throws for image-only or SDK-less models. */
export const languageModelOf = (
  model: Pick<Model, "id" | "api_sdk">
): LanguageModel => {
  const sdkModel = model.api_sdk;
  if (
    typeof sdkModel === "string" ||
    (sdkModel !== undefined && "doStream" in sdkModel)
  ) {
    return sdkModel;
  }
  throw new Error(`Model ${model.id} has no AI SDK language model`);
};

/** A model's image model for generateImage; throws for language-only or SDK-less models. */
export const imageModelOf = (
  model: Pick<Model, "id" | "api_sdk">
): ImageModel => {
  const sdkModel = model.api_sdk;
  if (
    typeof sdkModel === "string" ||
    (sdkModel !== undefined && "maxImagesPerCall" in sdkModel)
  ) {
    return sdkModel;
  }
  throw new Error(`Model ${model.id} has no AI SDK image model`);
};
