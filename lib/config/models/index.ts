import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { z } from "zod";
import { ModelSchema } from "../schemas";
import { ANTHROPIC_MODELS } from "./anthropic";
import { DEEPSEEK_MODELS } from "./deepseek";
import { FAL_MODELS } from "./fal";
import { GOOGLE_MODELS } from "./google";
import { META_MODELS } from "./meta";
import { MISTRAL_MODELS } from "./mistral";
import { MOONSHOT_MODELS } from "./moonshot";
import { OPENAI_MODELS } from "./openai";
import { OPENROUTER_MODELS } from "./openrouter";
import { QWEN_MODELS } from "./qwen";
import { XAI_MODELS } from "./xai";
import { ZAI_MODELS } from "./zai";

const reasoningMiddleware = extractReasoningMiddleware({
  tagName: "think",
  // separator: '\n',
  // startWithReasoning: true,
});

// Combine all models from different providers
export const MODELS_DATA = [
  ...XAI_MODELS,
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...GOOGLE_MODELS,
  ...META_MODELS,
  ...MISTRAL_MODELS,
  ...DEEPSEEK_MODELS,
  ...FAL_MODELS,
  ...MOONSHOT_MODELS,
  ...ZAI_MODELS,
  ...QWEN_MODELS,
  ...OPENROUTER_MODELS,
];

export const MODELS_RAW = z.array(ModelSchema).parse(MODELS_DATA);

export const MODELS = MODELS_RAW.map((m) => ({
  ...m,
  api_sdk: m.features?.some((f) => f.id === "reasoning" && f.enabled)
    ? wrapLanguageModel({ model: m.api_sdk, middleware: reasoningMiddleware })
    : m.api_sdk,
}));

// Add a map for O(1) lookup by id
export const MODELS_MAP: Record<string, (typeof MODELS)[0]> =
  Object.fromEntries(MODELS.map((model) => [model.id, model]));

export const MODELS_OPTIONS = MODELS;
