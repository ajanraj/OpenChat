import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { ToolSet } from "ai";
import type {
  ConnectedAccountListResponseItem,
  ToolRouterCreateSessionConfig,
} from "@composio/core";
import { getAuthConfigId } from "./composio-utils";
import type { ConnectorType } from "./types";

// Server-side Composio client initialization (following official example)
const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  throw new Error("COMPOSIO_API_KEY environment variable is not set");
}

const composio = new Composio({
  apiKey,
  provider: new VercelProvider(),
  allowTracking: false,
});

const normalizeToolkitSlugs = (toolkitSlugs: string[]): string[] =>
  Array.from(
    new Set(
      toolkitSlugs.map((slug) => slug.trim().toLowerCase()).filter((slug) => slug.length > 0),
    ),
  );

const createSessionConfig = (toolkitSlugs: string[]): ToolRouterCreateSessionConfig => ({
  toolkits: toolkitSlugs,
  manageConnections: false,
  sandbox: { enable: false },
});

export interface ComposioToolsSession {
  tools: ToolSet;
  close: () => Promise<void>;
}

/**
 * List every Composio connected account owned by a user, optionally limited to one toolkit.
 * The Composio user id is always the Convex `user._id`, so this is the source of truth for
 * ownership: never act on a client-supplied or stored connected account id without it.
 */
const listUserConnectedAccounts = async (
  userId: string,
  connectorType?: ConnectorType,
): Promise<ConnectedAccountListResponseItem[]> => {
  const accounts: ConnectedAccountListResponseItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await composio.connectedAccounts.list({ userIds: [userId], cursor });
    accounts.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  // Toolkit slugs are matched case-insensitively (Composio has used both cases).
  return connectorType
    ? accounts.filter((account) => account.toolkit.slug.toLowerCase() === connectorType)
    : accounts;
};

/**
 * Initiate OAuth connection for a user through a Composio Connect Link (server-side only).
 * The returned request id is the new connected account's id, used to poll waitForConnection.
 */
export const initiateConnection = async (
  userId: string,
  connectorType: ConnectorType,
  callbackUrl?: string,
): Promise<{ redirectUrl: string; connectionRequestId: string }> => {
  const authConfigId = getAuthConfigId(connectorType);

  // Clean up the user's abandoned (non-active) attempts for this toolkit; keep working ones.
  try {
    const existingAccounts = await listUserConnectedAccounts(userId, connectorType);
    await Promise.all(
      existingAccounts
        .filter((account) => account.status !== "ACTIVE")
        .map((account) => composio.connectedAccounts.delete(account.id)),
    );
  } catch (error) {
    console.error("Failed to cleanup existing Composio connection:", error);
  }

  // link() replaces initiate(), which Composio retired for managed OAuth configs on 2026-07-03.
  // allowMultiple: a still-active account (e.g. one whose Convex row was lost) would otherwise
  // make link throw. waitForConnection removes the replaced accounts once this one is active.
  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
    allowMultiple: true,
    ...(callbackUrl ? { callbackUrl } : {}),
  });

  return {
    redirectUrl: connectionRequest.redirectUrl || "",
    connectionRequestId: connectionRequest.id,
  };
};

/**
 * Wait for one of the user's connection requests to complete (for polling).
 * Returns null when the request id does not belong to the user, so callers can
 * never observe another user's connection. Once the new connection is active, the
 * user's accounts for the same toolkit created before it are deleted (it replaces them);
 * newer ones are kept, so a late or concurrent completion never removes a newer connection.
 */
export const waitForConnection = async (
  userId: string,
  connectionRequestId: string,
  timeoutSeconds = 300,
): Promise<{ connectionId: string; isConnected: boolean } | null> => {
  const userAccounts = await listUserConnectedAccounts(userId);
  const request = userAccounts.find((account) => account.id === connectionRequestId);
  if (!request) {
    return null;
  }

  const connectedAccount = await composio.connectedAccounts.waitForConnection(
    connectionRequestId,
    timeoutSeconds * 1000, // Convert seconds to milliseconds
  );

  const isConnected = connectedAccount.status === "ACTIVE";
  if (isConnected) {
    const toolkit = request.toolkit.slug.toLowerCase();
    const requestCreatedAt = Date.parse(request.createdAt);
    // Strictly older only: the request itself, same-time ties, and unparseable timestamps
    // (NaN) all compare false and are kept.
    const replaced = userAccounts.filter(
      (account) =>
        account.toolkit.slug.toLowerCase() === toolkit &&
        Date.parse(account.createdAt) < requestCreatedAt,
    );
    try {
      await Promise.all(replaced.map((account) => composio.connectedAccounts.delete(account.id)));
    } catch (error) {
      console.error("Failed to remove replaced Composio connections:", error);
    }
  }

  return {
    connectionId: connectedAccount.id,
    isConnected,
  };
};

/**
 * Disconnect a toolkit for a user (server-side only) by deleting every connected
 * account Composio holds for that user and toolkit. Omit the toolkit to delete all of
 * the user's accounts (account deletion).
 */
export const disconnectAccount = async (
  userId: string,
  connectorType?: ConnectorType,
): Promise<void> => {
  const accounts = await listUserConnectedAccounts(userId, connectorType);
  await Promise.all(accounts.map((account) => composio.connectedAccounts.delete(account.id)));
};

// Deleting a session is best-effort cleanup, so it never holds up the caller for longer than this
const SESSION_DELETE_TIMEOUT_MS = 5_000;

/**
 * Settles like `promise`, but rejects with the abort reason as soon as `signal` aborts. For SDK
 * calls whose typings take no signal: the request keeps running, it just stops being waited on.
 */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    // Attached first, so `promise` rejecting after an abort is still handled
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
};

/**
 * Get Composio tools for enabled toolkits (for chat integration). Once `signal` aborts, creating
 * the session is cancelled and loading its tools stops being waited on (executing a tool takes no
 * signal). Returns null when the tools can't be loaded.
 */
export const getComposioTools = async (
  userId: string,
  toolkitSlugs: string[],
  signal?: AbortSignal,
): Promise<ComposioToolsSession | null> => {
  const normalizedToolkits = normalizeToolkitSlugs(toolkitSlugs);

  if (!normalizedToolkits.length) {
    return null;
  }

  try {
    // Tool Router sessions retain task memory, so each agent run needs a fresh session.
    const session = await composio.create(userId, createSessionConfig(normalizedToolkits), {
      signal,
    });
    const close = async (): Promise<void> => {
      try {
        await session.delete({ signal: AbortSignal.timeout(SESSION_DELETE_TIMEOUT_MS) });
      } catch (error) {
        console.error("Failed to delete Composio session:", error);
      }
    };

    try {
      return {
        tools: await untilAborted(session.tools(), signal),
        close,
      };
    } catch (error) {
      await close();
      throw error;
    }
  } catch (error) {
    console.error("Failed to fetch Composio session tools:", error);
    return null;
  }
};

/**
 * Validate environment setup (server-side only)
 */
export const validateEnvironment = (): {
  isValid: boolean;
  message?: string;
} => {
  if (!process.env.COMPOSIO_API_KEY) {
    return {
      isValid: false,
      message: "COMPOSIO_API_KEY environment variable is not set",
    };
  }

  return { isValid: true };
};

export default composio;
