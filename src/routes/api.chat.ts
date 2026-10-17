import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateImage,
  isStepCount,
  smoothStream,
  streamText,
  toUIMessageStream,
} from "ai";
import type { FileUIPart, TextStreamPart, Tool, ToolSet, UIMessage } from "ai";
import { createWebSocketFetch } from "ai-sdk-openai-websocket-fetch";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";

import { api } from "@/convex/_generated/api";
import type { Doc, Id, TableNames } from "@/convex/_generated/dataModel";
import type { Message } from "@/convex/schema/message";
import { MODEL_DEFAULT } from "@/lib/config/constants";
import { MODELS_MAP } from "@/lib/config/models";
import {
  imageModelOf,
  languageModelOf,
  ReasoningEffortSchema,
} from "@/lib/config/schemas";
import type { ReasoningEffort } from "@/lib/config/schemas";
import { calculateConnectorStatus } from "@/lib/connector-utils";
import { createAgentTool } from "@/lib/create-agent-tool";
import { ERROR_CODES } from "@/lib/error-codes";
import {
  classifyError,
  createErrorPart,
  createErrorResponse,
  createStreamingError,
  shouldShowInConversation,
} from "@/lib/error-utils";
import {
  createMessageCreditTracker,
  shouldRefundGeneration,
} from "@/lib/message-credits";
import type { MessageCreditTracker } from "@/lib/message-credits";
import { compactMessagePartsForStorage } from "@/lib/message-parts-storage";
import { authMiddleware, getServerRouteSecret } from "@/lib/middleware/auth";
import {
  getOpenRouterReasoningOptions,
  resolveReasoningEffort,
} from "@/lib/model-utils";
import {
  getOpenAIStreamModel,
  isOpenAITransportEligible,
} from "@/lib/openai-websocket-transport";
import type { OpenAIWebSocketFetch } from "@/lib/openai-websocket-transport";
import { buildSystemPrompt, PERSONAS_MAP } from "@/lib/prompt-config";
import {
  detectProviderErrorFromObject,
  detectProviderErrorInText,
} from "@/lib/provider-error-detector";
import type { DetectedError } from "@/lib/provider-error-detector";
import { sanitizeUserInput } from "@/lib/sanitize";
import { uploadBlobToR2 } from "@/lib/server-upload-helpers";
import { createMeteredSearchTool } from "@/lib/tools/search-credit-metering";

type ChatModel = (typeof MODELS_MAP)[string];

/** A parse or check that either produced a value or the error response to return. */
type Checked<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Whether an optional string holds text: "" counts as unset, like a falsy check. */
const hasText = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Helper function to save an error message as an assistant message
 */
const saveErrorMessage = async (
  chatId: Id<"chats">,
  userMsgId: Id<"messages"> | null,
  error: unknown,
  client: ConvexHttpClient,
  modelId?: string,
  modelName?: string,
  enableSearch?: boolean,
  reasoningEffort?: ReasoningEffort
) => {
  try {
    if (!userMsgId) {
      return null;
    }

    const classified = classifyError(error);
    const errorPart = createErrorPart(
      classified.code,
      classified.userFriendlyMessage,
      classified.message
    );

    const { messageId } = await client.mutation(
      api.messages.saveAssistantMessage,
      {
        chatId,
        role: "assistant",
        // Empty content to avoid duplication and search pollution
        content: "",
        parentMessageId: userMsgId,
        parts: [errorPart],
        metadata: {
          modelId: hasText(modelId) ? modelId : "error",
          modelName: hasText(modelName) ? modelName : "Error",
          includeSearch: enableSearch,
          reasoningEffort: reasoningEffort ?? "none",
        },
      }
    );

    return messageId;
  } catch (saveError) {
    console.error("Failed to save error message:", saveError);
    return null;
  }
};

// Providers the encrypted key store accepts (api_keys:getDecryptedKey's `provider` validator)
type KeyProvider = FunctionArgs<
  typeof api.api_keys.getDecryptedKey
>["provider"];
const KEY_PROVIDERS: readonly KeyProvider[] = [
  "openrouter",
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "meta",
  "Qwen",
];
const isKeyProvider = (provider: string): provider is KeyProvider =>
  KEY_PROVIDERS.some((keyProvider) => keyProvider === provider);

/**
 * Helper function to save user message to chat if not in reload mode
 */
const saveUserMessage = async (
  messages: UIMessage[],
  chatId: Id<"chats">,
  client: ConvexHttpClient | undefined,
  reloadAssistantMessageId?: Id<"messages">
): Promise<Id<"messages"> | null> => {
  if (!reloadAssistantMessageId && client) {
    const userMessage = messages.at(-1);
    if (userMessage && userMessage.role === "user") {
      // Use parts directly since schema now matches AI SDK v5
      const userParts = userMessage.parts.map((p) =>
        p.type === "text" ? { ...p, text: sanitizeUserInput(p.text) } : p
      );

      // Extract text content for backwards compatibility
      const textContent = userParts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");

      const { messageId } = await client.mutation(
        api.messages.sendUserMessageToChat,
        {
          chatId,
          role: "user",
          content: sanitizeUserInput(textContent),
          parts: userParts,
          // Empty metadata for user messages
          metadata: {},
        }
      );
      return messageId;
    }
  }
  return null;
};

interface ChatRequest {
  messages: UIMessage[];
  chatId: Id<"chats">;
  model: string;
  personaId?: string;
  profileId?: Id<"profiles">;
  reloadAssistantMessageId?: Id<"messages">;
  editMessageId?: Id<"messages">;
  enableSearch?: boolean;
  reasoningEffort?: unknown;
  timezone?: string;
}

// The client (useChat) sends UI messages; their parts are validated when converted for the model
const isUIMessage = (value: unknown): value is UIMessage =>
  isRecord(value) &&
  typeof value.role === "string" &&
  Array.isArray(value.parts);

// Convex validates ids where they are used; the route only needs them to be strings
const isId = <Table extends TableNames>(value: unknown): value is Id<Table> =>
  typeof value === "string";

// The falsy values JSON can encode (plus a missing field), which `!value` checks treated as unset
const isFalsyJson = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === false ||
  value === 0 ||
  value === "";

const invalidInput = (): { ok: false; response: Response } => ({
  ok: false,
  response: createErrorResponse(new ConvexError(ERROR_CODES.INVALID_INPUT)),
});

const rejectRequest = (message: string): { ok: false; response: Response } => ({
  ok: false,
  response: createErrorResponse(new Error(message)),
});

/** An optional id: unset when falsy, otherwise it must be a string. */
const parseOptionalId = <Table extends TableNames>(
  value: unknown
): Checked<Id<Table> | undefined> => {
  if (isFalsyJson(value)) {
    return { ok: true, value: undefined };
  }
  return isId<Table>(value) ? { ok: true, value } : invalidInput();
};

/** The request's optional settings; a field of the wrong type is invalid input. */
const parseChatOptions = (
  fields: Record<string, unknown>
): Checked<Omit<ChatRequest, "messages" | "chatId">> => {
  const profile = parseOptionalId<"profiles">(fields.profileId);
  const reload = parseOptionalId<"messages">(fields.reloadAssistantMessageId);
  const edit = parseOptionalId<"messages">(fields.editMessageId);
  if (!(profile.ok && reload.ok && edit.ok)) {
    return invalidInput();
  }

  const { model, personaId, enableSearch, reasoningEffort, userInfo } = fields;
  if (
    typeof model !== "string" ||
    (enableSearch !== undefined && typeof enableSearch !== "boolean")
  ) {
    return invalidInput();
  }

  return {
    ok: true,
    value: {
      model,
      personaId: typeof personaId === "string" ? personaId : undefined,
      profileId: profile.value,
      reloadAssistantMessageId: reload.value,
      editMessageId: edit.value,
      enableSearch,
      reasoningEffort,
      timezone:
        isRecord(userInfo) && typeof userInfo.timezone === "string"
          ? userInfo.timezone
          : undefined,
    },
  };
};

/** Validates the JSON body of a chat request. */
const parseChatRequest = (body: unknown): Checked<ChatRequest> => {
  const fields = isRecord(body) ? body : {};
  const { messages, chatId } = fields;

  if (isFalsyJson(messages) || isFalsyJson(chatId)) {
    return rejectRequest("Missing required information");
  }

  // --- Enhanced Input Validation ---
  if (!Array.isArray(messages) || messages.length === 0) {
    return rejectRequest("'messages' must be a non-empty array.");
  }
  const messageList: unknown[] = messages;

  if (
    messageList.some(
      (message) => isRecord(message) && message.role === "system"
    )
  ) {
    return invalidInput();
  }

  if (typeof chatId !== "string" || chatId.trim() === "") {
    return rejectRequest("'chatId' must be a non-empty string.");
  }

  if (!(messageList.every(isUIMessage) && isId<"chats">(chatId))) {
    return invalidInput();
  }

  const options = parseChatOptions(fields);
  if (!options.ok) {
    return options;
  }
  return {
    ok: true,
    value: { ...options.value, messages: messageList, chatId },
  };
};

/**
 * The model to run (the default one for a retired model) and the reasoning effort to run it with.
 */
const resolveModel = (
  model: string,
  requestedReasoningEffort: unknown
): Checked<{
  selectedModel: ChatModel;
  reasoningEffort: ReasoningEffort | undefined;
}> => {
  const requestedModel: ChatModel | undefined = MODELS_MAP[model];
  if (requestedModel === undefined) {
    return invalidInput();
  }

  const selectedModel: ChatModel | undefined =
    requestedModel.retired === true
      ? MODELS_MAP[MODEL_DEFAULT]
      : requestedModel;
  if (selectedModel === undefined) {
    return rejectRequest("Default model is unavailable.");
  }

  const parsedReasoningEffort = ReasoningEffortSchema.optional().safeParse(
    requestedReasoningEffort
  );
  if (!parsedReasoningEffort.success) {
    return invalidInput();
  }

  const resolvedReasoningEffort = resolveReasoningEffort(
    selectedModel.id,
    parsedReasoningEffort.data
  );
  if (!resolvedReasoningEffort.success) {
    return invalidInput();
  }
  return {
    ok: true,
    value: { selectedModel, reasoningEffort: resolvedReasoningEffort.effort },
  };
};

/**
 * Loads what the request needs from Convex: the user, their API keys, premium status and
 * connectors, and the chat's profile.
 */
const loadChatContext = async (
  client: ConvexHttpClient,
  selectedModel: ChatModel,
  chatId: Id<"chats">,
  profileId: Id<"profiles"> | undefined
) => {
  // Get current user first (needed for multiple operations below)
  const user = await client.query(api.users.getCurrentUser, {});

  // --- Optimized Parallel Database Queries ---
  // Run independent queries in parallel to reduce latency
  const [userKeys, isUserPremiumForPremiumModels, userConnectors, chatDoc] =
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
      // Fetch the chat document (authoritative source for profileId)
      client.query(api.chats.getChat, { chatId }).catch(() => null),
    ]);

  // Resolve profile from chat's bound profileId (authoritative),
  // falling back to client-provided / active profile for new chats
  const chatProfileId =
    chatDoc?.profileId ?? profileId ?? user?.activeProfileId;
  const chatProfile = chatProfileId
    ? await client
        .query(api.profiles.getProfile, { profileId: chatProfileId })
        .catch(() => null)
    : null;

  return {
    user,
    userKeys,
    isUserPremiumForPremiumModels,
    // Calculate connector status from database (server is authoritative)
    connectorsStatus: calculateConnectorStatus(userConnectors),
    chatProfile,
  };
};

interface UserKeyEntry {
  provider: string;
  mode?: string;
}

/** The user's own decrypted key for the model's provider, when the model accepts user keys. */
const resolveUserApiKey = async (
  client: ConvexHttpClient,
  selectedModel: ChatModel,
  userKeys: UserKeyEntry[]
): Promise<
  Checked<{ userApiKey: string | null; keyEntry: UserKeyEntry | undefined }>
> => {
  if (!selectedModel.apiKeyUsage?.allowUserKey) {
    return { ok: true, value: { userApiKey: null, keyEntry: undefined } };
  }

  const keyEntry = userKeys.find((k) => k.provider === selectedModel.provider);
  if (!keyEntry) {
    return { ok: true, value: { userApiKey: null, keyEntry } };
  }

  // Outside the try: a missing secret is a server misconfiguration (500)
  const serverSecret = getServerRouteSecret();
  // Keys are only stored for these providers, so any other has none to read
  if (!isKeyProvider(selectedModel.provider)) {
    return { ok: true, value: { userApiKey: null, keyEntry } };
  }
  try {
    const userApiKey = await client.query(api.api_keys.getDecryptedKey, {
      provider: selectedModel.provider,
      serverSecret,
    });
    return { ok: true, value: { userApiKey, keyEntry } };
  } catch (error) {
    // If this is a critical error (auth failure), we should return early
    if (
      error instanceof ConvexError &&
      error.data === ERROR_CODES.NOT_AUTHENTICATED
    ) {
      return { ok: false, response: createErrorResponse(error) };
    }
    // Convex rejected the server secret: fail loudly rather than silently
    // billing the platform key for a user who brought their own
    if (
      error instanceof ConvexError &&
      error.data === ERROR_CODES.UNAUTHORIZED
    ) {
      throw new Error(
        "Convex rejected SERVER_ROUTE_SECRET; set the same value in the web server and Convex env.",
        { cause: error }
      );
    }
    // Other failures (e.g. an undecryptable key) fall back to the platform key
    return { ok: true, value: { userApiKey: null, keyEntry } };
  }
};

/** The user's turn: what a refused request still saves to the conversation. */
interface Turn {
  messages: UIMessage[];
  chatId: Id<"chats">;
  client: ConvexHttpClient;
  reloadAssistantMessageId?: Id<"messages">;
  selectedModel: ChatModel;
  enableSearch?: boolean;
  reasoningEffort?: ReasoningEffort;
}

/** Saves the user message and `error` as the reply, then returns the error response. */
const rejectTurn = async (turn: Turn, error: Error): Promise<Response> => {
  // Save user message first
  const userMsgId = await saveUserMessage(
    turn.messages,
    turn.chatId,
    turn.client,
    turn.reloadAssistantMessageId
  );

  // Save error message to conversation
  await saveErrorMessage(
    turn.chatId,
    userMsgId,
    error,
    turn.client,
    turn.selectedModel.id,
    turn.selectedModel.name,
    turn.enableSearch,
    turn.reasoningEffort
  );

  // Return proper HTTP error response (not 200)
  return createErrorResponse(error);
};

const RATE_LIMIT_ERROR_CODES = new Set<unknown>([
  ERROR_CODES.DAILY_LIMIT_REACHED,
  ERROR_CODES.MONTHLY_LIMIT_REACHED,
  ERROR_CODES.PREMIUM_LIMIT_REACHED,
]);

/**
 * Charges the platform credit up front, in one transaction so concurrent requests cannot
 * overspend. Returns the rate-limit error to report, or null; other failures throw.
 */
const chargeCredit = async (
  credits: MessageCreditTracker,
  usesPremiumCredits: boolean
): Promise<Error | null> => {
  try {
    await credits.charge(usesPremiumCredits);
    return null;
  } catch (error) {
    // A rate limit is reported once the user message is saved; anything else is re-thrown
    if (
      error instanceof ConvexError &&
      RATE_LIMIT_ERROR_CODES.has(error.data)
    ) {
      return error;
    }
    throw error;
  }
};

/**
 * Refuses a turn the user can't take and charges the platform credit for the rest. Returns the
 * error response, or null to generate.
 */
const admitTurn = async ({
  turn,
  user,
  credits,
  useUserKey,
  hasUserApiKey,
  isImageGenerationModel,
  isUserPremiumForPremiumModels,
}: {
  turn: Turn;
  user: Doc<"users"> | null;
  credits: MessageCreditTracker;
  useUserKey: boolean;
  hasUserApiKey: boolean;
  isImageGenerationModel: boolean;
  isUserPremiumForPremiumModels: boolean;
}): Promise<Response | null> => {
  const { selectedModel } = turn;

  // Reject early if model requires user key only but no user API key provided
  if (selectedModel.apiKeyUsage?.userKeyOnly && !hasUserApiKey) {
    return createErrorResponse(new Error("user_key_required"));
  }

  // Guests cannot generate images (the UI hides these models from them)
  if (isImageGenerationModel && (!user || user.isAnonymous === true)) {
    return createErrorResponse(new ConvexError(ERROR_CODES.UNAUTHORIZED));
  }

  // --- Premium Model Access Check ---
  // Only applies if user is NOT using their own API key
  if (selectedModel.premium && !useUserKey && !isUserPremiumForPremiumModels) {
    return await rejectTurn(turn, new Error("PREMIUM_MODEL_ACCESS_DENIED"));
  }

  // --- Credits (only if not using user key and model doesn't skip rate limits) ---
  if (useUserKey || selectedModel.skipRateLimit === true) {
    return null;
  }
  const rateLimitError = await chargeCredit(
    credits,
    selectedModel.usesPremiumCredits
  );
  // --- Handle Rate Limit Error Early (but save messages first) ---
  return rateLimitError ? await rejectTurn(turn, rateLimitError) : null;
};

/**
 * Saves the user message this reply answers, or for a reload or edit rewinds the chat to it.
 * Returns its id.
 */
const prepareUserMessage = async ({
  client,
  messages,
  chatId,
  reloadAssistantMessageId,
  editMessageId,
}: {
  client: ConvexHttpClient;
  messages: UIMessage[];
  chatId: Id<"chats">;
  reloadAssistantMessageId?: Id<"messages">;
  editMessageId?: Id<"messages">;
}): Promise<Id<"messages"> | null> => {
  if (reloadAssistantMessageId) {
    // --- Reload Flow ---
    const details = await client.query(api.messages.getMessageDetails, {
      messageId: reloadAssistantMessageId,
    });
    await client.mutation(api.messages.deleteMessageAndDescendants, {
      messageId: reloadAssistantMessageId,
    });
    return details?.parentMessageId ?? null;
  }

  if (editMessageId) {
    // --- Edit Flow ---
    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      return null;
    }

    // Patch the message content with new text and parts
    await client.mutation(api.messages.patchMessageContent, {
      messageId: editMessageId,
      newContent: sanitizeUserInput(
        lastMessage.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("") ?? ""
      ),
      newParts: lastMessage.parts?.map((part) =>
        part.type === "text"
          ? { ...part, text: sanitizeUserInput(part.text) }
          : part
      ),
    });

    // Delete only subsequent messages (descendants) using enhanced mutation
    await client.mutation(api.messages.deleteMessageAndDescendants, {
      messageId: editMessageId,
      deleteOnlyDescendants: true,
    });

    return editMessageId;
  }

  // --- Normal Flow ---
  return await saveUserMessage(
    messages,
    chatId,
    client,
    reloadAssistantMessageId
  );
};

/**
 * Helper function to check if a model should have thinking enabled
 * based on its features configuration
 */
const shouldEnableThinking = (modelId: string): boolean => {
  const model: ChatModel | undefined = MODELS_MAP[modelId];
  if (model === undefined) {
    return false;
  }

  const reasoningFeature = model.features?.find((f) => f.id === "reasoning");
  return reasoningFeature?.enabled === true;
};

/**
 * Helper function to check if a model supports tool calling
 * based on its features configuration
 */
const supportsToolCalling = (selectedModel: ChatModel): boolean =>
  selectedModel.features?.some(
    (feature) => feature.id === "tool-calling" && feature.enabled
  ) ?? false;

type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

const buildGoogleProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort
): GoogleLanguageModelOptions => {
  if (shouldEnableThinking(modelId) && reasoningEffort !== "none") {
    const options = {
      thinkingConfig: {
        includeThoughts: true,
      },
    } satisfies GoogleLanguageModelOptions;
    return options;
  }

  return {};
};

const buildOpenAIProviderOptions = (
  modelId: string,
  reasoningEffort?: ReasoningEffort
): OpenAIResponsesProviderOptions => {
  if (shouldEnableThinking(modelId) && reasoningEffort !== "none") {
    const options = {
      reasoningSummary: "detailed",
    } satisfies OpenAIResponsesProviderOptions;
    return options;
  }

  return {};
};

/** Provider options for one generation attempt, with the user's key when it is the one used. */
const buildProviderOptions = (
  selectedModel: ChatModel,
  reasoningEffort: ReasoningEffort | undefined,
  apiKey: string | null,
  userTag: string | undefined
): ProviderOptions | undefined => {
  const apiKeyOption = hasText(apiKey) ? { apiKey } : {};

  if (selectedModel.provider === "gemini") {
    const options = buildGoogleProviderOptions(
      selectedModel.id,
      reasoningEffort
    );
    return { google: { ...options, ...apiKeyOption } };
  }
  if (selectedModel.provider === "openai") {
    const options = buildOpenAIProviderOptions(
      selectedModel.id,
      reasoningEffort
    );
    return { openai: { ...options, ...apiKeyOption } };
  }
  if (selectedModel.provider === "anthropic") {
    return { anthropic: apiKeyOption };
  }
  if (selectedModel.provider === "openrouter") {
    const options = getOpenRouterReasoningOptions(
      selectedModel.id,
      reasoningEffort
    );
    return {
      openrouter: {
        ...options,
        ...apiKeyOption,
        ...(userTag === undefined ? {} : { user: userTag }),
      },
    };
  }
  return undefined;
};

/**
 * Reads a copy of the model stream until the streamed text matches a provider error pattern,
 * then reports that error once. Only recent text is kept, to bound memory.
 */
const watchStreamForProviderErrors = async (
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  provider: string,
  onDetected: (detectedError: DetectedError) => Promise<void>
): Promise<void> => {
  let accumulatedText = "";
  let detectedError: DetectedError | null = null;

  for await (const part of stream) {
    // Error parts are already handled by streamText's onError; other parts carry no text
    if (part.type !== "text-delta") {
      continue;
    }

    // Accumulate text and check for error patterns
    accumulatedText += part.text;
    detectedError = detectProviderErrorInText(accumulatedText, provider);
    if (detectedError) {
      break;
    }

    // Limit accumulated text size to prevent memory issues
    if (accumulatedText.length > 2000) {
      accumulatedText = accumulatedText.slice(-1000);
    }
  }

  if (detectedError) {
    await onDetected(detectedError);
  }
};

const isTransientPart = (part: unknown): boolean =>
  isRecord(part) && part.transient === true;

const tokenCount = (value: unknown): number =>
  typeof value === "number" && !Number.isNaN(value) ? value : 0;

/**
 * Token usage agents report in their end boundary parts, summed so it can be added to the
 * main usage.
 */
const sumAgentTokenUsage = (parts: UIMessage["parts"]) => {
  const total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const part of parts) {
    const data: unknown =
      part.type === "data-agent-boundary" && "data" in part
        ? part.data
        : undefined;
    if (isRecord(data) && data.type === "end" && isRecord(data.tokenUsage)) {
      total.inputTokens += tokenCount(data.tokenUsage.inputTokens);
      total.outputTokens += tokenCount(data.tokenUsage.outputTokens);
      total.totalTokens += tokenCount(data.tokenUsage.totalTokens);
    }
  }
  return total;
};

/**
 * Handle image generation for image generation models. The credit was charged when the
 * request started; failures before the assistant message is saved refund it.
 */
const handleImageGeneration = async ({
  messages,
  chatId,
  selectedModel,
  userMsgId,
  client,
  token,
  credits,
}: {
  messages: UIMessage[];
  chatId: Id<"chats">;
  selectedModel: ChatModel;
  userMsgId: Id<"messages"> | null;
  client?: ConvexHttpClient;
  token: string;
  credits: MessageCreditTracker;
}) => {
  let currentUserMsgId: Id<"messages"> | null = userMsgId;
  // Only a failed generation is refunded; once the image exists, later failures (upload, or the
  // chat being deleted meanwhile) keep the charge
  let generated = false;

  try {
    // Needed for the upload; read before generating so a missing secret fails before the paid
    // call (when a credit was charged, credits.charge() already read it)
    const serverSecret = getServerRouteSecret();
    // Save user message first
    if (!currentUserMsgId && client) {
      currentUserMsgId = await saveUserMessage(messages, chatId, client);
    }
    // Extract the prompt from the last user message parts
    const lastMessage = messages.at(-1);
    const textPart = lastMessage?.parts?.find((part) => part.type === "text");
    const promptText = textPart?.text;
    const prompt = hasText(promptText) ? promptText : "A beautiful image";

    // Generate the image using built-in API key
    // Use different parameters based on provider (OpenAI uses size, Google uses aspectRatio)
    const model = imageModelOf(selectedModel);
    const { image } =
      selectedModel.provider === "openai"
        ? await generateImage({ model, prompt, size: "1024x1024" })
        : await generateImage({ model, prompt, aspectRatio: "1:1" });
    generated = true;

    // Upload image to R2 using standard upload helper (includes syncMetadata).
    // Providers return different formats (e.g. Flux 3 defaults to JPEG), so keep the reported type.
    const { mediaType } = image;
    const extension = mediaType.split("/")[1] ?? "png";
    const imageBlob = new Blob([new Uint8Array(image.uint8Array)], {
      type: mediaType,
    });

    if (!client) {
      throw new Error("Authentication token required for image upload");
    }

    const savedGenerated = await uploadBlobToR2(imageBlob, {
      chatId,
      fileName: `generated-${Date.now()}.${extension}`,
      token,
      isGenerated: true,
      serverSecret,
    });

    if (!hasText(savedGenerated.url)) {
      throw new Error("Failed to generate storage URL for uploaded image");
    }

    // Create file part for the generated image
    const filePart: FileUIPart = {
      type: "file",
      filename: savedGenerated.fileName ?? `generated-image.${extension}`,
      mediaType,
      url: savedGenerated.url,
    };

    // Save assistant message with image
    if (currentUserMsgId) {
      await client.mutation(api.messages.saveAssistantMessage, {
        chatId,
        role: "assistant",
        // Empty content - let the image speak for itself
        content: "",
        parentMessageId: currentUserMsgId,
        // Only include the file part, no redundant text
        parts: [filePart],
        metadata: {
          modelId: selectedModel.id,
          modelName: selectedModel.name,
          includeSearch: false,
          reasoningEffort: "none",
        },
      });
    }

    // Return success response
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (!generated) {
      await credits.refund();
    }
    if (currentUserMsgId && client) {
      await saveErrorMessage(
        chatId,
        currentUserMsgId,
        error,
        client,
        selectedModel.id,
        selectedModel.name
      );
    }
    return createErrorResponse(error);
  }
};

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

        // Platform credit for this request: charged before generating, refunded at most
        // once if the generation itself fails (never for aborts or failed saves)
        const credits = createMessageCreditTracker(
          context.client,
          request.signal
        );

        try {
          const body: unknown = await request.json();
          const parsedRequest = parseChatRequest(body);
          if (!parsedRequest.ok) {
            return parsedRequest.response;
          }
          const {
            messages,
            chatId,
            model,
            personaId,
            profileId,
            reloadAssistantMessageId,
            editMessageId,
            enableSearch,
            reasoningEffort: requestedReasoningEffort,
            timezone,
          } = parsedRequest.value;

          const resolvedModel = resolveModel(model, requestedReasoningEffort);
          if (!resolvedModel.ok) {
            return resolvedModel.response;
          }
          const { selectedModel, reasoningEffort } = resolvedModel.value;

          const { token, client } = context;

          const {
            user,
            userKeys,
            isUserPremiumForPremiumModels,
            connectorsStatus,
            chatProfile,
          } = await loadChatContext(client, selectedModel, chatId, profileId);

          // --- API Key and Model Configuration ---
          const { apiKeyUsage } = selectedModel;
          const resolvedKey = await resolveUserApiKey(
            client,
            selectedModel,
            userKeys
          );
          if (!resolvedKey.ok) {
            return resolvedKey.response;
          }
          const { userApiKey, keyEntry } = resolvedKey.value;
          const hasUserApiKey = hasText(userApiKey);

          // Determine if we should use a user-provided API key
          const useUserKey =
            hasUserApiKey &&
            (apiKeyUsage?.userKeyOnly || keyEntry?.mode === "priority");

          // Check if this is an image generation model
          const isImageGenerationModel = selectedModel.features?.some(
            (feature) => feature.id === "image-generation" && feature.enabled
          );

          const refusal = await admitTurn({
            turn: {
              messages,
              chatId,
              client,
              reloadAssistantMessageId,
              selectedModel,
              enableSearch,
              reasoningEffort,
            },
            user,
            credits,
            useUserKey,
            hasUserApiKey,
            isImageGenerationModel,
            isUserPremiumForPremiumModels,
          });
          if (refusal) {
            return refusal;
          }

          const basePrompt = hasText(personaId)
            ? PERSONAS_MAP[personaId]?.prompt
            : undefined;
          const enableTools =
            supportsToolCalling(selectedModel) &&
            connectorsStatus.enabled.length > 0;
          const finalSystemPrompt = buildSystemPrompt(
            user,
            basePrompt,
            enableSearch,
            enableTools,
            timezone,
            undefined,
            undefined,
            connectorsStatus,
            chatProfile
          );

          // Handle image generation models differently
          if (isImageGenerationModel) {
            // Image generation always uses built-in API key, no user key support
            return await handleImageGeneration({
              messages,
              chatId,
              selectedModel,
              userMsgId: null,
              client,
              token,
              credits,
            });
          }

          // --- Dedicated Flow Structure ---
          const userMsgId = await prepareUserMessage({
            client,
            messages,
            chatId,
            reloadAssistantMessageId,
            editMessageId,
          });

          const userTag = user ? `user_${user._id}` : undefined;
          const makeOptions = (useUser: boolean) =>
            buildProviderOptions(
              selectedModel,
              reasoningEffort,
              useUser ? userApiKey : null,
              userTag
            );

          const startTime = Date.now();
          // Pre-build the base metadata object before the stream starts
          const baseMetadata = {
            modelId: selectedModel.id,
            modelName: selectedModel.name,
            includeSearch: enableSearch,
            reasoningEffort: reasoningEffort ?? "none",
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
          // Set when the provider stream reports an error. Errors detected in the streamed
          // text are not counted: model output can be steered to match those patterns.
          let generationFailed = false;

          const stream = createUIMessageStream({
            originalMessages: messages,
            async execute({ writer }) {
              const runStream = async (useUserKeyOverride: boolean) => {
                const providerOptions = makeOptions(useUserKeyOverride);
                const languageModel = languageModelOf(selectedModel);
                let modelForStream = languageModel;
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
                      shouldEnableThinking(selectedModel.id)
                    );
                    if (transportModel === undefined) {
                      closeTransport();
                      closeTransport = undefined;
                    } else {
                      modelForStream = transportModel;
                    }
                  } catch (transportError) {
                    console.error(
                      "OpenAI WebSocket transport init failed; falling back to HTTP transport.",
                      transportError
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
                    model: languageModel,
                    reasoning: reasoningEffort,
                    providerOptions,
                    connectorsStatus,
                    writer,
                  });
                }

                const startStream = async () =>
                  streamText({
                    model: modelForStream,
                    instructions: finalSystemPrompt,
                    messages: await convertToModelMessages(messages),
                    tools: toolset,
                    stopWhen: isStepCount(20),
                    // AI SDK 7 maps this standardized value into each provider's request.
                    reasoning: reasoningEffort,
                    experimental_transform: smoothStream({
                      delayInMs: 20,
                      chunking: "word",
                    }),
                    providerOptions,
                    onError: async ({ error }) => {
                      // Handle errors gracefully - save to conversation but don't throw
                      // The throwing behavior will be handled while processing the stream
                      generationFailed = true;

                      // First, try to detect provider-specific error patterns
                      const detectedError = detectProviderErrorFromObject(
                        error,
                        selectedModel.provider
                      );

                      if (detectedError) {
                        // If we detected a provider-specific error, save it with enhanced message
                        try {
                          await saveErrorMessage(
                            chatId,
                            userMsgId,
                            // Pass DetectedError directly, don't wrap in Error
                            detectedError,
                            client,
                            selectedModel.id,
                            selectedModel.name,
                            enableSearch,
                            reasoningEffort
                          );
                          // Mark that error message was saved
                          errorMessageSaved = true;
                        } catch (saveError) {
                          console.error(
                            "Failed to save error message in onError:",
                            saveError
                          );
                        }
                        closeTransport?.();
                        // Exit early - error saved, no throwing
                        return;
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
                            reasoningEffort
                          );
                          // Mark that error message was saved
                          errorMessageSaved = true;
                        } catch (saveError) {
                          console.error(
                            "Failed to save fallback error message:",
                            saveError
                          );
                        }
                      }
                      closeTransport?.();
                      // No throwing - let the stream handle the error state gracefully
                    },
                    onEnd({ usage }) {
                      finalUsage = {
                        inputTokens: usage.inputTokens ?? 0,
                        outputTokens: usage.outputTokens ?? 0,
                        reasoningTokens:
                          usage.outputTokenDetails.reasoningTokens ?? 0,
                        totalTokens: usage.totalTokens ?? 0,
                        cachedInputTokens:
                          usage.inputTokenDetails.cacheReadTokens ?? 0,
                      };
                      closeTransport?.();
                    },
                  });
                const streamResult = await startStream().catch(
                  (streamStartError: unknown) => {
                    closeTransport?.();
                    throw streamStartError;
                  }
                );

                // Enhanced stream processing with error detection
                void watchStreamForProviderErrors(
                  streamResult.stream,
                  selectedModel.provider,
                  async (detectedError) => {
                    // Save the error with the provider-specific message
                    try {
                      await saveErrorMessage(
                        chatId,
                        userMsgId,
                        // Pass the DetectedError object directly
                        detectedError,
                        client,
                        selectedModel.id,
                        selectedModel.name,
                        enableSearch,
                        reasoningEffort
                      );
                      // Mark that error message was saved
                      errorMessageSaved = true;
                    } catch (saveError) {
                      console.error(
                        "Failed to save stream error message:",
                        saveError
                      );
                    }
                  }
                );

                // Merge the regular UI stream for normal processing
                writer.merge(
                  toUIMessageStream({
                    stream: streamResult.stream,
                    sendReasoning: true,
                    sendSources: true,
                  })
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
                        reasoningEffort
                      );
                    }

                    const fallbackIsPossible =
                      primaryIsUserKey || (!primaryIsUserKey && hasUserApiKey);

                    if (!fallbackIsPossible) {
                      throw primaryError;
                    }

                    const fallbackIsUserKey = !primaryIsUserKey;
                    try {
                      if (fallbackIsUserKey) {
                        // The platform-key attempt failed; the user's own key takes over
                        await credits.refund();
                      } else if (selectedModel.skipRateLimit !== true) {
                        // Falling back from the user's key to the platform key costs a credit
                        await credits.charge(selectedModel.usesPremiumCredits);
                      }
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
                          reasoningEffort
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
                      reasoningEffort
                    );
                  }
                  throw streamError;
                }
              };

              await tryRun();
            },
            async onEnd({ responseMessage }) {
              if (
                shouldRefundGeneration({
                  hasResult: result !== null,
                  generationFailed,
                  parts: responseMessage.parts ?? [],
                })
              ) {
                await credits.refund();
              }
              // Don't save if no result or error message was already saved
              if (!result || errorMessageSaved) {
                return;
              }

              const sanitizedParts = (responseMessage.parts ?? []).filter(
                (part) => !isTransientPart(part)
              );

              // Extract agent token usage from boundary markers and add to main usage
              const additionalAgentTokens = sumAgentTokenUsage(sanitizedParts);

              const finalMetadata: Infer<typeof Message>["metadata"] = {
                ...baseMetadata,
                serverDurationMs: Date.now() - startTime,
                // Add agent tokens to main token counts for unified tracking
                inputTokens:
                  finalUsage.inputTokens + additionalAgentTokens.inputTokens,
                outputTokens:
                  finalUsage.outputTokens + additionalAgentTokens.outputTokens,
                totalTokens:
                  finalUsage.totalTokens + additionalAgentTokens.totalTokens,
                reasoningTokens: finalUsage.reasoningTokens,
                cachedInputTokens: finalUsage.cachedInputTokens,
              };

              const capturedText = sanitizedParts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("");

              // Platform credits were charged when the request started
              await client.mutation(api.messages.saveAssistantMessage, {
                chatId,
                role: "assistant",
                content: capturedText,
                parentMessageId: userMsgId ?? undefined,
                parts: compactMessagePartsForStorage(
                  sanitizedParts,
                  capturedText
                ),
                metadata: finalMetadata,
              });

              if (wasUserKeyUsed) {
                await client.mutation(api.api_keys.incrementUserApiKeyUsage, {
                  provider: selectedModel.provider,
                });
              }
            },
            onError: (error) => {
              // First, try to detect provider-specific error patterns
              const detectedError = detectProviderErrorFromObject(
                error,
                selectedModel.provider
              );

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
        } catch (error) {
          closeAllWebSocketFetches();
          // Failed before generating (e.g. reload/edit setup): return the credit
          await credits.refund();
          console.error("Chat request failed:", error);
          return createErrorResponse(error);
        }
      },
    },
  },
});
