import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRouterCreateSessionConfig } from "@composio/core";
import {
  disconnectAccount,
  getComposioTools,
  initiateConnection,
  waitForConnection,
} from "../composio-server";

interface MockTool {
  description: string;
}

interface MockSession {
  sessionId: string;
  tools: () => Promise<Record<string, MockTool>>;
  delete: () => Promise<{ sessionId: string; deleted: boolean }>;
}

interface MockAccount {
  id: string;
  status: string;
  toolkit: { slug: string };
  createdAt: string;
}

interface MockListPage {
  items: MockAccount[];
  nextCursor?: string | null;
}

const {
  mockCreate,
  mockSessionDelete,
  mockSessionTools,
  mockAccountDelete,
  mockLink,
  mockList,
  mockWaitForConnection,
} = vi.hoisted(() => {
  process.env.COMPOSIO_API_KEY ||= "test-composio-key";

  return {
    mockCreate:
      vi.fn<(userId: string, config: ToolRouterCreateSessionConfig) => Promise<MockSession>>(),
    mockSessionDelete: vi.fn<() => Promise<{ sessionId: string; deleted: boolean }>>(),
    mockSessionTools: vi.fn<() => Promise<Record<string, MockTool>>>(),
    mockAccountDelete: vi.fn<(connectionId: string) => Promise<void>>(),
    mockLink:
      vi.fn<
        (
          userId: string,
          authConfigId: string,
          options?: { allowMultiple?: boolean; callbackUrl?: string },
        ) => Promise<{ id: string; redirectUrl: string }>
      >(),
    mockList: vi.fn<(options: { userIds: string[]; cursor?: string }) => Promise<MockListPage>>(),
    mockWaitForConnection:
      vi.fn<
        (connectionRequestId: string, timeoutMs: number) => Promise<{ id: string; status: string }>
      >(),
  };
});

vi.mock("@composio/core", () => ({
  Composio: class MockComposio {
    create = mockCreate;
    connectedAccounts = {
      delete: mockAccountDelete,
      link: mockLink,
      list: mockList,
      waitForConnection: mockWaitForConnection,
    };
  },
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: class MockVercelProvider {},
}));

const account = (
  id: string,
  slug: string,
  status = "ACTIVE",
  createdAt = "2026-10-01T00:00:00.000Z",
): MockAccount => ({
  id,
  status,
  toolkit: { slug },
  createdAt,
});

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

  describe("connected account ownership", () => {
    it("disconnects every account the user has for the toolkit, across pages", async () => {
      mockList
        .mockResolvedValueOnce({
          items: [account("ca_gmail_1", "gmail"), account("ca_notion", "notion")],
          nextCursor: "page-2",
        })
        .mockResolvedValueOnce({
          items: [account("ca_gmail_2", "GMAIL", "INITIATED")],
          nextCursor: null,
        });

      await disconnectAccount("user-123", "gmail");

      expect(mockList).toHaveBeenNthCalledWith(1, { userIds: ["user-123"], cursor: undefined });
      expect(mockList).toHaveBeenNthCalledWith(2, { userIds: ["user-123"], cursor: "page-2" });
      expect(mockAccountDelete.mock.calls.map(([id]) => id)).toEqual(["ca_gmail_1", "ca_gmail_2"]);
    });

    it("deletes nothing when the user has no account for the toolkit", async () => {
      mockList.mockResolvedValue({ items: [account("ca_notion", "notion")] });

      await disconnectAccount("user-123", "gmail");

      expect(mockAccountDelete).not.toHaveBeenCalled();
    });

    it("disconnects every toolkit when none is given (account deletion)", async () => {
      mockList.mockResolvedValue({
        items: [account("ca_gmail", "gmail"), account("ca_notion", "notion")],
      });

      await disconnectAccount("user-123");

      expect(mockList).toHaveBeenCalledWith({ userIds: ["user-123"], cursor: undefined });
      expect(mockAccountDelete.mock.calls.map(([id]) => id)).toEqual(["ca_gmail", "ca_notion"]);
    });

    it("refuses to wait on a connection request the user does not own", async () => {
      mockList.mockResolvedValue({ items: [account("ca_mine", "gmail", "INITIATED")] });

      const result = await waitForConnection("user-123", "ca_someone_else", 60);

      expect(result).toBeNull();
      expect(mockWaitForConnection).not.toHaveBeenCalled();
    });

    it("waits on the user's own connection request", async () => {
      mockList.mockResolvedValue({ items: [account("ca_mine", "gmail", "INITIATED")] });
      mockWaitForConnection.mockResolvedValue({ id: "ca_mine", status: "ACTIVE" });

      const result = await waitForConnection("user-123", "ca_mine", 60);

      expect(mockWaitForConnection).toHaveBeenCalledWith("ca_mine", 60_000);
      expect(result).toEqual({ connectionId: "ca_mine", isConnected: true });
    });

    it("cleans up only the user's non-active attempts for the toolkit before connecting", async () => {
      mockList.mockResolvedValue({
        items: [
          account("ca_active", "gmail"),
          account("ca_stale", "gmail", "INITIATED"),
          account("ca_other_toolkit", "notion", "FAILED"),
        ],
      });
      mockLink.mockResolvedValue({ id: "ca_new", redirectUrl: "https://example.com/oauth" });

      const result = await initiateConnection("user-123", "gmail", "https://app/callback");

      expect(mockAccountDelete.mock.calls.map(([id]) => id)).toEqual(["ca_stale"]);
      // A still-active account must not make link throw
      expect(mockLink).toHaveBeenCalledWith("user-123", expect.any(String), {
        allowMultiple: true,
        callbackUrl: "https://app/callback",
      });
      expect(result).toEqual({
        redirectUrl: "https://example.com/oauth",
        connectionRequestId: "ca_new",
      });
    });

    it("replaces the user's older accounts for the toolkit once the new one is active", async () => {
      mockList.mockResolvedValue({
        items: [
          account("ca_old", "gmail", "ACTIVE", "2026-10-01T00:00:00.000Z"),
          account("ca_new", "GMAIL", "INITIATED", "2026-10-02T00:00:00.000Z"),
          account("ca_notion", "notion", "ACTIVE", "2026-09-01T00:00:00.000Z"),
        ],
      });
      mockWaitForConnection.mockResolvedValue({ id: "ca_new", status: "ACTIVE" });

      await waitForConnection("user-123", "ca_new", 60);

      expect(mockAccountDelete.mock.calls.map(([id]) => id)).toEqual(["ca_old"]);
    });

    it("completing an older request leaves newer and same-time accounts alone", async () => {
      mockList.mockResolvedValue({
        items: [
          account("ca_oldest", "gmail", "ACTIVE", "2026-10-01T00:00:00.000Z"),
          account("ca_late", "gmail", "INITIATED", "2026-10-02T00:00:00.000Z"),
          account("ca_tie", "gmail", "ACTIVE", "2026-10-02T00:00:00.000Z"),
          account("ca_newer", "gmail", "ACTIVE", "2026-10-03T00:00:00.000Z"),
        ],
      });
      mockWaitForConnection.mockResolvedValue({ id: "ca_late", status: "ACTIVE" });

      const result = await waitForConnection("user-123", "ca_late", 60);

      expect(result).toEqual({ connectionId: "ca_late", isConnected: true });
      expect(mockAccountDelete.mock.calls.map(([id]) => id)).toEqual(["ca_oldest"]);
    });

    it("keeps the older accounts when the new connection did not become active", async () => {
      mockList.mockResolvedValue({
        items: [
          account("ca_old", "gmail", "ACTIVE", "2026-10-01T00:00:00.000Z"),
          account("ca_new", "gmail", "INITIATED", "2026-10-02T00:00:00.000Z"),
        ],
      });
      mockWaitForConnection.mockResolvedValue({ id: "ca_new", status: "FAILED" });

      const result = await waitForConnection("user-123", "ca_new", 60);

      expect(result).toEqual({ connectionId: "ca_new", isConnected: false });
      expect(mockAccountDelete).not.toHaveBeenCalled();
    });
  });
});
