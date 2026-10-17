import {
  ComposioConnectedAccountNotRevokableError,
  ComposioConnectedAccountRevocationNotSupportedError,
} from "@composio/core";
import type { ToolRouterCreateSessionConfig } from "@composio/core";
import type { ToolSet } from "ai";

import { composio } from "./composio-client";
import type { ComposioConnectedAccount } from "./composio-client";
import { getAuthConfigId } from "./composio-utils";
import type { ConnectorType } from "./types";

const normalizeToolkitSlugs = (toolkitSlugs: string[]): string[] => [
  ...new Set(
    toolkitSlugs
      .map((slug) => slug.trim().toLowerCase())
      .filter((slug) => slug.length > 0)
  ),
];

const createSessionConfig = (
  toolkitSlugs: string[]
): ToolRouterCreateSessionConfig => ({
  toolkits: toolkitSlugs,
  manageConnections: false,
  sandbox: { enable: false },
});

export interface ComposioToolsSession {
  tools: ToolSet;
  close: () => Promise<void>;
}

/** The user's connected accounts from the page at `cursor` on, fetching one page at a time. */
const listAccountsFrom = async (
  userId: string,
  cursor?: string
): Promise<ComposioConnectedAccount[]> => {
  const page = await composio.connectedAccounts.list({
    userIds: [userId],
    cursor,
  });
  const nextCursor = page.nextCursor ?? undefined;
  return nextCursor === undefined || nextCursor === ""
    ? page.items
    : [...page.items, ...(await listAccountsFrom(userId, nextCursor))];
};

/**
 * List every Composio connected account owned by a user, optionally limited to one toolkit.
 * The Composio user id is always the Convex `user._id`, so this is the source of truth for
 * ownership: never act on a client-supplied or stored connected account id without it.
 */
const listUserConnectedAccounts = async (
  userId: string,
  connectorType?: ConnectorType
): Promise<ComposioConnectedAccount[]> => {
  const accounts = await listAccountsFrom(userId);

  // Toolkit slugs are matched case-insensitively (Composio has used both cases).
  return connectorType === undefined
    ? accounts
    : accounts.filter(
        (account) => account.toolkit.slug.toLowerCase() === connectorType
      );
};

/**
 * Initiate OAuth connection for a user through a Composio Connect Link (server-side only).
 * The returned request id is the new connected account's id, used to poll waitForConnection.
 */
export const initiateConnection = async (
  userId: string,
  connectorType: ConnectorType,
  callbackUrl?: string
): Promise<{ redirectUrl: string; connectionRequestId: string }> => {
  const authConfigId = getAuthConfigId(connectorType);

  // Clean up the user's abandoned (non-active) attempts for this toolkit; keep working ones.
  try {
    const existingAccounts = await listUserConnectedAccounts(
      userId,
      connectorType
    );
    await Promise.all(
      existingAccounts
        .filter((account) => account.status !== "ACTIVE")
        .map(async (account) => {
          await composio.connectedAccounts.delete(account.id);
        })
    );
  } catch (error) {
    console.error("Failed to cleanup existing Composio connection:", error);
  }

  // link() replaces initiate(), which Composio retired for managed OAuth configs on 2026-07-03.
  // allowMultiple: a still-active account (e.g. one whose Convex row was lost) would otherwise
  // make link throw. waitForConnection removes the replaced accounts once this one is active.
  const connectionRequest = await composio.connectedAccounts.link(
    userId,
    authConfigId,
    {
      allowMultiple: true,
      ...(callbackUrl !== undefined && callbackUrl !== ""
        ? { callbackUrl }
        : {}),
    }
  );

  return {
    redirectUrl: connectionRequest.redirectUrl ?? "",
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
  timeoutSeconds = 300
): Promise<{ connectionId: string; isConnected: boolean } | null> => {
  const userAccounts = await listUserConnectedAccounts(userId);
  const request = userAccounts.find(
    (account) => account.id === connectionRequestId
  );
  if (!request) {
    return null;
  }

  const connectedAccount = await composio.connectedAccounts.waitForConnection(
    connectionRequestId,
    // Convert seconds to milliseconds
    timeoutSeconds * 1000
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
        Date.parse(account.createdAt) < requestCreatedAt
    );
    try {
      await Promise.all(
        replaced.map(async (account) => {
          await composio.connectedAccounts.delete(account.id);
        })
      );
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
 * Disconnect a toolkit for a user (server-side only) by deleting every connected account
 * Composio holds for that user and toolkit. The provider grant is not revoked: Google revokes a
 * user's whole grant to an OAuth app, which would also cut their other Google toolkits.
 */
export const disconnectAccount = async (
  userId: string,
  connectorType: ConnectorType
): Promise<void> => {
  const accounts = await listUserConnectedAccounts(userId, connectorType);
  await Promise.all(
    accounts.map(async (account) => {
      await composio.connectedAccounts.delete(account.id);
    })
  );
};

/**
 * Revoke and delete every connected account of a deleted user (server-side only). Composio's
 * delete leaves the provider grant live, so each grant is revoked first, except on
 * Composio-managed auth configs: those use Composio's shared OAuth apps, where revoking could cut
 * the same person's connections in other apps. Revoking is best effort and never blocks the
 * delete: once one Google toolkit is revoked, the grant of the others is already gone and their
 * revokes fail.
 */
export const revokeUserConnections = async (userId: string): Promise<void> => {
  const accounts = await listUserConnectedAccounts(userId);
  await Promise.all(
    accounts.map(async (account) => {
      if (!account.authConfig.isComposioManaged) {
        try {
          await composio.connectedAccounts.revoke(account.id);
        } catch (error) {
          // Expected for toolkits without programmatic revocation (e.g. API keys) and for
          // accounts that never finished authenticating
          if (
            !(
              error instanceof
              ComposioConnectedAccountRevocationNotSupportedError
            ) &&
            !(error instanceof ComposioConnectedAccountNotRevokableError)
          ) {
            console.warn(
              `Failed to revoke Composio ${account.toolkit.slug} account ${account.id} upstream; deleting it anyway:`,
              error
            );
          }
        }
      }
      await composio.connectedAccounts.delete(account.id);
    })
  );
};

/** An abort reason as an Error: Error reasons (such as the default AbortError) are kept. */
const toAbortError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error("Aborted", { cause: reason });

// Deleting a session is best-effort cleanup, so it never holds up the caller for longer than this
const SESSION_DELETE_TIMEOUT_MS = 5000;

/**
 * Settles like `promise`, but rejects with the abort reason as soon as `signal` aborts. For SDK
 * calls whose typings take no signal: the request keeps running, it just stops being waited on.
 */
const untilAborted = async <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> => {
  if (!signal) {
    return await promise;
  }
  // Aborted once the race settles, which detaches the abort listener
  const settled = new AbortController();
  const aborted = Promise.withResolvers<never>();
  const onAbort = () => {
    aborted.reject(toAbortError(signal.reason));
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, {
      once: true,
      signal: settled.signal,
    });
  }
  try {
    // The race handles both promises, so `promise` rejecting after an abort is still handled
    return await Promise.race([promise, aborted.promise]);
  } finally {
    settled.abort();
  }
};

/**
 * Get Composio tools for enabled toolkits (for chat integration). Once `signal` aborts, creating
 * the session is cancelled and loading its tools stops being waited on (executing a tool takes no
 * signal). Returns null when the tools can't be loaded.
 */
export const getComposioTools = async (
  userId: string,
  toolkitSlugs: string[],
  signal?: AbortSignal
): Promise<ComposioToolsSession | null> => {
  const normalizedToolkits = normalizeToolkitSlugs(toolkitSlugs);

  if (!normalizedToolkits.length) {
    return null;
  }

  try {
    // Tool Router sessions retain task memory, so each agent run needs a fresh session.
    const session = await composio.create(
      userId,
      createSessionConfig(normalizedToolkits),
      {
        signal,
      }
    );
    const close = async (): Promise<void> => {
      try {
        await session.delete({
          signal: AbortSignal.timeout(SESSION_DELETE_TIMEOUT_MS),
        });
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
  const key = process.env.COMPOSIO_API_KEY;
  if (key === undefined || key === "") {
    return {
      isValid: false,
      message: "COMPOSIO_API_KEY environment variable is not set",
    };
  }

  return { isValid: true };
};
