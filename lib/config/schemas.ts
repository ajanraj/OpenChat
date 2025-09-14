import { z } from "zod";

export const ModelFeatureSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  label: z.string().optional(),
  supportsEffort: z.boolean().optional(),
});

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
  description: z.string(),
  features: z.array(ModelFeatureSchema).default([]),
  apiKeyUsage: ApiKeyUsageSchema.default({
    allowUserKey: false,
    userKeyOnly: false,
  }),
});

export type Model = z.infer<typeof ModelSchema>;
