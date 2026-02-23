import { createOpenAI } from "@ai-sdk/openai";
import type { createWebSocketFetch } from "ai-sdk-openai-websocket-fetch";
import type { streamText } from "ai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";

type StreamModel = Parameters<typeof streamText>[0]["model"];

export type OpenAIWebSocketFetch = ReturnType<typeof createWebSocketFetch>;

interface TransportEligibilityModel {
  provider: string;
  api_sdk: unknown;
}

interface OpenAIStreamModelInput extends TransportEligibilityModel {
  id: string;
}

const OPENAI_PROVIDER_PREFIX = "openai.";
const streamReasoningMiddleware = extractReasoningMiddleware({
  tagName: "think",
});

const getStringProperty = (value: unknown, propertyName: string): string | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const propertyValue = Reflect.get(value, propertyName);
  return typeof propertyValue === "string" ? propertyValue : undefined;
};

export const isOpenAITransportEligible = (selectedModel: TransportEligibilityModel): boolean => {
  if (selectedModel.provider !== "openai") {
    return false;
  }

  const provider = getStringProperty(selectedModel.api_sdk, "provider");
  return provider?.startsWith(OPENAI_PROVIDER_PREFIX) ?? false;
};

export const getOpenAIStreamModel = (
  selectedModel: OpenAIStreamModelInput,
  wsFetch: OpenAIWebSocketFetch,
  reasoningEnabled: boolean,
): StreamModel | undefined => {
  const modelId = getStringProperty(selectedModel.api_sdk, "modelId");
  if (!modelId) {
    return undefined;
  }

  const transportOpenAI = createOpenAI({ fetch: wsFetch });
  const transportModel = transportOpenAI(modelId);

  if (!reasoningEnabled) {
    return transportModel;
  }

  return wrapLanguageModel({
    model: transportModel,
    middleware: streamReasoningMiddleware,
  });
};
