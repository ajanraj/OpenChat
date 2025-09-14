"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { ConnectorCard } from "./ConnectorCard";

type ConnectorData = {
  _id?: Id<"connectors">;
  type: ConnectorType;
  isConnected: boolean;
  enabled?: boolean;
  displayName?: string;
  connectionId?: string;
};

type ConnectorGridProps = {
  connectors: ConnectorData[];
  onConnect: (type: ConnectorType) => void;
  onDisconnect: (type: ConnectorType) => Promise<void>;
  onToggleEnabled: (type: ConnectorType, enabled: boolean) => Promise<void>;
  connectingStates: Record<ConnectorType, boolean>;
};

export function ConnectorGrid({
  connectors,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  connectingStates,
}: ConnectorGridProps) {
  // Create a map of existing connectors for quick lookup
  const connectorMap = new Map(
    connectors.map((connector) => [connector.type, connector])
  );

  // Build complete list with defaults for missing connectors
  const allConnectors: ConnectorData[] = SUPPORTED_CONNECTORS.map(
    (type: ConnectorType) => {
      const existing = connectorMap.get(type);
      return (
        existing ?? {
          type,
          isConnected: false,
        }
      );
    }
  );

  return (
    <section aria-labelledby="connectors-heading">
      <h2 className="sr-only" id="connectors-heading">
        Available Connectors
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {allConnectors.map((connector) => (
          <ConnectorCard
            connector={connector}
            isConnecting={connectingStates[connector.type]}
            key={connector.type}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onToggleEnabled={onToggleEnabled}
          />
        ))}
      </div>
    </section>
  );
}
