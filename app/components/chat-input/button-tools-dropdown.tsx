"use client";

import { FadersHorizontal, Globe } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConnectorIcon } from "@/app/components/common/connector-icon";
import { useUser } from "@/app/providers/user-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MODELS_OPTIONS } from "@/lib/config";
import { CONNECTOR_CONFIGS, SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { classifyError } from "@/lib/error-utils";
import type { ConnectorType } from "@/lib/types";
import { PopoverContentAuth } from "./popover-content-auth";

type ButtonToolsDropdownProps = {
  isUserAuthenticated: boolean;
  selectedModel: string;
  searchEnabled: boolean;
  onToggleSearch: () => void;
};

type ConnectorRow = {
  type: ConnectorType;
  isConnected: boolean;
  enabled: boolean; // Always defined after processing
  id?: Id<"connectors">;
};

function BaseButtonToolsDropdown({
  isUserAuthenticated,
  selectedModel,
  searchEnabled,
  onToggleSearch,
}: ButtonToolsDropdownProps) {
  const { connectors } = useUser();
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
  const [connectingType, setConnectingType] = useState<ConnectorType | null>(
    null
  );
  const [togglingType, setTogglingType] = useState<ConnectorType | null>(null);

  const isToolCallingAvailable = useMemo(
    () =>
      MODELS_OPTIONS.find((m) => m.id === selectedModel)?.features?.find(
        (f) => f.id === "tool-calling"
      )?.enabled === true,
    [selectedModel]
  );

  const rows: ConnectorRow[] = useMemo(() => {
    const byType = new Map<ConnectorType, ConnectorRow>();
    for (const type of SUPPORTED_CONNECTORS) {
      byType.set(type, {
        type,
        isConnected: false,
        enabled: false,
      });
    }
    for (const c of connectors || []) {
      byType.set(c.type as ConnectorType, {
        type: c.type as ConnectorType,
        isConnected: c.isConnected,
        enabled: c.enabled !== false,
        id: c._id as Id<"connectors">,
      });
    }
    return Array.from(byType.values());
  }, [connectors]);

  const handleToggleConnector = useCallback(
    async (type: ConnectorType, enabled: boolean) => {
      if (togglingType === type) {
        return; // Race condition protection
      }

      setTogglingType(type);
      try {
        await setConnectorEnabled({ type, enabled });
      } catch (error: unknown) {
        const classified = classifyError(error);
        toast.error(classified.userFriendlyMessage);
      } finally {
        setTogglingType(null);
      }
    },
    [setConnectorEnabled, togglingType]
  );

  const handleConnect = useCallback(async (type: ConnectorType) => {
    try {
      setConnectingType(type);
      const response = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorType: type }),
      });
      if (!response.ok) {
        setConnectingType(null);
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
        setConnectingType(null);
        return;
      }

      sessionStorage.setItem(
        `composio_connection_${type}`,
        connectionRequestId
      );
      window.location.href = redirectUrl;
    } catch {
      setConnectingType(null);
    }
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  // Auth gating: mirror existing pattern from ButtonSearch
  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Tools"
                className="size-9 rounded-full"
                size="sm"
                type="button"
                variant="outline"
              >
                <FadersHorizontal className="size-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Tools & search</TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    );
  }

  return (
    <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
      <Tooltip open={menuOpen ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Tools"
              className="size-9 rounded-full"
              size="sm"
              type="button"
              variant="outline"
            >
              <FadersHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Tools & search</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="min-w-[18rem] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="top"
      >
        <div className="px-1.5 py-2">
          {rows.map((row) => {
            const cfg = CONNECTOR_CONFIGS[row.type];
            return (
              <DropdownMenuItem
                className="cursor-pointer px-3 py-1.5"
                key={row.type}
                onSelect={(e) => {
                  e.preventDefault();
                  if (row.isConnected) {
                    handleToggleConnector(row.type, !row.enabled);
                  } else {
                    handleConnect(row.type);
                  }
                }}
              >
                <div className="flex w-full cursor-pointer items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ConnectorIcon className="size-3.5" connector={cfg} />
                    <span>{cfg.displayName}</span>
                  </div>
                  {row.isConnected ? (
                    <Switch
                      aria-label={`Enable ${cfg.displayName}`}
                      checked={row.enabled}
                      className="pointer-events-none"
                      disabled={togglingType === row.type}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {connectingType === row.type ? "Connecting…" : "Connect"}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
        <div className="mx-2 my-1 border-border border-t" />
        <DropdownMenuItem
          className="m-1.5 rounded-sm px-3 py-2"
          onSelect={(e) => {
            e.preventDefault();
            if (!isToolCallingAvailable) {
              return;
            }
            onToggleSearch();
            setMenuOpen(false);
          }}
        >
          <div className="flex w-full cursor-pointer items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="size-4" />
              <span>Search</span>
            </div>
            <Switch
              aria-label="Toggle web search"
              checked={searchEnabled}
              className="pointer-events-none"
              disabled={!isToolCallingAvailable}
            />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ButtonToolsDropdown = memo(BaseButtonToolsDropdown);
