import { afterEach, describe, expect, it, vi } from "vitest";
import { chatTransport, setChatAuthToken } from "../chat-transport";

const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response("", { headers: { "Content-Type": "text/event-stream" } }),
);

async function sendAndReadAuthorization() {
  fetchMock.mockClear();
  await chatTransport.sendMessages({
    chatId: "chats:1",
    messages: [],
    abortSignal: undefined,
    trigger: "submit-message",
    messageId: undefined,
  });
  return new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization");
}

describe("chatTransport", () => {
  afterEach(() => {
    setChatAuthToken(null);
    vi.unstubAllGlobals();
  });

  it("sends the token current at request time, not when the transport was created", async () => {
    vi.stubGlobal("fetch", fetchMock);

    // A signed-out visitor's first request would have no token...
    await expect(sendAndReadAuthorization()).resolves.toBeNull();

    // ...and after their guest sign-in, or a token refresh, the same transport sends the new one
    setChatAuthToken("guest-token");
    await expect(sendAndReadAuthorization()).resolves.toBe("Bearer guest-token");

    setChatAuthToken("refreshed-token");
    await expect(sendAndReadAuthorization()).resolves.toBe("Bearer refreshed-token");
  });
});
