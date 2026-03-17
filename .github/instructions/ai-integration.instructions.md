---
applyTo: "src/lib/ai/**/*.ts,src/routes/api.chat.ts,convex/ai/**/*.ts"
---

# AI Integration Review Guidelines

## Vercel AI SDK v6
- Use `@ai-sdk/gateway` for xAI, DeepSeek, Meta providers; direct SDKs for OpenAI, Anthropic, Google, Mistral.
- Ensure streaming responses are properly handled and cleaned up on abort.
- Tool calls must have proper type-safe argument validation.

## API Key Management
- API keys must be encrypted at rest. Flag any plaintext key storage.
- Never log API keys or include them in error messages.
- User-provided keys are stored encrypted in Convex — verify encryption before storage.

## Model Selection
- Validate model identifiers against known provider models.
- Handle model-specific capabilities (reasoning, vision, tool calling) correctly.
- Graceful fallback when a model is unavailable or rate-limited.

## Error Handling
- Detect and surface provider-specific errors (rate limits, quota exceeded, invalid key).
- Don't retry on authentication errors — surface to user immediately.
- Implement proper abort/cleanup for streaming connections.
