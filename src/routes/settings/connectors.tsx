import { useAuthToken } from "@convex-dev/auth/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConnectorGrid } from "@/components/layout/settings/connectors/ConnectorGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { getConnectorConfig, SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { useUser } from "@/providers/user-provider";

export const Route = createFileRoute("/settings/connectors")({
  component: ConnectorsSettingsPage,
});

interface SimpleConnectionState {
  status: "idle" | "connecting";
}

interface ConnectorCategory {
  name: string;
  description: string;
  types: ConnectorType[];
}

interface ConnectPayload {
  redirectUrl: string;
  connectionRequestId: string;
}

type ConnectResult = { ok: true; payload: ConnectPayload } | { ok: false; errorMessage: string };

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
};

const isConnectPayload = (value: unknown): value is ConnectPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "redirectUrl" in value &&
    typeof value.redirectUrl === "string" &&
    "connectionRequestId" in value &&
    typeof value.connectionRequestId === "string"
  );
};

const isValidHttpsRedirectUrl = (url: string): boolean => {
  if (typeof URL.canParse === "function" && !URL.canParse(url)) {
    return false;
  }
  return url.startsWith("https://");
};

const getAuthHeaders = (authToken: string | null) => ({
  "Content-Type": "application/json",
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

const requestConnectorConnect = async (
  type: ConnectorType,
  authToken: string | null,
): Promise<ConnectResult> => {
  const displayName = getConnectorConfig(type).displayName;
  const fallbackError = `Failed to connect to ${displayName}`;

  try {
    const response = await fetch("/api/composio/connect", {
      method: "POST",
      headers: getAuthHeaders(authToken),
      body: JSON.stringify({ connectorType: type }),
    });

    const payload: unknown = await response.json();
    if (!response.ok) {
      return { ok: false, errorMessage: getErrorMessage(payload, fallbackError) };
    }

    if (!isConnectPayload(payload)) {
      return { ok: false, errorMessage: "Invalid connector response" };
    }

    if (!isValidHttpsRedirectUrl(payload.redirectUrl)) {
      return { ok: false, errorMessage: "Invalid redirect URL" };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, errorMessage: fallbackError };
  }
};

const requestConnectorDisconnect = async (
  type: ConnectorType,
  authToken: string | null,
): Promise<string | null> => {
  const displayName = getConnectorConfig(type).displayName;
  const fallbackError = `Failed to disconnect ${displayName}`;

  try {
    const response = await fetch("/api/composio/disconnect", {
      method: "POST",
      headers: getAuthHeaders(authToken),
      body: JSON.stringify({ connectorType: type }),
    });

    if (response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    return getErrorMessage(payload, fallbackError);
  } catch {
    return fallbackError;
  }
};

const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  {
    name: "Google Workspace",
    description: "Seamlessly integrate your Google productivity suite",
    types: ["gmail", "googlecalendar", "googledrive", "googledocs", "googlesheets"],
  },
  {
    name: "Communication",
    description: "Connect your messaging and social platforms",
    types: ["slack", "twitter"],
  },
  {
    name: "Development & Productivity",
    description: "Sync with your workflow and project management tools",
    types: ["notion", "linear", "github"],
  },
];

export function ConnectorsSettingsPage() {
  const authToken = useAuthToken();
  const { user, connectors, isConnectorsLoading } = useUser();
  const setConnectorEnabled = useMutation(api.connectors.setConnectorEnabled).withOptimisticUpdate(
    (localStore, { type, enabled }) => {
      const currentConnectors = localStore.getQuery(api.connectors.listUserConnectors);
      if (currentConnectors) {
        const updatedConnectors = currentConnectors.map((connector) =>
          connector.type === type ? { ...connector, enabled } : connector,
        );
        localStore.setQuery(api.connectors.listUserConnectors, {}, updatedConnectors);
      }
    },
  );
  const [connectionStates, setConnectionStates] = useState<
    Record<ConnectorType, SimpleConnectionState>
  >(() => {
    const initialStates: Record<ConnectorType, SimpleConnectionState> = {} as Record<
      ConnectorType,
      SimpleConnectionState
    >;
    for (const type of SUPPORTED_CONNECTORS) {
      initialStates[type] = { status: "idle" };
    }
    return initialStates;
  });

  const handleConnect = useCallback(
    async (type: ConnectorType) => {
      if (!user) {
        toast.error("Please log in to connect accounts");
        return;
      }
      const displayName = getConnectorConfig(type).displayName;

      setConnectionStates((prev) => ({
        ...prev,
        [type]: { status: "connecting" },
      }));

      const result = await requestConnectorConnect(type, authToken);
      if (!result.ok) {
        console.error(`Failed to connect to ${displayName}:`, result.errorMessage);
        toast.error(result.errorMessage);
        setConnectionStates((prev) => ({
          ...prev,
          [type]: { status: "idle" },
        }));
        return;
      }

      sessionStorage.setItem(`composio_connection_${type}`, result.payload.connectionRequestId);
      window.location.href = result.payload.redirectUrl;
    },
    [authToken, user],
  );

  const handleDisconnect = useCallback(
    async (type: ConnectorType) => {
      if (!user) {
        toast.error("Please log in to disconnect accounts");
        return;
      }
      const displayName = getConnectorConfig(type).displayName;

      const errorMessage = await requestConnectorDisconnect(type, authToken);
      if (errorMessage) {
        console.error(`Failed to disconnect ${displayName}:`, errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success(`${displayName} disconnected successfully`);
    },
    [authToken, user],
  );

  const handleToggleEnabled = useCallback(
    async (type: ConnectorType, enabled: boolean) => {
      if (!user) {
        toast.error("Please log in to update connector settings");
        return;
      }
      await setConnectorEnabled({ type, enabled });
    },
    [user, setConnectorEnabled],
  );

  const connectingStates = Object.fromEntries(
    Object.entries(connectionStates).map(([key, { status }]) => [key, status === "connecting"]),
  ) as Record<ConnectorType, boolean>;

  const connectedCount = connectors.filter((c) => c.isConnected).length;
  const enabledCount = connectors.filter((c) => c.isConnected && c.enabled !== false).length;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">Connectors</h1>
          {!isConnectorsLoading && connectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
                {connectedCount} connected
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 text-xs dark:text-emerald-400">
                {enabledCount} active
              </span>
            </div>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Connect your favorite services to supercharge your conversations. Once connected, you can
          interact with these platforms directly through chat.
        </p>
      </header>

      {isConnectorsLoading ? (
        <div className="space-y-10">
          {CONNECTOR_CATEGORIES.map((category) => (
            <div className="space-y-4" key={category.name}>
              <div className="space-y-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.types.map((type) => (
                  <Skeleton className="h-36 rounded-xl" key={`loading-${type}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {CONNECTOR_CATEGORIES.map((category) => (
            <section
              aria-labelledby={`category-${category.name}`}
              className="space-y-4"
              key={category.name}
            >
              <div className="space-y-1">
                <h2
                  className="font-medium text-foreground text-sm tracking-wide"
                  id={`category-${category.name}`}
                >
                  {category.name}
                </h2>
                <p className="text-muted-foreground/80 text-xs">{category.description}</p>
              </div>
              <ConnectorGrid
                connectingStates={connectingStates}
                connectors={connectors}
                connectorTypes={category.types}
                onConnectAction={handleConnect}
                onDisconnectAction={handleDisconnect}
                onToggleEnabledAction={handleToggleEnabled}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
