// Models allowed to attach uploaded files at persistence time in Convex.
// Keep in sync with frontend model feature flags.
export const FILE_UPLOAD_MODELS = [
  // Anthropic models
  "claude-4-5-opus",
  "claude-4-6-opus",
  "claude-4-6-sonnet",
  "claude-4-6-sonnet-reasoning",
  "claude-4-5-sonnet",
  "claude-4-5-sonnet-reasoning",
  "claude-4-5-haiku",
  "claude-4-5-haiku-reasoning",

  // OpenAI models
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
  "o3",
  "o3-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.5",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.1",
  "gpt-5.1-instant",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.2-instant",
  "gpt-5.3-instant",

  "glm-4.5v",

  // Google models
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-thinking",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-thinking",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-flash-preview-thinking",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite-preview-thinking",
  "gemini-3.1-pro-preview",

  // Meta models
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick:free",
  "meta-llama/llama-4-scout:free",

  // Mistral models
  "pixtral-large-latest",

  // Moonshot models
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2.5:reasoning",

  // Grok models
  "grok-3",
  "grok-3-mini",
  "x-ai/grok-4.1-fast-thinking",
  "x-ai/grok-4.1-fast",

  // Z.AI models
  "glm-4.6v",
] as const;

const FILE_UPLOAD_MODEL_SET = new Set<string>(FILE_UPLOAD_MODELS);

export function supportsFileUploadModel(modelId: string): boolean {
  return FILE_UPLOAD_MODEL_SET.has(modelId);
}
