import { Composio } from "@composio/core";
import type { ToolRouterCreateSessionConfig } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { ToolSet } from "ai";

/** The fields of a Composio connected account that the app reads. */
export interface ComposioConnectedAccount {
  id: string;
  status: string;
  toolkit: { slug: string };
  authConfig: { isComposioManaged: boolean };
  createdAt: string;
}

/** A Tool Router session: its meta tools, and deleting it once the agent run ends. */
export interface ComposioSession {
  tools: () => Promise<ToolSet>;
  delete: (options?: { signal?: AbortSignal }) => Promise<object>;
}

/**
 * The part of the Composio SDK client the app uses. It is the app's boundary to the SDK: the
 * real client satisfies it structurally (checked below, with no cast), and tests fake it by
 * mocking this module instead of the SDK's much larger `Composio` class. Results the app ignores
 * are typed `object`.
 */
export interface ComposioClient {
  create: (
    userId: string,
    config: ToolRouterCreateSessionConfig,
    options?: { signal?: AbortSignal }
  ) => Promise<ComposioSession>;
  connectedAccounts: {
    list: (query: { userIds: string[]; cursor?: string }) => Promise<{
      items: ComposioConnectedAccount[];
      nextCursor?: string | null;
    }>;
    link: (
      userId: string,
      authConfigId: string,
      options?: { allowMultiple?: boolean; callbackUrl?: string }
    ) => Promise<{ id: string; redirectUrl?: string | null }>;
    waitForConnection: (
      connectedAccountId: string,
      timeoutMs?: number
    ) => Promise<{ id: string; status: string }>;
    delete: (connectedAccountId: string) => Promise<object>;
    revoke: (connectedAccountId: string) => Promise<object>;
  };
}

// Server-side Composio client initialization (following official example)
const apiKey = process.env.COMPOSIO_API_KEY;
if (apiKey === undefined || apiKey === "") {
  throw new Error("COMPOSIO_API_KEY environment variable is not set");
}

export const composio: ComposioClient = new Composio({
  apiKey,
  provider: new VercelProvider(),
  allowTracking: false,
});
