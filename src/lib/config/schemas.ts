import { z } from "zod";

export const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);

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
  provider: z.string(), // Main provider for API routing and parameter configuration
  displayProvider: z.string().optional(), // Optional provider name for UI display/icons only
  api_sdk: z.any().optional(),
  premium: z.boolean(),
  usesPremiumCredits: z.boolean(),
  skipRateLimit: z.boolean().optional(), // Skip rate limiting completely for this model
  legacy: z.boolean().optional(), // Mark older models as legacy
  retired: z.boolean().optional(), // Preserve metadata but prevent new requests
  description: z.string(),
  features: z.array(ModelFeatureSchema).default([]),
  apiKeyUsage: ApiKeyUsageSchema.default({
    allowUserKey: false,
    userKeyOnly: false,
  }),
});

export type Model = z.infer<typeof ModelSchema>;
