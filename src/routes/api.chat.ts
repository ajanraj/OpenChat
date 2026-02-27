import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { createWebSocketFetch } from "ai-sdk-openai-websocket-fetch";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type FileUIPart,
  experimental_generateImage as generateImage,
  type JSONValue,
  smoothStream,
  stepCountIs,
  streamText,
  type Tool,
  type UIMessage,
} from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { ConvexError, type Infer } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Message } from "@/convex/schema/message";
import { MODELS_MAP } from "@/lib/config";
import { calculateConnectorStatus } from "@/lib/connector-utils";
import { createAgentTool } from "@/lib/create-agent-tool";
import { limitDepth } from "@/lib/depth-limiter";
import { ERROR_CODES } from "@/lib/error-codes";
import {
  classifyError,
  createErrorPart,
  createErrorResponse,
  createStreamingError,
  shouldShowInConversation,
} from "@/lib/error-utils";
import { authMiddleware } from "@/lib/middleware/auth";
import { buildSystemPrompt, PERSONAS_MAP } from "@/lib/prompt_config";
import {
  detectProviderErrorFromObject,
  detectProviderErrorInText,
} from "@/lib/provider-error-detector";
import {
  getOpenAIStreamModel,
  isOpenAITransportEligible,
  type OpenAIWebSocketFetch,
} from "@/lib/openai-websocket-transport";
import { sanitizeUserInput } from "@/lib/sanitize";
import { uploadBlobToR2 } from "@/lib/server-upload-helpers";
import { createMeteredSearchTool } from "@/lib/tools/search-credit-metering";

/**
 * Helper function to save an error message as an assistant message
 */
async function saveErrorMessage(
  chatId: Id<"chats">,
  userMsgId: Id<"messages"> | null,
  error: unknown,
  client: ConvexHttpClient,
  modelId?: string,
  modelName?: string,
  enableSearch?: boolean,
  reasoningEffort?: ReasoningEffort,
) {
  try {
    if (!userMsgId) {
      return null;
    }

    const classified = classifyError(error);
    const errorPart = createErrorPart(
      classified.code,
      classified.userFriendlyMessage,
      classified.message,
    );

    const { messageId } = await client.mutation(api.messages.saveAssistantMessage, {
      chatId,
      role: "assistant",
      content: "", // Empty content to avoid duplication and search pollution
      parentMessageId: userMsgId,
      parts: [errorPart],
      metadata: {
        modelId: modelId || "error",
        modelName: modelName || "Error",
        includeSearch: enableSearch,
        reasoningEffort: reasoningEffort || "none",
      },
    });

    return messageId;
  } catch (error) {
    console.error("Failed to save error message:", error);
    return null;
  }
}

type ReasoningEffort = "low" | "medium" | "high";
type SupportedProvider = "openrouter" | "openai" | "anthropic" | "mistral" | "meta" | "Qwen";

/**
 * Helper function to save user message to chat if not in reload mode
 */
async function saveUserMessage(
  messages: UIMessage[],
  chatId: Id<"chats">,
  client: ConvexHttpClient | undefined,
  reloadAssistantMessageId?: Id<"messages">,
): Promise<Id<"messages"> | null> {
  if (!reloadAssistantMessageId && client) {
    const userMessage = messages.at(-1);
    if (userMessage && userMessage.role === "user") {
      // Use parts directly since schema now matches AI SDK v5
      const userParts = (userMessage.parts || []).map((p) =>
        p.type === "text" ? { ...p, text: sanitizeUserInput(p.text) } : p,
      );

      // Extract text content for backwards compatibility
      const textContent = userParts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");

      const { messageId } = await client.mutation(api.messages.sendUserMessageToChat, {
        chatId,
        role: "user",
        content: sanitizeUserInput(textContent),
        parts: userParts,
        metadata: {}, // Empty metadata for user messages
      });
      return messageId;
    }
  }
  return null;
}

/**
 * Centralized reasoning effort configuration
 * - low: For quick responses with minimal reasoning depth
 * - medium: Balanced reasoning depth for most use cases
 * - high: Maximum reasoning depth for complex problems
 *
 * tokens: Used by Google and Anthropic providers
 * effort: Used by OpenAI and OpenRouter providers
 */
const REASONING_EFFORT_CONFIG = {
  low: {
    tokens: 1024,
    effort: "low",
  },
  medium: {
    tokens: 6000,
    effort: "medium",
  },
  high: {
    tokens: 12_000,
    effort: "high",
  },
} as const;

interface ChatRequest {
  messages: UIMessage[];
  chatId: Id<"chats">;
  model: string;
  personaId?: string;
  reloadAssistantMessageId?: Id<"messages">;
  editMessageId?: Id<"messages">;
  enableSearch?: boolean;
  reasoningEffort?: ReasoningEffort;
  userInfo?: { timezone?: string };
}

/**
 * Helper function to check if a model should have thinking enabled
 * based on its features configuration
 */
const shouldEnableThinking = (modelId: string): boolean => {
  const model = MODELS_MAP[modelId];
  if (!model) {
    return false;
  }

  const reasoningFeature = model.features?.find((f) => f.id === "reasoning");
  return reasoningFeature?.enabled === true;
};

/**
 * Helper function to check if a model supports tool calling
 * based on its features configuration
 */
const supportsToolCalling = (selectedModel: (typeof MODELS_MAP)[string]): boolean =>
  selectedModel.features?.some(
    (feature) => feature.id === "tool-calling" && feature.enabled === true,
  ) ?? false;

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;

const buildGoogleProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort,
): Record<string, JSONValue> => {
  if (shouldEnableThinking(modelId) && reasoningEffort) {
    const config = REASONING_EFFORT_CONFIG[reasoningEffort];
    const options = {
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: config.tokens,
      },
    } satisfies GoogleGenerativeAIProviderOptions;
    return options;
  }

  return {};
};

const buildOpenAIProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort,
): Record<string, JSONValue> => {
  if (shouldEnableThinking(modelId) && reasoningEffort) {
    const config = REASONING_EFFORT_CONFIG[reasoningEffort];
    const options = {
      reasoningEffort: config.effort,
      reasoningSummary: "detailed",
    } satisfies OpenAIResponsesProviderOptions;
    return options;
  }

  return {};
};

const buildAnthropicProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort,
): Record<string, JSONValue> => {
  if (shouldEnableThinking(modelId) && reasoningEffort) {
    const config = REASONING_EFFORT_CONFIG[reasoningEffort];
    const options = {
      thinking: {
        type: "enabled",
        budgetTokens: config.tokens,
      },
    } satisfies AnthropicProviderOptions;
    return options;
  }

  return {};
};

const buildOpenRouterProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort,
): Record<string, JSONValue> => {
  if (shouldEnableThinking(modelId) && reasoningEffort) {
    const config = REASONING_EFFORT_CONFIG[reasoningEffort];
    return {
      reasoning: {
        effort: config.effort,
      },
    };
  }

  return {};
};

/**
 * Handle image generation for image generation models
 */
async function handleImageGeneration({
  messages,
  chatId,
  selectedModel,
  userMsgId,
  client,
  token,
}: {
  messages: UIMessage[];
  chatId: Id<"chats">;
  selectedModel: (typeof MODELS_MAP)[string];
  userMsgId: Id<"messages"> | null;
  client?: ConvexHttpClient;
  token: string;
}) {
  let currentUserMsgId: Id<"messages"> | null = userMsgId;

  try {
    // Save user message first
    if (!currentUserMsgId && client) {
      currentUserMsgId = await saveUserMessage(messages, chatId, client);
    }
    // Extract the prompt from the last user message parts
    const lastMessage = messages.at(-1);
    const textPart = lastMessage?.parts?.find((part) => part.type === "text");
    const prompt = textPart?.text || "A beautiful image";

    // Generate the image using built-in API key
    // Use different parameters based on provider (OpenAI uses size, Google uses aspectRatio)
    const { image } =
      selectedModel.provider === "openai"
        ? await generateImage({
            model: selectedModel.api_sdk,
            prompt,
            size: "1024x1024",
          })
        : await generateImage({
            model: selectedModel.api_sdk,
            prompt,
            aspectRatio: "1:1",
          });

    // Upload image to R2 using standard upload helper (includes syncMetadata)
    const imageBuffer = image.uint8Array;
    const imageBlob = new Blob([new Uint8Array(imageBuffer)], {
      type: "image/png",
    });

    if (!client) {
      throw new Error("Authentication token required for image upload");
    }

    const savedGenerated = await uploadBlobToR2(imageBlob, {
      chatId,
      fileName: `generated-${Date.now()}.png`,
      token,
      isGenerated: true,
    });

    if (!savedGenerated?.url) {
      throw new Error("Failed to generate storage URL for uploaded image");
    }

    // Create file part for the generated image
    const filePart: FileUIPart = {
      type: "file",
      filename: savedGenerated?.fileName ?? "generated-image.png",
      mediaType: "image/png",
      url: savedGenerated.url,
    };

    // Save assistant message with image
    if (currentUserMsgId && client) {
      await client.mutation(api.messages.saveAssistantMessage, {
        chatId,
        role: "assistant",
        content: "", // Empty content - let the image speak for itself
        parentMessageId: currentUserMsgId,
        parts: [filePart], // Only include the file part, no redundant text
        metadata: {
          modelId: selectedModel.id,
          modelName: selectedModel.name,
          includeSearch: false,
          reasoningEffort: "none",
        },
      });
    }

    // Increment premium credits usage since image generation uses premium credits
    if (client) {
      await client.mutation(api.users.incrementMessageCount, {
        usesPremiumCredits: true,
      });
    }

    // Return success response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (currentUserMsgId && client) {
      await saveErrorMessage(
        chatId,
        currentUserMsgId,
        error,
        client,
        selectedModel.id,
        selectedModel.name,
      );
    }
    return createErrorResponse(error);
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    middleware: [authMiddleware],
    handlers: {
      POST: async ({ context, request }) => {
        const activeWebSocketFetches = new Set<OpenAIWebSocketFetch>();

        const closeWebSocketFetch = (wsFetch: OpenAIWebSocketFetch) => {
          wsFetch.close();
          activeWebSocketFetches.delete(wsFetch);
        };

        const closeAllWebSocketFetches = () => {
          for (const wsFetch of activeWebSocketFetches) {
            wsFetch.close();
          }
          activeWebSocketFetches.clear();
        };

        request.signal.addEventListener("abort", () => {
          closeAllWebSocketFetches();
        });

        try {
          const {
            messages,
            chatId,
            model,
            personaId,
            reloadAssistantMessageId,
            editMessageId,
            enableSearch,
            reasoningEffort,
            userInfo,
          } = (await request.json()) as ChatRequest;

          if (!(messages && chatId)) {
            return createErrorResponse(new Error("Missing required information"));
          }

          // --- Enhanced Input Validation ---
          if (!Array.isArray(messages) || messages.length === 0) {
            return createErrorResponse(new Error("'messages' must be a non-empty array."));
          }

          if (typeof chatId !== "string" || chatId.trim() === "") {
            return createErrorResponse(new Error("'chatId' must be a non-empty string."));
          }

          const selectedModel = MODELS_MAP[model];
          if (!selectedModel) {
            return createErrorResponse(new Error("Invalid 'model' provided."));
          }

          const { token, client } = context;

          // Get current user first (needed for multiple operations below)
          const user = await client.query(api.users.getCurrentUser, {});

          // --- Optimized Parallel Database Queries ---
          // Run independent queries in parallel to reduce latency
          const [userKeys, isUserPremiumForPremiumModels, userConnectors, chatProfile] =
            await Promise.all([
              // Get user API keys if model allows user keys
              selectedModel.apiKeyUsage?.allowUserKey
                ? client.query(api.api_keys.getApiKeys, {}).catch(() => [])
                : Promise.resolve([]),
              // Check premium status for premium models (only if needed)
              selectedModel.premium
                ? client.query(api.users.userHasPremium, {}).catch(() => false)
                : Promise.resolve(false),
              // Get user connectors from database (authoritative source)
              user
                ? client.query(api.connectors.listUserConnectors, {}).catch(() => [])
                : Promise.resolve([]),
              // Fetch chat's profile for system prompt personalization
              (async () => {
                try {
                  const chatDoc = await client.query(api.chats.getChat, {
                    chatId: chatId,
                  });
                  if (chatDoc?.profileId) {
                    return client.query(api.profiles.getProfile, {
                      profileId: chatDoc.profileId,
                    });
                  }
                } catch {
                  // Non-critical: fall back to user-level settings
                }
                return null;
              })(),
            ]);

          // Calculate connector status from database (server is authoritative)
          const connectorsStatus = calculateConnectorStatus(userConnectors);

          // --- API Key and Model Configuration ---
          const { apiKeyUsage } = selectedModel;
          let userApiKey: string | null = null;
          let keyEntry: { provider: string; mode?: string } | undefined;

          if (apiKeyUsage?.allowUserKey && Array.isArray(userKeys)) {
            try {
              keyEntry = userKeys.find(
                (k: { provider: string }) => k.provider === selectedModel.provider,
              );
              if (keyEntry) {
                userApiKey = await client.query(api.api_keys.getDecryptedKey, {
                  provider: selectedModel.provider as SupportedProvider,
                });
              }
            } catch (e) {
              // If this is a critical error (auth failure), we should return early
              if (e instanceof ConvexError && e.data === ERROR_CODES.NOT_AUTHENTICATED) {
                return createErrorResponse(e);
              }
            }
          }

          // Determine if we should use a user-provided API key
          const useUserKey = Boolean(
            (apiKeyUsage?.userKeyOnly && userApiKey) ||
            (keyEntry?.mode === "priority" && userApiKey),
          );

          // Reject early if model requires user key only but no user API key provided
          if (apiKeyUsage?.userKeyOnly && !userApiKey) {
            return createErrorResponse(new Error("user_key_required"));
          }

          // --- Premium Model Access Check ---
          // Only applies if user is NOT using their own API key
          if (selectedModel.premium && !useUserKey && !isUserPremiumForPremiumModels) {
            // Save user message first
            const userMsgId = await saveUserMessage(
              messages,
              chatId,
              client,
              reloadAssistantMessageId,
            );

            // Create premium access error
            const premiumError = new Error("PREMIUM_MODEL_ACCESS_DENIED");

            // Save error message to conversation
            await saveErrorMessage(
              chatId,
              userMsgId,
              premiumError,
              client,
              selectedModel.id,
              selectedModel.name,
              enableSearch,
              reasoningEffort,
            );

            // Return proper HTTP error response
            return createErrorResponse(premiumError);
          }

          // --- Rate Limiting (only if not using user key and model doesn't skip rate limits) ---
          let rateLimitError: Error | null = null;

          if (!(useUserKey || selectedModel.skipRateLimit)) {
            try {
              // Check if the selected model uses premium credits
              const usesPremiumCredits = selectedModel.usesPremiumCredits === true;

              await client.mutation(api.users.assertNotOverLimit, {
                usesPremiumCredits,
              });
            } catch (error) {
              if (error instanceof ConvexError) {
                const errorCode = error.data;
                if (
                  errorCode === ERROR_CODES.DAILY_LIMIT_REACHED ||
                  errorCode === ERROR_CODES.MONTHLY_LIMIT_REACHED ||
                  errorCode === ERROR_CODES.PREMIUM_LIMIT_REACHED
                ) {
                  rateLimitError = error;
                  // Don't throw yet - let user message save first
                } else {
                  throw error; // Re-throw non-rate-limit errors
                }
              } else {
                throw error; // Re-throw non-ConvexError errors
              }
            }
          }

          // --- Handle Rate Limit Error Early (but save messages first) ---
          if (rateLimitError) {
            // Save user message first (even though rate limited)
            const userMsgId = await saveUserMessage(
              messages,
              chatId,
              client,
              reloadAssistantMessageId,
            );

            // Save error message to conversation
            await saveErrorMessage(
              chatId,
              userMsgId,
              rateLimitError,
              client,
              selectedModel.id,
              selectedModel.name,
              enableSearch,
              reasoningEffort,
            );

            // Return proper HTTP error response (not 200)
            return createErrorResponse(rateLimitError);
          }

          const basePrompt = personaId ? PERSONAS_MAP[personaId]?.prompt : undefined;
          const enableTools =
            supportsToolCalling(selectedModel) && connectorsStatus.enabled.length > 0;
          const finalSystemPrompt = buildSystemPrompt(
            user,
            basePrompt,
            enableSearch,
            enableTools,
            userInfo?.timezone,
            undefined,
            undefined,
            connectorsStatus,
            chatProfile,
          );

          // Check if this is an image generation model
          const isImageGenerationModel = selectedModel.features?.some(
            (feature) => feature.id === "image-generation" && feature.enabled,
          );

          // Handle image generation models differently
          if (isImageGenerationModel) {
            // Image generation always uses built-in API key, no user key support
            return handleImageGeneration({
              messages,
              chatId,
              selectedModel,
              userMsgId: null,
              client,
              token,
            });
          }

          // --- Dedicated Flow Structure ---
          let userMsgId: Id<"messages"> | null = null;

          if (reloadAssistantMessageId) {
            // --- Reload Flow ---
            const details = await client.query(api.messages.getMessageDetails, {
              messageId: reloadAssistantMessageId,
            });
            userMsgId = details?.parentMessageId ?? null;
            await client.mutation(api.messages.deleteMessageAndDescendants, {
              messageId: reloadAssistantMessageId,
            });
          } else if (editMessageId) {
            // --- Edit Flow ---
            const lastMessage = messages.at(-1);

            if (lastMessage) {
              // Patch the message content with new text and parts
              await client.mutation(api.messages.patchMessageContent, {
                messageId: editMessageId,
                newContent: sanitizeUserInput(
                  lastMessage.parts
                    ?.filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("") || "",
                ),
                newParts: lastMessage.parts?.map((part) =>
                  part.type === "text" ? { ...part, text: sanitizeUserInput(part.text) } : part,
                ),
              });

              // Delete only subsequent messages (descendants) using enhanced mutation
              await client.mutation(api.messages.deleteMessageAndDescendants, {
                messageId: editMessageId,
                deleteOnlyDescendants: true,
              });

              userMsgId = editMessageId;
            }
          } else {
            // --- Normal Flow ---
            userMsgId = await saveUserMessage(messages, chatId, client, reloadAssistantMessageId);
          }

          const makeOptions = (useUser: boolean): ProviderOptions | undefined => {
            const key = useUser ? userApiKey : undefined;
            const apiKey = typeof key === "string" && key.length > 0 ? key : undefined;
            const userTag = user?._id ? `user_${user._id}` : undefined;

            if (selectedModel.provider === "gemini") {
              const options = buildGoogleProviderOptions(selectedModel.id, reasoningEffort);
              return {
                google: {
                  ...options,
                  ...(apiKey ? { apiKey } : {}),
                },
              };
            }
            if (selectedModel.provider === "openai") {
              const options = buildOpenAIProviderOptions(selectedModel.id, reasoningEffort);
              return {
                openai: {
                  ...options,
                  ...(apiKey ? { apiKey } : {}),
                },
              };
            }
            if (selectedModel.provider === "anthropic") {
              const options = buildAnthropicProviderOptions(selectedModel.id, reasoningEffort);
              return {
                anthropic: {
                  ...options,
                  ...(apiKey ? { apiKey } : {}),
                },
              };
            }
            if (selectedModel.provider === "openrouter") {
              const options = buildOpenRouterProviderOptions(selectedModel.id, reasoningEffort);
              return {
                openrouter: {
                  ...options,
                  ...(apiKey ? { apiKey } : {}),
                  ...(userTag ? { user: userTag } : {}),
                },
              };
            }
            return undefined;
          };

          const startTime = Date.now();
          // Pre-build the base metadata object before the stream starts
          const baseMetadata = {
            modelId: selectedModel.id,
            modelName: selectedModel.name,
            includeSearch: enableSearch,
            reasoningEffort: reasoningEffort || "none",
          };
          let finalUsage = {
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
            cachedInputTokens: 0,
          };

          let result: ReturnType<typeof streamText> | null = null;
          let wasUserKeyUsed = false;
          let errorMessageSaved = false;

          const stream = createUIMessageStream({
            originalMessages: messages,
            async execute({ writer }) {
              const runStream = async (useUserKeyOverride: boolean) => {
                const providerOptions = makeOptions(useUserKeyOverride);
                let modelForStream = selectedModel.api_sdk;
                let closeTransport: (() => void) | undefined;

                const toolset: Record<string, Tool> = {};

                const meteredSearchTool = createMeteredSearchTool({
                  enableSearch: Boolean(enableSearch),
                  consumeStandardCredits: async (count) => {
                    await client.mutation(api.users.incrementStandardCredits, {
                      count,
                    });
                  },
                });

                if (meteredSearchTool) {
                  toolset.search = meteredSearchTool;
                }

                if (isOpenAITransportEligible(selectedModel)) {
                  try {
                    const wsFetch = createWebSocketFetch();
                    activeWebSocketFetches.add(wsFetch);
                    let transportClosed = false;

                    closeTransport = () => {
                      if (transportClosed) {
                        return;
                      }
                      transportClosed = true;
                      closeWebSocketFetch(wsFetch);
                    };

                    const transportModel = getOpenAIStreamModel(
                      selectedModel,
                      wsFetch,
                      shouldEnableThinking(selectedModel.id),
                    );
                    if (transportModel) {
                      modelForStream = transportModel;
                    } else {
                      closeTransport();
                      closeTransport = undefined;
                    }
                  } catch (transportError) {
                    console.error(
                      "OpenAI WebSocket transport init failed; falling back to HTTP transport.",
                      transportError,
                    );
                  }
                }

                if (
                  supportsToolCalling(selectedModel) &&
                  user &&
                  connectorsStatus.enabled.length > 0
                ) {
                  toolset.create_agent = createAgentTool({
                    userId: user._id,
                    availableToolkits: connectorsStatus.enabled,
                    model: selectedModel.api_sdk,
                    providerOptions,
                    connectorsStatus,
                    writer,
                  });
                }

                let streamResult: ReturnType<typeof streamText>;
                try {
                  streamResult = streamText({
                    model: modelForStream,
                    system: finalSystemPrompt,
                    messages: await convertToModelMessages(messages),
                    tools: toolset,
                    stopWhen: stepCountIs(20),
                    experimental_transform: smoothStream({
                      delayInMs: 20,
                      chunking: "word",
                    }),
                    providerOptions,
                    onError: async ({ error }) => {
                      // Handle errors gracefully - save to conversation but don't throw
                      // The throwing behavior will be handled in the fullStream processing

                      // First, try to detect provider-specific error patterns
                      const detectedError = detectProviderErrorFromObject(
                        error,
                        selectedModel.provider,
                      );

                      if (detectedError) {
                        // If we detected a provider-specific error, save it with enhanced message
                        try {
                          await saveErrorMessage(
                            chatId,
                            userMsgId,
                            detectedError, // Pass DetectedError directly, don't wrap in Error
                            client,
                            selectedModel.id,
                            selectedModel.name,
                            enableSearch,
                            reasoningEffort,
                          );
                          errorMessageSaved = true; // Mark that error message was saved
                        } catch (saveError) {
                          console.error("Failed to save error message in onError:", saveError);
                        }
                        closeTransport?.();
                        return; // Exit early - error saved, no throwing
                      }

                      // Fallback to original error handling
                      if (shouldShowInConversation(error)) {
                        try {
                          await saveErrorMessage(
                            chatId,
                            userMsgId,
                            error,
                            client,
                            selectedModel.id,
                            selectedModel.name,
                            enableSearch,
                            reasoningEffort,
                          );
                          errorMessageSaved = true; // Mark that error message was saved
                        } catch (saveError) {
                          console.error("Failed to save fallback error message:", saveError);
                        }
                      }
                      closeTransport?.();
                      // No throwing - let the stream handle the error state gracefully
                    },
                    onFinish({ totalUsage }) {
                      finalUsage = {
                        inputTokens: totalUsage.inputTokens || 0,
                        outputTokens: totalUsage.outputTokens || 0,
                        reasoningTokens: totalUsage.reasoningTokens || 0,
                        totalTokens: totalUsage.totalTokens || 0,
                        cachedInputTokens: totalUsage.cachedInputTokens || 0,
                      };
                      closeTransport?.();
                    },
                  });
                } catch (streamStartError) {
                  closeTransport?.();
                  throw streamStartError;
                }

                // Enhanced stream processing with error detection
                void (async () => {
                  let accumulatedText = "";
                  let providerTextErrorDetected = false;

                  streamLoop: for await (const part of streamResult.fullStream) {
                    switch (part.type) {
                      case "error": {
                        // Error parts from AI SDK - these are already handled by onError callback
                        // No need to save again, stream processing continues normally
                        break;
                      }
                      case "text-delta": {
                        // Accumulate text and check for error patterns
                        accumulatedText += part.text;

                        // Check accumulated text for provider error patterns
                        const detectedError = detectProviderErrorInText(
                          accumulatedText,
                          selectedModel.provider,
                        );
                        if (detectedError && !providerTextErrorDetected) {
                          providerTextErrorDetected = true;
                          // Found an error pattern in the streaming text
                          // Save the error with the provider-specific message
                          try {
                            await saveErrorMessage(
                              chatId,
                              userMsgId,
                              detectedError, // Pass the DetectedError object directly
                              client,
                              selectedModel.id,
                              selectedModel.name,
                              enableSearch,
                              reasoningEffort,
                            );
                            errorMessageSaved = true; // Mark that error message was saved
                          } catch (saveError) {
                            console.error("Failed to save stream error message:", saveError);
                          }
                          break streamLoop;
                        }

                        // Limit accumulated text size to prevent memory issues
                        if (accumulatedText.length > 2000) {
                          accumulatedText = accumulatedText.slice(-1000);
                        }
                        break;
                      }
                      default:
                        // For other part types, process normally
                        break;
                    }
                  }
                })();

                // Merge the regular UI stream for normal processing
                writer.merge(
                  streamResult.toUIMessageStream({
                    sendReasoning: true,
                    sendSources: true,
                  }),
                );

                return streamResult;
              };

              const tryRun = async () => {
                if (apiKeyUsage?.allowUserKey) {
                  const primaryIsUserKey = useUserKey;
                  try {
                    wasUserKeyUsed = primaryIsUserKey;
                    result = await runStream(primaryIsUserKey);
                    return;
                  } catch (primaryError) {
                    if (shouldShowInConversation(primaryError)) {
                      await saveErrorMessage(
                        chatId,
                        userMsgId,
                        primaryError,
                        client,
                        selectedModel.id,
                        selectedModel.name,
                        enableSearch,
                        reasoningEffort,
                      );
                    }

                    const fallbackIsPossible =
                      primaryIsUserKey || (!primaryIsUserKey && Boolean(userApiKey));

                    if (!fallbackIsPossible) {
                      throw primaryError;
                    }

                    const fallbackIsUserKey = !primaryIsUserKey;
                    try {
                      wasUserKeyUsed = fallbackIsUserKey;
                      result = await runStream(fallbackIsUserKey);
                      return;
                    } catch (fallbackError) {
                      if (shouldShowInConversation(fallbackError)) {
                        await saveErrorMessage(
                          chatId,
                          userMsgId,
                          fallbackError,
                          client,
                          selectedModel.id,
                          selectedModel.name,
                          enableSearch,
                          reasoningEffort,
                        );
                      }
                      throw fallbackError;
                    }
                  }
                }

                wasUserKeyUsed = false;
                try {
                  result = await runStream(false);
                } catch (streamError) {
                  if (shouldShowInConversation(streamError)) {
                    await saveErrorMessage(
                      chatId,
                      userMsgId,
                      streamError,
                      client,
                      selectedModel.id,
                      selectedModel.name,
                      enableSearch,
                      reasoningEffort,
                    );
                  }
                  throw streamError;
                }
              };

              await tryRun();
            },
            async onFinish({ responseMessage }) {
              if (!result || errorMessageSaved) {
                return; // Don't save if no result or error message was already saved
              }

              const sanitizedParts = (responseMessage.parts ?? []).filter((part) => {
                if (!part || typeof part !== "object") {
                  return true;
                }

                return (part as { transient?: unknown }).transient !== true;
              });

              // Extract agent token usage from boundary markers and add to main usage
              const additionalAgentTokens = {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              };

              const agentBoundaryParts = sanitizedParts.filter(
                (part) => part.type === "data-agent-boundary",
              );

              for (const boundaryPart of agentBoundaryParts) {
                // Type assertion for boundary parts with data property
                const boundaryData = (
                  boundaryPart as {
                    data?: {
                      type?: string;
                      tokenUsage?: {
                        inputTokens?: number;
                        outputTokens?: number;
                        totalTokens?: number;
                      };
                    };
                  }
                ).data;
                if (boundaryData?.type === "end" && boundaryData?.tokenUsage) {
                  const usage = boundaryData.tokenUsage;
                  additionalAgentTokens.inputTokens += usage.inputTokens || 0;
                  additionalAgentTokens.outputTokens += usage.outputTokens || 0;
                  additionalAgentTokens.totalTokens += usage.totalTokens || 0;
                }
              }

              const finalMetadata: Infer<typeof Message>["metadata"] = {
                ...baseMetadata,
                serverDurationMs: Date.now() - startTime,
                // Add agent tokens to main token counts for unified tracking
                inputTokens: finalUsage.inputTokens + additionalAgentTokens.inputTokens,
                outputTokens: finalUsage.outputTokens + additionalAgentTokens.outputTokens,
                totalTokens: finalUsage.totalTokens + additionalAgentTokens.totalTokens,
                reasoningTokens: finalUsage.reasoningTokens,
                cachedInputTokens: finalUsage.cachedInputTokens,
              };

              const capturedText = sanitizedParts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("");

              const depthLimitedParts = limitDepth(sanitizedParts, 14);

              await client.mutation(api.messages.saveAssistantMessage, {
                chatId,
                role: "assistant",
                content: capturedText,
                parentMessageId: userMsgId || undefined,
                parts: depthLimitedParts,
                metadata: finalMetadata,
              });

              if (wasUserKeyUsed) {
                await client.mutation(api.api_keys.incrementUserApiKeyUsage, {
                  provider: selectedModel.provider,
                });
              } else if (!selectedModel.skipRateLimit) {
                const usesPremiumCredits = selectedModel.usesPremiumCredits === true;

                await client.mutation(api.users.incrementMessageCount, {
                  usesPremiumCredits,
                });
              }
            },
            onError: (error) => {
              // First, try to detect provider-specific error patterns
              const detectedError = detectProviderErrorFromObject(error, selectedModel.provider);

              if (detectedError) {
                // Return the provider-specific user-friendly message
                return detectedError.userFriendlyMessage;
              }

              // Fallback to original error handling
              const { errorPayload } = createStreamingError(error);
              return errorPayload.error.message;
            },
          });

          return createUIMessageStreamResponse({
            stream,
            consumeSseStream: consumeStream,
          });
        } catch (err) {
          closeAllWebSocketFetches();
          return createErrorResponse(err);
        }
      },
    },
  },
});
