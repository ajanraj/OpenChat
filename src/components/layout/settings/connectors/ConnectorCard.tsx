import { Check, LinkSimple, Spinner } from "@phosphor-icons/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";
import { ConnectorIcon } from "@/components/common/connector-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getConnectorConfig } from "@/lib/config/tools";
import { ERROR_CODES } from "@/lib/error-codes";
import { cn } from "@/lib/utils";
import type { ConnectorType } from "@/lib/types";
import type { Id } from "../../../../../convex/_generated/dataModel";

type ConnectorData = {
	_id?: Id<"connectors">;
	type: ConnectorType;
	isConnected: boolean;
	enabled?: boolean;
	displayName?: string;
	connectionId?: string;
};

type ConnectorCardProps = {
	connector: ConnectorData;
	onConnectAction: (type: ConnectorType) => void;
	onDisconnectAction: (type: ConnectorType) => Promise<void>;
	onToggleEnabledAction: (
		type: ConnectorType,
		enabled: boolean,
	) => Promise<void>;
	isConnecting: boolean;
};

const getToggleErrorMessage = (
	error: unknown,
	displayName: string,
	checked: boolean,
): string => {
	if (
		error instanceof ConvexError &&
		error.data === ERROR_CODES.CONNECTOR_NOT_FOUND
	) {
		return `${displayName} connection not found. Please reconnect this service first.`;
	}
	return `Failed to ${checked ? "enable" : "disable"} ${displayName}`;
};

export function ConnectorCard({
	connector,
	onConnectAction,
	onDisconnectAction,
	onToggleEnabledAction,
	isConnecting,
}: ConnectorCardProps) {
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
	const [isToggling, setIsToggling] = useState(false);

	const handleConnect = () => {
		onConnectAction(connector.type);
	};

	const handleDisconnect = () => {
		setShowDisconnectDialog(true);
	};

	const confirmDisconnect = async () => {
		setIsDisconnecting(true);
		await onDisconnectAction(connector.type)
			.catch(() => {
				const config = getConnectorConfig(connector.type);
				toast.error(`Failed to disconnect ${config.displayName}`);
			})
			.finally(() => {
				setIsDisconnecting(false);
				setShowDisconnectDialog(false);
			});
	};

	const config = getConnectorConfig(connector.type);
	const isEnabled = connector.enabled !== false;
	const isConnected = connector.isConnected;

	const handleToggle = async (checked: boolean) => {
		if (isToggling) {
			return;
		}

		setIsToggling(true);
		await onToggleEnabledAction(connector.type, checked)
			.then(() => {
				toast.success(
					`${config.displayName} ${checked ? "enabled" : "disabled"} successfully`,
				);
			})
			.catch((error: unknown) => {
				const errorMessage = getToggleErrorMessage(
					error,
					config.displayName,
					checked,
				);
				toast.error(errorMessage);
			})
			.finally(() => {
				setIsToggling(false);
			});
	};

	return (
		<>
			<div
				className={cn(
					"group relative flex flex-col rounded-xl border bg-card p-4",
					"hover:border-border/80 hover:shadow-sm",
					isConnected && "border-primary/20 bg-primary/[0.02]",
					isConnected && isEnabled && "ring-1 ring-primary/10",
				)}
			>
				{isConnected && (
					<div className="absolute top-3 right-3">
						<Badge
							className={cn(
								"gap-1 border-0 py-0.5 text-[10px]",
								isEnabled
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: "bg-muted text-muted-foreground",
							)}
							variant="secondary"
						>
							{isEnabled ? (
								<>
									<Check className="size-2.5" weight="bold" />
									Active
								</>
							) : (
								"Paused"
							)}
						</Badge>
					</div>
				)}

				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background",
							isConnected && isEnabled && "border-primary/20",
						)}
					>
						<ConnectorIcon className="size-5" connector={config} />
					</div>

					<div className="min-w-0 flex-1 space-y-0.5 pr-14">
						<h3 className="truncate font-medium text-sm">{config.displayName}</h3>
						<p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
							{config.description}
						</p>
					</div>
				</div>

				{connector.displayName && (
					<div className="mt-3 flex items-center gap-1.5 text-muted-foreground text-xs">
						<LinkSimple className="size-3" />
						<span className="truncate">{connector.displayName}</span>
					</div>
				)}

				<div
					className={cn(
						"mt-4 flex items-center border-t pt-4",
						isConnected ? "justify-between" : "justify-end",
					)}
				>
					{isConnected && (
						<div className="flex items-center gap-2">
							<Switch
								aria-busy={isToggling || isDisconnecting}
								aria-label={`Toggle ${config.displayName}`}
								checked={isEnabled}
								disabled={isDisconnecting || isToggling}
								onCheckedChange={handleToggle}
							/>
							<span className="text-muted-foreground text-xs">
								{isToggling ? "Updating…" : isEnabled ? "Enabled" : "Disabled"}
							</span>
						</div>
					)}

					{isConnected ? (
						<Button
							className="h-7 px-2.5 text-xs"
							disabled={isDisconnecting || isToggling}
							onClick={handleDisconnect}
							size="sm"
							type="button"
							variant="ghost"
						>
							{isDisconnecting ? (
								<>
									<Spinner className="mr-1 size-3 animate-spin" />
									Disconnecting
								</>
							) : (
								"Disconnect"
							)}
						</Button>
					) : (
						<Button
							className="h-8 gap-1.5"
							disabled={isConnecting}
							onClick={handleConnect}
							size="sm"
							type="button"
						>
							{isConnecting ? (
								<>
									<Spinner className="size-3.5 animate-spin" />
									Connecting
								</>
							) : (
								<>
									<LinkSimple className="size-3.5" weight="bold" />
									Connect
								</>
							)}
						</Button>
					)}
				</div>
			</div>

			<Dialog
				onOpenChange={setShowDisconnectDialog}
				open={showDisconnectDialog}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Disconnect {config.displayName}?</DialogTitle>
						<DialogDescription>
							This will disconnect your {config.displayName} account. You can
							reconnect it at any time.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							onClick={() => setShowDisconnectDialog(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button onClick={confirmDisconnect} variant="destructive">
							Disconnect
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
