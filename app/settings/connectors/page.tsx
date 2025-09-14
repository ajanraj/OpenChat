"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/app/providers/user-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { getConnectorConfig, SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { ConnectorGrid } from "./components/ConnectorGrid";

type SimpleConnectionState = {
  status: "idle" | "connecting";
};

export default function ConnectorsPage() {
  const { user, connectors, isConnectorsLoading } = useUser();
  const setConnectorEnabled = useMutation(
    api.connectors.setConnectorEnabled
  ).withOptimisticUpdate((localStore, { type, enabled }) => {
    const currentConnectors = localStore.getQuery(
      api.connectors.listUserConnectors
    );
    if (currentConnectors) {
      const updatedConnectors = currentConnectors.map((connector) =>
        connector.type === type ? { ...connector, enabled } : connector
      );
      localStore.setQuery(
        api.connectors.listUserConnectors,
        {},
        updatedConnectors
      );
    }
  });
  const [connectionStates, setConnectionStates] = useState<
    Record<ConnectorType, SimpleConnectionState>
  >(() => {
    const initialStates: Record<ConnectorType, SimpleConnectionState> =
      {} as Record<ConnectorType, SimpleConnectionState>;
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

      setConnectionStates((prev) => ({
        ...prev,
        [type]: { status: "connecting" },
      }));

      try {
        const response = await fetch("/api/composio/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectorType: type }),
        });

        if (!response.ok) {
          const error = await response.json();
          toast.error(
            error.error ||
              `Failed to connect to ${getConnectorConfig(type).displayName}`
          );
          setConnectionStates((prev) => ({
            ...prev,
            [type]: { status: "idle" },
          }));
          return;
        }

        const { redirectUrl, connectionRequestId } = await response.json();

        // Validate URL is HTTPS
        try {
          const url = new URL(redirectUrl);
          if (url.protocol !== "https:") {
            throw new Error("Invalid URL protocol");
          }
        } catch {
          toast.error("Invalid redirect URL");
          setConnectionStates((prev) => ({
            ...prev,
            [type]: { status: "idle" },
          }));
          return;
        }

        // Store connectionRequestId in sessionStorage for the callback page
        sessionStorage.setItem(
          `composio_connection_${type}`,
          connectionRequestId
        );

        // Simple same-tab redirect to OAuth provider (no extra params!)
        window.location.href = redirectUrl;
      } catch (_error) {
        toast.error(
          `Failed to connect to ${getConnectorConfig(type).displayName}`
        );
        setConnectionStates((prev) => ({
          ...prev,
          [type]: { status: "idle" },
        }));
      }
    },
    [user]
  );

  const handleDisconnect = useCallback(
    async (type: ConnectorType) => {
      if (!user) {
        toast.error("Please log in to disconnect accounts");
        return;
      }

      try {
        const response = await fetch("/api/composio/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectorType: type }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to disconnect");
        }

        toast.success(
          `${getConnectorConfig(type).displayName} disconnected successfully`
        );
      } catch {
        toast.error(
          `Failed to disconnect ${getConnectorConfig(type).displayName}`
        );
      }
    },
    [user]
  );

  const handleToggleEnabled = useCallback(
    async (type: ConnectorType, enabled: boolean) => {
      if (!user) {
        toast.error("Please log in to update connector settings");
        return;
      }
      await setConnectorEnabled({ type, enabled });
    },
    [user, setConnectorEnabled]
  );

  const connectingStates = Object.fromEntries(
    Object.entries(connectionStates).map(([key, { status }]) => [
      key,
      status === "connecting",
    ])
  ) as Record<ConnectorType, boolean>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Connectors</h1>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Connect your favorite services to enhance your chat experience. Once
          connected, you can use these services directly in your conversations.
        </p>
      </div>

      {isConnectorsLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORTED_CONNECTORS.map((type) => (
              <div className="space-y-3" key={`loading-${type}`}>
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ConnectorGrid
          connectingStates={connectingStates}
          connectors={connectors}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onToggleEnabled={handleToggleEnabled}
        />
      )}
    </div>
  );
}
