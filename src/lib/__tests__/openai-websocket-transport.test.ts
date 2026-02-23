import { createWebSocketFetch } from "ai-sdk-openai-websocket-fetch";
import { describe, expect, it } from "vitest";
import { getOpenAIStreamModel, isOpenAITransportEligible } from "@/lib/openai-websocket-transport";

describe("openai websocket transport helpers", () => {
  it("returns eligible only for openai provider-backed sdk models", () => {
    expect(
      isOpenAITransportEligible({
        provider: "openai",
        api_sdk: { provider: "openai.responses", modelId: "gpt-5.2" },
      }),
    ).toBe(true);

    expect(
      isOpenAITransportEligible({
        provider: "openai",
        api_sdk: { provider: "gateway", modelId: "openai/gpt-oss-20b" },
      }),
    ).toBe(false);

    expect(
      isOpenAITransportEligible({
        provider: "anthropic",
        api_sdk: { provider: "openai.responses", modelId: "gpt-5.2" },
      }),
    ).toBe(false);
  });

  it("returns undefined when model id is missing", () => {
    const wsFetch = createWebSocketFetch();
    const model = getOpenAIStreamModel(
      {
        id: "gpt-5.2",
        provider: "openai",
        api_sdk: { provider: "openai.responses" },
      },
      wsFetch,
      false,
    );
    wsFetch.close();

    expect(model).toBeUndefined();
  });

  it("builds stream model when model id exists", () => {
    const wsFetch = createWebSocketFetch();
    const model = getOpenAIStreamModel(
      {
        id: "gpt-5.2",
        provider: "openai",
        api_sdk: { provider: "openai.responses", modelId: "gpt-5.2" },
      },
      wsFetch,
      true,
    );
    wsFetch.close();

    expect(model).toBeDefined();
    const hasDoStream = Boolean(model && typeof model === "object" && "doStream" in model);
    expect(hasDoStream).toBe(true);
  });
});
