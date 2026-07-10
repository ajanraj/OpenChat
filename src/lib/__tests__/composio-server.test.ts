import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRouterCreateSessionConfig } from "@composio/core";
import { getComposioTools } from "../composio-server";

interface MockTool {
  description: string;
}

interface MockSession {
  sessionId: string;
  tools: () => Promise<Record<string, MockTool>>;
  delete: () => Promise<{ sessionId: string; deleted: boolean }>;
}

const { mockCreate, mockSessionDelete, mockSessionTools } = vi.hoisted(() => {
  process.env.COMPOSIO_API_KEY ||= "test-composio-key";

  return {
    mockCreate:
      vi.fn<(userId: string, config: ToolRouterCreateSessionConfig) => Promise<MockSession>>(),
    mockSessionDelete: vi.fn<() => Promise<{ sessionId: string; deleted: boolean }>>(),
    mockSessionTools: vi.fn<() => Promise<Record<string, MockTool>>>(),
  };
});

vi.mock("@composio/core", () => ({
  Composio: class MockComposio {
    create = mockCreate;
    connectedAccounts = {
      delete: vi.fn<(connectionId: string) => Promise<void>>(),
      initiate:
        vi.fn<
          (
            userId: string,
            authConfigId: string,
            options?: { callbackUrl: string },
          ) => Promise<{ id: string; redirectUrl: string }>
        >(),
      list: vi.fn<(options: { userIds: string[] }) => Promise<{ items: never[] }>>(),
      waitForConnection:
        vi.fn<
          (
            connectionRequestId: string,
            timeoutMs: number,
          ) => Promise<{ id: string; status: string }>
        >(),
    };
  },
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: class MockVercelProvider {},
}));

describe("composio-server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      sessionId: "session-123",
      tools: mockSessionTools,
      delete: mockSessionDelete,
    });
    mockSessionDelete.mockResolvedValue({ sessionId: "session-123", deleted: true });
  });

  it("creates a scoped router session and returns its meta tools unchanged", async () => {
    const routerTools = {
      COMPOSIO_MULTI_EXECUTE_TOOL: { description: "Execute tools" },
      COMPOSIO_SEARCH_TOOLS: { description: "Search tools" },
    };
    mockSessionTools.mockResolvedValue(routerTools);

    const result = await getComposioTools("user-123", [" GMAIL ", "gmail", "NOTION", " "]);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith("user-123", {
      toolkits: ["gmail", "notion"],
      manageConnections: false,
      sandbox: { enable: false },
    });
    expect(result?.tools).toBe(routerTools);

    await result?.close();

    expect(mockSessionDelete).toHaveBeenCalledOnce();
  });

  it("creates a fresh router session for each agent run", async () => {
    mockSessionTools.mockResolvedValue({
      COMPOSIO_MULTI_EXECUTE_TOOL: { description: "Execute tools" },
    });

    await getComposioTools("user-123", ["GMAIL"]);
    await getComposioTools("user-123", ["GMAIL"]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("deletes the session when loading tools fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockSessionTools.mockRejectedValue(new Error("Tool loading failed"));

    const result = await getComposioTools("user-123", ["GMAIL"]);

    expect(result).toBeNull();
    expect(mockSessionDelete).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("does not reject when session deletion fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockSessionTools.mockResolvedValue({
      COMPOSIO_MULTI_EXECUTE_TOOL: { description: "Execute tools" },
    });
    mockSessionDelete.mockRejectedValue(new Error("Delete failed"));

    const result = await getComposioTools("user-123", ["GMAIL"]);

    await expect(result?.close()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to delete Composio session:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("does not create a session without toolkits", async () => {
    const result = await getComposioTools("user-123", [" ", ""]);

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSessionTools).not.toHaveBeenCalled();
  });
});
