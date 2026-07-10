import { beforeEach, describe, expect, it, vi } from "vitest";
import { getComposioTools } from "../composio-server";

const {
  mockCreate,
  mockGetCachedSessionId,
  mockInvalidateUserToolsCache,
  mockSessionTools,
  mockSetCachedSessionId,
  mockUse,
} = vi.hoisted(() => {
  process.env.COMPOSIO_API_KEY ||= "test-composio-key";

  return {
    mockCreate: vi.fn(),
    mockGetCachedSessionId: vi.fn(),
    mockInvalidateUserToolsCache: vi.fn(),
    mockSessionTools: vi.fn(),
    mockSetCachedSessionId: vi.fn(),
    mockUse: vi.fn(),
  };
});

vi.mock("@composio/core", () => ({
  Composio: class MockComposio {
    create = mockCreate;
    use = mockUse;
    connectedAccounts = {
      delete: vi.fn(),
      initiate: vi.fn(),
      list: vi.fn(),
      waitForConnection: vi.fn(),
    };
  },
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: class MockVercelProvider {},
}));

vi.mock("../composio-cache", () => ({
  getCachedSessionId: mockGetCachedSessionId,
  invalidateUserToolsCache: mockInvalidateUserToolsCache,
  setCachedSessionId: mockSetCachedSessionId,
}));

describe("composio-server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedSessionId.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      sessionId: "session-123",
      tools: mockSessionTools,
    });
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
    expect(mockSetCachedSessionId).toHaveBeenCalledWith(
      "user-123",
      ["gmail", "notion"],
      "session-123",
    );
    expect(result).toBe(routerTools);
  });

  it("does not create a session without toolkits", async () => {
    const result = await getComposioTools("user-123", [" ", ""]);

    expect(result).toEqual({});
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSessionTools).not.toHaveBeenCalled();
  });
});
