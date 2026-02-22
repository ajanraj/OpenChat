import { useAuthToken } from "@convex-dev/auth/react";
import { FadersHorizontal, Globe } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConnectorIcon } from "@/components/common/connector-icon";
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
import { MODELS_OPTIONS } from "@/lib/config";
import { CONNECTOR_CONFIGS, SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { classifyError } from "@/lib/error-utils";
import type { ConnectorType } from "@/lib/types";
import { useUser } from "@/providers/user-provider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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

type ConnectorRedirectPayload = {
	redirectUrl: string;
	connectionRequestId: string;
};

const isConnectorRedirectPayload = (
	value: unknown,
): value is ConnectorRedirectPayload => {
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

const requestConnectorRedirect = async (
	type: ConnectorType,
	authToken: string | null,
): Promise<ConnectorRedirectPayload | null> => {
	const response = await fetch("/api/composio/connect", {
		method: "POST",
		headers: getAuthHeaders(authToken),
		body: JSON.stringify({ connectorType: type }),
	}).catch(() => null);

	if (!response || !response.ok) {
		return null;
	}

	const payload: unknown = await response.json();
	if (!isConnectorRedirectPayload(payload)) {
		return null;
	}

	if (!isValidHttpsRedirectUrl(payload.redirectUrl)) {
		return null;
	}

	return payload;
};

function BaseButtonToolsDropdown({
	isUserAuthenticated,
	selectedModel,
	searchEnabled,
	onToggleSearch,
}: ButtonToolsDropdownProps) {
	const authToken = useAuthToken();
	const { connectors } = useUser();
	const setConnectorEnabled = useMutation(
		api.connectors.setConnectorEnabled,
	).withOptimisticUpdate((localStore, { type, enabled }) => {
		const currentConnectors = localStore.getQuery(
			api.connectors.listUserConnectors,
		);
		if (currentConnectors) {
			const updatedConnectors = currentConnectors.map((connector) =>
				connector.type === type ? { ...connector, enabled } : connector,
			);
			localStore.setQuery(
				api.connectors.listUserConnectors,
				{},
				updatedConnectors,
			);
		}
	});
	const [connectingType, setConnectingType] = useState<ConnectorType | null>(
		null,
	);
	const [togglingType, setTogglingType] = useState<ConnectorType | null>(null);

	const isToolCallingAvailable = useMemo(
		() =>
			MODELS_OPTIONS.find((m) => m.id === selectedModel)?.features?.find(
				(f) => f.id === "tool-calling",
			)?.enabled === true,
		[selectedModel],
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
			await setConnectorEnabled({ type, enabled })
				.catch((error: unknown) => {
					const classified = classifyError(error);
					toast.error(classified.userFriendlyMessage);
				})
				.finally(() => {
					setTogglingType(null);
				});
		},
		[setConnectorEnabled, togglingType],
	);

	const handleConnect = useCallback(
		async (type: ConnectorType) => {
			setConnectingType(type);
			const payload = await requestConnectorRedirect(type, authToken);
			if (!payload) {
				setConnectingType(null);
				return;
			}

			sessionStorage.setItem(
				`composio_connection_${type}`,
				payload.connectionRequestId,
			);
			window.location.href = payload.redirectUrl;
		},
		[authToken],
	);

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
			<Tooltip {...(menuOpen ? { open: false } : {})}>
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
