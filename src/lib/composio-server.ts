import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { ToolSet } from "ai";
import type { ToolRouterCreateSessionConfig } from "@composio/core";
import { getCachedSessionId, invalidateUserToolsCache, setCachedSessionId } from "./composio-cache";
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

const createComposioSession = async (userId: string, toolkitSlugs: string[]) => {
  const session = await composio.create(userId, createSessionConfig(toolkitSlugs));
  await setCachedSessionId(userId, toolkitSlugs, session.sessionId);
  return session;
};

const getComposioSession = async (userId: string, toolkitSlugs: string[]) => {
  const cachedSessionId = await getCachedSessionId(userId, toolkitSlugs);

  if (!cachedSessionId) {
    return await createComposioSession(userId, toolkitSlugs);
  }

  try {
    return await composio.use(cachedSessionId);
  } catch (error) {
    console.error("Failed to reuse cached Composio session; creating a fresh session:", error);
    return await createComposioSession(userId, toolkitSlugs);
  }
};

/**
 * Initiate OAuth connection for a user (server-side only)
 */
export const initiateConnection = async (
  userId: string,
  connectorType: ConnectorType,
  callbackUrl?: string,
): Promise<{ redirectUrl: string; connectionRequestId: string }> => {
  const authConfigId = getAuthConfigId(connectorType);

  // First, check if user has existing connections for this toolkit and clean them up
  try {
    const existingAccounts = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Find any existing connection for this toolkit
    const toolkitSlug = connectorType.toUpperCase();
    const existingConnection = existingAccounts.items.find(
      (account) => account.toolkit.slug.toUpperCase() === toolkitSlug,
    );

    if (existingConnection && existingConnection.status !== "ACTIVE") {
      // Only delete if connection is not active to avoid breaking working connections
      await composio.connectedAccounts.delete(existingConnection.id);
    }
  } catch (error) {
    console.error("Failed to cleanup existing Composio connection:", error);
  }

  const connectionRequest = await composio.connectedAccounts.initiate(
    userId,
    authConfigId,
    callbackUrl ? { callbackUrl } : undefined,
  );

  return {
    redirectUrl: connectionRequest.redirectUrl || "",
    connectionRequestId: connectionRequest.id,
  };
};

/**
 * Wait for connection to complete (for polling)
 */
export const waitForConnection = async (
  connectionRequestId: string,
  timeoutSeconds = 300,
  userId?: string,
): Promise<{ connectionId: string; isConnected: boolean }> => {
  const connectedAccount = await composio.connectedAccounts.waitForConnection(
    connectionRequestId,
    timeoutSeconds * 1000, // Convert seconds to milliseconds
  );

  const isConnected = connectedAccount.status === "ACTIVE";

  // If connection is successful and we have userId, refresh caches
  if (isConnected && userId) {
    await refreshCache(userId);
  }

  return {
    connectionId: connectedAccount.id,
    isConnected,
  };
};

/**
 * Disconnect an account (server-side only)
 */
export const disconnectAccount = async (connectionId: string, userId: string): Promise<void> => {
  await composio.connectedAccounts.delete(connectionId);

  // Refresh caches since connected accounts have changed
  await refreshCache(userId);
};

/**
 * Get Composio tools for enabled toolkits (for chat integration)
 */
export const getComposioTools = async (
  userId: string,
  toolkitSlugs: string[],
): Promise<ToolSet> => {
  const normalizedToolkits = normalizeToolkitSlugs(toolkitSlugs);

  if (!normalizedToolkits.length) {
    return {};
  }

  try {
    const session = await getComposioSession(userId, normalizedToolkits);
    return await session.tools();
  } catch (error) {
    console.error("Failed to fetch Composio session tools:", error);
    return {};
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

/**
 * Refresh tools cache for a user
 * Called after connect/disconnect to ensure fresh tools
 */
export const refreshCache = async (userId: string): Promise<void> => {
  try {
    // Invalidate tools cache first
    await invalidateUserToolsCache(userId);

    // Get fresh connected accounts from Composio to pre-warm cache
    const connectedAccounts = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Get active toolkits for cache pre-warming
    const activeToolkits = connectedAccounts.items
      .filter((account) => account.status === "ACTIVE")
      .map((account) => account.toolkit.slug);

    // Pre-warm tools cache if there are active tools
    if (activeToolkits.length > 0) {
      await getComposioTools(userId, activeToolkits);
    }
  } catch {
    // Silently handle error - cache refresh is optional
  }
};

export default composio;
