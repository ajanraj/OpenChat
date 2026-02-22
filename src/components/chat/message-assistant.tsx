import type { UIMessage as MessageType } from "@ai-sdk/react";
import {
	ArrowClockwise,
	Check,
	Copy,
	FilePdf,
	GitBranch,
} from "@phosphor-icons/react";
import type {
	DynamicToolUIPart,
	FileUIPart,
	ReasoningUIPart,
	SourceUrlUIPart,
	ToolUIPart,
} from "ai";
import type { Infer } from "convex/values";
import React, {
	lazy,
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
	MorphingDialog,
	MorphingDialogClose,
	MorphingDialogContainer,
	MorphingDialogContent,
	MorphingDialogImage,
	MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog";
import { Loader } from "@/components/prompt-kit/loader";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
} from "@/components/prompt-kit/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import {
	buildConnectorDisplayLabel,
	ConnectorToolCall,
} from "@/components/tool/connector_tool_call";
import { UnifiedSearch } from "@/components/tool/web_search";
import {
	getConnectorConfig,
	getConnectorTypeFromToolName,
	isConnectorTool,
} from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Message as MessageSchema } from "../../../convex/schema/message";
import { SourcesList } from "./sources-list";

// Error part type for rendering
type ErrorUIPart = {
	type: "error";
	error: {
		code: string;
		message: string;
		rawError?: string; // Technical error for backend (not displayed)
	};
};

// Helper type for create_agent tool boundaries
type CreateAgentBoundary = {
	boundaryId: string;
	startIndex: number;
	endIndex: number;
	task: string;
	toolkits: string[];
	result?: string;
};

// Type guard for error parts
const isErrorPart = (part: unknown): part is ErrorUIPart =>
	typeof part === "object" &&
	part !== null &&
	"type" in part &&
	part.type === "error" &&
	"error" in part &&
	typeof part.error === "object" &&
	part.error !== null &&
	"code" in part.error &&
	typeof part.error.code === "string" &&
	"message" in part.error &&
	typeof part.error.message === "string";

type ToolInvocationPart = ToolUIPart | DynamicToolUIPart;

const isToolInvocationPart = (
	part: MessageType["parts"][number],
): part is ToolInvocationPart =>
	typeof part === "object" &&
	part !== null &&
	"type" in part &&
	typeof part.type === "string" &&
	(part.type.startsWith("tool-") || part.type === "dynamic-tool");

const getToolNameFromPart = (part: ToolInvocationPart): string => {
	if (part.type === "dynamic-tool") {
		return part.toolName;
	}

	return part.type.replace("tool-", "");
};

const isCreateAgentToolPart = (
	part: MessageType["parts"][number],
): part is ToolInvocationPart =>
	isToolInvocationPart(part) && getToolNameFromPart(part) === "create_agent";

const extractCreateAgentMetadata = (
	part: ToolInvocationPart,
): { task?: string; toolkits: string[] } => {
	const metadata: { task?: string; toolkits: string[] } = { toolkits: [] };

	if ("input" in part && part.input && typeof part.input === "object") {
		const input = part.input as Record<string, unknown>;
		const maybeTask = input.task;
		if (typeof maybeTask === "string") {
			const trimmedTask = maybeTask.trim();
			if (trimmedTask.length > 0) {
				metadata.task = trimmedTask;
			}
		}

		const maybeTool = input.tool;
		if (typeof maybeTool === "string") {
			const trimmedToolkit = maybeTool.trim();
			if (trimmedToolkit.length > 0) {
				metadata.toolkits = [trimmedToolkit];
			}
		} else if (Array.isArray(maybeTool)) {
			metadata.toolkits = maybeTool
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
		}
	}

	return metadata;
};

const subscribeToTouchCapability = () => () => {};

const getIsTouchDevice = () =>
	typeof window !== "undefined" &&
	("ontouchstart" in window || navigator.maxTouchPoints > 0);

// Type guard for agent boundary data parts
type AgentBoundaryDataPart = {
	type: "data-agent-boundary";
	id: string;
	data: {
		type: "start" | "end";
		agentId: string;
		boundaryId: string;
		timestamp: string;
		task?: string;
		toolkits?: string[];
		result?: string;
	};
};

const isAgentBoundaryPart = (
	part: MessageType["parts"][number],
): part is AgentBoundaryDataPart =>
	typeof part === "object" &&
	part !== null &&
	"type" in part &&
	part.type === "data-agent-boundary" &&
	"data" in part &&
	typeof part.data === "object" &&
	part.data !== null &&
	"type" in part.data &&
	(part.data.type === "start" || part.data.type === "end") &&
	"agentId" in part.data &&
	"boundaryId" in part.data;

// Helper function to find create_agent tool boundaries using custom markers
const findCreateAgentBoundaries = (
	parts: MessageType["parts"],
): CreateAgentBoundary[] => {
	if (!parts || parts.length === 0) {
		return [];
	}

	const boundaries: CreateAgentBoundary[] = [];
	const openBoundaries = new Map<
		string,
		{ startIndex: number; task: string; toolkits: string[] }
	>();

	parts.forEach((part, index) => {
		if (isAgentBoundaryPart(part) && part.data.agentId === "create_agent") {
			if (part.data.type === "start") {
				openBoundaries.set(part.data.boundaryId, {
					startIndex: index,
					task: part.data.task ?? "",
					toolkits: part.data.toolkits ?? [],
				});
			} else if (part.data.type === "end") {
				const startInfo = openBoundaries.get(part.data.boundaryId);
				if (startInfo) {
					boundaries.push({
						boundaryId: part.data.boundaryId,
						startIndex: startInfo.startIndex,
						endIndex: index,
						task: startInfo.task,
						toolkits: startInfo.toolkits,
						result: part.data.result,
					});
					openBoundaries.delete(part.data.boundaryId);
				}
			}
		}
	});

	openBoundaries.forEach((startInfo, boundaryId) => {
		boundaries.push({
			boundaryId,
			startIndex: startInfo.startIndex,
			endIndex: parts.length - 1,
			task: startInfo.task,
			toolkits: startInfo.toolkits,
		});
	});

	if (boundaries.length === 0) {
		const fallbackBoundaries: CreateAgentBoundary[] = [];
		parts.forEach((part, index) => {
			if (isCreateAgentToolPart(part)) {
				const { task: fallbackTask, toolkits } =
					extractCreateAgentMetadata(part);
				fallbackBoundaries.push({
					boundaryId: `fallback-${index}`,
					startIndex: index,
					endIndex: parts.length - 1,
					task: fallbackTask ?? "",
					toolkits,
				});
			}
		});

		return fallbackBoundaries;
	}

	return boundaries.sort((a, b) => a.startIndex - b.startIndex);
};

// Kill the WeakMap and random ID generation entirely.
function getStablePartKey(
	part: MessageType["parts"][number],
	fallback: string,
): string {
	const anyPart = part as Record<string, unknown>;

	// Prefer SDK-stable ids if present (your stream provides these: gen-..., toolCallId, etc.)
	const stable =
		(anyPart.toolCallId as string) ||
		(anyPart.id as string) ||
		(anyPart.callId as string);

	if (stable) {
		return `part-${stable}`;
	}

	// Fall back to a deterministic caller-provided key (see next patches)
	return fallback;
}

// Helper function to format model display with reasoning effort
const formatModelDisplayText = (modelName: string, effort?: string) => {
	if (!effort || effort === "none") {
		return modelName;
	}
	return `${modelName} (${effort})`;
};

// Helper function to extract sources from parts
const extractSourcesFromParts = (
	combinedParts: MessageType["parts"],
): SourceUrlUIPart[] => {
	if (!combinedParts) {
		return [];
	}

	// Process both 'source-url' and 'tool-search' parts
	return combinedParts.flatMap((part): SourceUrlUIPart[] => {
		// Handle standard source URLs
		if (part.type === "source-url") {
			return [part];
		}

		// Handle search results from the search tool
		if (
			part.type === "tool-search" &&
			"state" in part &&
			part.state === "output-available" &&
			"output" in part &&
			part.output &&
			typeof part.output === "object" &&
			"results" in part.output &&
			Array.isArray((part.output as { results: unknown }).results)
		) {
			// Type assertion for safety
			const toolPart = part as ToolUIPart & {
				output: { results: Array<{ url: string; title: string }> };
			};

			// console.log('Tool search results:', toolPart.output.results[0].title);

			return toolPart.output.results.map((result) => ({
				sourceId: result.url, // Use URL as sourceId
				type: "source-url",
				url: result.url,
				title: result.title, // Use title for display
			}));
		}

		// Return empty for other part types
		return [];
	});
};

// Helper function to extract search query from parts
const extractSearchQueryFromParts = (
	combinedParts: MessageType["parts"],
): string | null => {
	if (!combinedParts) {
		return null;
	}

	for (const part of combinedParts) {
		if (
			part.type === "tool-search" &&
			"input" in part &&
			part.input &&
			typeof part.input === "object" &&
			"query" in part.input
		) {
			return part.input.query as string;
		}
	}

	return null;
};

// Helper function to render different file types
const renderFilePart = (filePart: FileUIPart, index: number) => {
	const displayUrl = filePart.url;
	const filename = filePart.filename || `file-${index}`;
	const mediaType = filePart.mediaType || "application/octet-stream";

	if (mediaType.startsWith("image")) {
		// If image was redacted on the server, render a fixed-size placeholder with overlay text
		if (displayUrl === "redacted") {
			return (
				<div className="mb-1" key={`file-${index}`}>
					<div
						aria-label="Image redacted"
						className="relative overflow-hidden rounded-md bg-muted"
						role="img"
						style={{ width: 300, height: 300 }}
					>
						{/* Subtle pattern background */}
						<div
							aria-hidden
							className="absolute inset-0 opacity-40"
							style={{
								backgroundImage:
									"repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 10px, transparent 10px, transparent 20px)",
							}}
						/>
						{/* Centered label */}
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="rounded-full border border-border bg-background/80 px-3 py-1 text-muted-foreground text-xs">
								Image redacted
							</span>
						</div>
					</div>
				</div>
			);
		}
		return (
			<MorphingDialog
				key={`file-${index}`}
				transition={{
					type: "spring",
					stiffness: 280,
					damping: 18,
					mass: 0.3,
				}}
			>
				<MorphingDialogTrigger className="z-10">
					<img
						alt={filename}
						className="mb-1 h-[300px] w-[300px] rounded-md object-cover"
						src={displayUrl}
					/>
				</MorphingDialogTrigger>
				<MorphingDialogContainer>
					<MorphingDialogContent className="relative rounded-lg">
						<MorphingDialogImage
							alt={filename}
							className="max-h-[90vh] max-w-[90vw] object-contain"
							src={displayUrl}
						/>
					</MorphingDialogContent>
					<MorphingDialogClose className="text-primary" />
				</MorphingDialogContainer>
			</MorphingDialog>
		);
	}

	if (mediaType.startsWith("text")) {
		if (displayUrl === "redacted") {
			return (
				<div className="mb-2 w-[300px] rounded-md border bg-muted p-3 text-center text-muted-foreground text-xs">
					Attachment redacted
				</div>
			);
		}
		return (
			<a
				aria-label={`Download text file: ${filename}`}
				className="mb-2 flex w-35 cursor-pointer flex-col justify-between rounded-lg border border-gray-200 bg-muted px-4 py-2 shadow-sm transition-colors hover:bg-muted/80 focus:bg-muted/70 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-700"
				download={filename}
				href={displayUrl}
				key={`file-${index}`}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						(e.currentTarget as HTMLAnchorElement).click();
					}
				}}
				rel="noopener noreferrer"
				style={{ minWidth: 0, minHeight: 64 }}
				tabIndex={0}
				target="_blank"
			>
				<div className="flex items-center gap-2">
					<span
						className="overflow-hidden truncate whitespace-nowrap font-medium text-gray-900 text-sm dark:text-gray-100"
						style={{ maxWidth: "calc(100% - 28px)" }}
						title={filename}
					>
						{filename}
					</span>
				</div>
			</a>
		);
	}

	if (mediaType === "application/pdf") {
		if (displayUrl === "redacted") {
			return (
				<div className="mb-2 w-[120px] rounded-md border bg-muted px-4 py-2 text-center text-muted-foreground text-xs">
					Attachment redacted
				</div>
			);
		}
		return (
			<a
				aria-label={`Download PDF: ${filename}`}
				className="mb-2 flex w-35 cursor-pointer flex-col justify-between rounded-lg border border-gray-200 bg-muted px-4 py-2 shadow-sm transition-colors hover:bg-muted/80 focus:bg-muted/70 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-700"
				download={filename}
				href={displayUrl}
				key={`file-${index}`}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						(e.currentTarget as HTMLAnchorElement).click();
					}
				}}
				rel="noopener noreferrer"
				style={{ minWidth: 0, minHeight: 64 }}
				tabIndex={0}
				target="_blank"
			>
				{/* Placeholder preview lines */}
				<div
					aria-hidden="true"
					className="mt-1 mb-2 flex flex-1 flex-col gap-0.5"
				>
					<div className="h-2 w-4/5 rounded bg-gray-200 dark:bg-zinc-600" />
					<div className="h-2 w-3/5 rounded bg-gray-200 dark:bg-zinc-600" />
					<div className="h-2 w-2/5 rounded bg-gray-200 dark:bg-zinc-600" />
				</div>
				{/* Footer with icon and filename */}
				<div className="flex items-center gap-2">
					<FilePdf
						aria-hidden="true"
						className="shrink-0 text-gray-500 dark:text-gray-300"
						size={20}
						weight="duotone"
					/>
					<span
						className="overflow-hidden truncate whitespace-nowrap font-medium text-gray-900 text-sm dark:text-gray-100"
						style={{ maxWidth: "calc(100% - 28px)" }}
						title={filename}
					>
						{filename}
					</span>
				</div>
			</a>
		);
	}

	return null;
};

type MessageAssistantProps = {
	isLast?: boolean;
	hasScrollAnchor?: boolean;
	copied?: boolean;
	copyToClipboard?: () => void;
	onReload?: () => void;
	onBranch?: () => void;
	model?: string;
	parts?: MessageType["parts"];
	status?: "streaming" | "ready" | "submitted" | "error";
	id: string;
	metadata?: Infer<typeof MessageSchema>["metadata"];
	readOnly?: boolean;
};

const Markdown = lazy(() =>
	import("@/components/prompt-kit/markdown").then((mod) => ({
		default: mod.Markdown,
	})),
);

// Individual part renderers for sequential rendering
const renderTextPart = (
	part: { type: "text"; text: string },
	index: number,
	id: string,
	isAnimating: boolean,
) => {
	if (!part.text.trim()) {
		return null;
	}

	return (
		<MessageContent
			className="relative min-w-full bg-transparent p-0"
			id={`${id}-text-${index}`}
			isAnimating={isAnimating}
			key={`text-${index}`}
			markdown={true}
		>
			{part.text}
		</MessageContent>
	);
};

const renderReasoningPart = (
	part: ReasoningUIPart,
	index: number,
	id: string,
	showReasoning: boolean,
	toggleReasoning: () => void,
	isPartStreaming: boolean,
) => (
	<div className="mb-2 w-full" key={`reasoning-${index}`}>
		<Reasoning
			expanded={showReasoning}
			isLoading={isPartStreaming}
			onToggle={toggleReasoning}
		>
			<ReasoningTrigger />
			<ReasoningContent>
				<Markdown
					className="w-full max-w-none break-words leading-relaxed"
					id={`${id}-reasoning-${index}`}
					isAnimating={isPartStreaming}
				>
					{part.text}
				</Markdown>
			</ReasoningContent>
		</Reasoning>
	</div>
);

type ExtendedToolUIPart = ToolUIPart & { toolName?: string };

// Add memoized ConnectorToolCall wrapper
const ConnectorToolCallMemo = React.memo(ConnectorToolCall);

function ToolRenderer({
	part,
	toolType,
	connectorDisplayName,
	connectorType,
}: {
	part: ToolUIPart;
	toolType: string;
	connectorDisplayName: string;
	connectorType: ConnectorType;
}) {
	const isLoading = useMemo(
		() =>
			"state" in part &&
			(part.state === "input-streaming" || part.state === "input-available"),
		[part],
	);
	const hasCompleted = useMemo(
		() => "state" in part && part.state === "output-available",
		[part],
	);
	const hasError = useMemo(
		() => "state" in part && part.state === "output-error",
		[part],
	);

	const data = React.useMemo(() => {
		const d: {
			toolName: string;
			connectorType: ConnectorType;
			request?: {
				action: string;
				parameters: Record<string, unknown>;
			};
			response?: {
				success: boolean;
				data?: unknown;
				error?: string;
			};
		} = { toolName: connectorDisplayName, connectorType };

		const extendedPart = part as ExtendedToolUIPart;
		if ("input" in part && part.input) {
			d.request = {
				action: extendedPart.toolName ?? toolType,
				parameters: part.input as Record<string, unknown>,
			};
		}
		if (hasCompleted && "output" in part && part.output) {
			d.response = { success: true, data: part.output };
		} else if (hasError && "error" in part && part.error) {
			d.response = {
				success: false,
				error:
					typeof part.error === "string" ? part.error : "Tool execution failed",
			};
		}
		return d;
	}, [
		connectorDisplayName,
		connectorType,
		toolType,
		hasCompleted,
		hasError,
		part,
	]);

	return <ConnectorToolCallMemo data={data} isLoading={isLoading} />;
}

const renderToolPart = (
	part: ToolUIPart,
	index: number,
	_id: string,
) => {
	const extendedPart = part as ExtendedToolUIPart;
	const toolType = part.type.replace("tool-", "");

	// Handle search tools
	if (toolType === "search") {
		const searchQuery = extractSearchQueryFromParts([part]);

		// For in-progress search tools, show loading state
		if ("state" in part && part.state !== "output-available") {
			if (searchQuery) {
				return <UnifiedSearch isLoading={true} query={searchQuery} />;
			}
			// Fallback to original loader if no query is available
			return (
				<div
					className="my-2 flex items-center gap-2 text-muted-foreground text-sm"
					key={`tool-${index}`}
				>
					<Loader text="Searching the web" />
				</div>
			);
		}

		// For completed search tools, render the unified search component with results
		if ("state" in part && part.state === "output-available") {
			const sources = extractSourcesFromParts([part]);

			if (searchQuery) {
				return (
					<UnifiedSearch
						isLoading={false}
						query={searchQuery}
						sources={sources}
					/>
				);
			}
		}
	}

	// Handle connector tool calls (Composio tools)
	const isConnectorToolCall = isConnectorTool(toolType);

	if (isConnectorToolCall) {
		// Determine connector type from tool name
		const connectorType = getConnectorTypeFromToolName(toolType);
		const connectorConfig = getConnectorConfig(connectorType);
		const connectorDisplayName = connectorConfig.displayName;

		// Handle different tool states based on AI SDK v5 ToolUIPart states
		if ("state" in part) {
			const hasCompleted = part.state === "output-available";
			const hasError = part.state === "output-error";

			// Extract tool call data based on state
			const toolCallData: {
				toolName: string;
				connectorType: ConnectorType;
				request?: {
					action: string;
					parameters?: Record<string, unknown>;
				};
				response?: {
					success: boolean;
					data?: unknown;
					error?: string;
				};
				metadata?: {
					executionTime?: number;
					timestamp?: string;
				};
			} = {
				toolName: connectorDisplayName,
				connectorType,
			};

			// Extract input/arguments if available
			if ("input" in part && part.input) {
				toolCallData.request = {
					action: extendedPart.toolName ?? toolType,
					parameters: part.input as Record<string, unknown>,
				};
			}

			// Extract output/result if available
			if (hasCompleted && "output" in part && part.output) {
				toolCallData.response = {
					success: true,
					data: part.output,
				};
			} else if (hasError && "error" in part && part.error) {
				toolCallData.response = {
					success: false,
					error:
						typeof part.error === "string"
							? part.error
							: "Tool execution failed",
				};
			}

			return (
				<ToolRenderer
					connectorDisplayName={connectorDisplayName}
					connectorType={connectorType}
					part={part}
					toolType={toolType}
				/>
			);
		}

		// Fallback for connector tools without proper state (shouldn't happen with AI SDK v5)
		const fallbackData: {
			toolName: string;
			connectorType: ConnectorType;
			request?: {
				action: string;
				parameters?: Record<string, unknown>;
			};
			response?: {
				success: boolean;
				data?: unknown;
				error?: string;
			};
		} = {
			toolName: connectorDisplayName,
			connectorType,
		};

		return <ConnectorToolCallMemo data={fallbackData} isLoading={false} />;
	}

	return null;
};

// Helper function to render a part directly (outside Chain of Thought)
const renderPartDirectly = (
	part: MessageType["parts"][number],
	index: number,
	id: string,
	isAnimating: boolean,
	partKey: string,
	reasoningStates: Record<string, boolean>,
	reasoningStreamingStates: Record<string, boolean>,
	toggleReasoning: (partIndex: number) => void,
) => {
	switch (part.type) {
		case "text":
			return renderTextPart(
				part as { type: "text"; text: string },
				index,
				id,
				isAnimating,
			);

		case "reasoning":
			return renderReasoningPart(
				part as ReasoningUIPart,
				index,
				id,
				reasoningStates[`${id}-${index}`],
				() => toggleReasoning(index),
				reasoningStreamingStates[`${id}-${index}`],
			);

		case "file":
			return (
				<div className="flex w-full flex-wrap gap-2" key={partKey}>
					{renderFilePart(part as FileUIPart, index)}
				</div>
			);

		default:
			if (part.type.startsWith("tool-")) {
				return renderToolPart(part as ToolUIPart, index, id);
			}
			if (isErrorPart(part)) {
				return renderErrorPart(part, index);
			}
			// Skip rendering boundary markers (they're only for detection)
			if (part.type === "data-agent-boundary") {
				return null;
			}
			return null;
	}
};

// Helper function to render a part inside Chain of Thought with ChainOfThoughtStep wrappers
const renderPartInChainOfThought = (
	part: MessageType["parts"][number],
	index: number,
	id: string,
	isAnimating: boolean,
	partKey: string,
	reasoningStates: Record<string, boolean>,
	reasoningStreamingStates: Record<string, boolean>,
	toggleReasoning: (partIndex: number) => void,
) => {
	switch (part.type) {
		case "text":
			return (
				<ChainOfThoughtStep
					key={partKey}
					label="Field Report"
					status="complete"
				>
					{renderTextPart(
						part as { type: "text"; text: string },
						index,
						id,
						isAnimating,
					)}
				</ChainOfThoughtStep>
			);

		case "reasoning":
			return (
				<ChainOfThoughtStep key={partKey} label="Thinking" status="complete">
					{renderReasoningPart(
						part as ReasoningUIPart,
						index,
						id,
						reasoningStates[`${id}-${index}`],
						() => toggleReasoning(index),
						reasoningStreamingStates[`${id}-${index}`],
					)}
				</ChainOfThoughtStep>
			);

		case "file":
			return (
				<ChainOfThoughtStep
					key={partKey}
					label="File Attachment"
					status="complete"
				>
					<div className="flex w-full flex-wrap gap-2">
						{renderFilePart(part as FileUIPart, index)}
					</div>
				</ChainOfThoughtStep>
			);

		default:
			if (part.type.startsWith("tool-")) {
				const toolPart = part as ToolUIPart;
				const toolType = toolPart.type.replace("tool-", "");
				const toolLabel = isConnectorTool(toolType)
					? buildConnectorDisplayLabel(
							getConnectorTypeFromToolName(toolType) as ConnectorType,
							getConnectorConfig(
								getConnectorTypeFromToolName(toolType) as ConnectorType,
							).displayName,
					)
					: toolType;

				return (
					<ChainOfThoughtStep key={partKey} label={toolLabel} status="complete">
						{renderToolPart(toolPart, index, id)}
					</ChainOfThoughtStep>
				);
			}
			if (isErrorPart(part)) {
				return (
					<ChainOfThoughtStep key={partKey} label="Error" status="complete">
						{renderErrorPart(part, index)}
					</ChainOfThoughtStep>
				);
			}
			// Skip rendering boundary markers (they're only for detection)
			if (part.type === "data-agent-boundary") {
				return null;
			}
			return null;
	}
};

const renderErrorPart = (part: ErrorUIPart, index: number) => (
	<div
		className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/15 px-4 py-3 text-red-900 text-sm dark:text-red-400"
		key={`error-${index}`}
		role="alert"
	>
		<div className="leading-relaxed">{part.error.message}</div>
	</div>
);

type NormalSegment = {
	type: "normal";
	parts: MessageType["parts"];
	key: string;
	startIndex: number;
};

type AgentSegment = {
	type: "agent";
	parts: MessageType["parts"];
	key: string;
	startIndex: number;
	boundary: CreateAgentBoundary;
};

type MessageSegment = NormalSegment | AgentSegment;

// Helper function to split parts based on create_agent tool boundaries (supports multiple agents)
const segmentPartsByAgentBoundaries = (
	parts: MessageType["parts"],
): MessageSegment[] => {
	if (!(parts && Array.isArray(parts)) || parts.length === 0) {
		return [];
	}

	const agentBoundaries = findCreateAgentBoundaries(parts);

	if (agentBoundaries.length === 0) {
		return [
			{
				type: "normal",
				parts,
				key: "normal-0",
				startIndex: 0,
			},
		];
	}

	const segments: MessageSegment[] = [];
	let cursor = 0;

	agentBoundaries.forEach((boundary, boundaryIndex) => {
		const segmentStart = Math.max(boundary.startIndex, cursor);
		const segmentEnd = Math.max(boundary.endIndex, segmentStart - 1);

		if (segmentStart > cursor) {
			const normalParts = parts.slice(cursor, segmentStart);
			if (normalParts.length > 0) {
				segments.push({
					type: "normal",
					parts: normalParts,
					key: `normal-${cursor}-${boundaryIndex}`,
					startIndex: cursor,
				});
			}
		}

		if (segmentEnd >= segmentStart) {
			const agentParts = parts.slice(segmentStart, segmentEnd + 1);
			if (agentParts.length > 0) {
				segments.push({
					type: "agent",
					parts: agentParts,
					key: `agent-${boundary.boundaryId || boundaryIndex}`,
					startIndex: segmentStart,
					boundary,
				});
			}
		}

		cursor = Math.max(cursor, boundary.endIndex + 1);
	});

	if (cursor < parts.length) {
		segments.push({
			type: "normal",
			parts: parts.slice(cursor),
			key: `normal-${cursor}-final`,
			startIndex: cursor,
		});
	}

	return segments;
};

const agentSegmentHasEnd = (segment: AgentSegment): boolean =>
	segment.parts.some(
		(part) => isAgentBoundaryPart(part) && part.data.type === "end",
	);

function MessageAssistantInner({
	hasScrollAnchor,
	copied,
	copyToClipboard,
	onReload,
	onBranch,
	model,
	parts,
	status,
	id,
	metadata,
	readOnly = false,
}: MessageAssistantProps) {
	// Prefer `parts` prop, but fall back to `attachments` if `parts` is undefined.
	const combinedParts = parts || [];

	const segments = useMemo(
		() => segmentPartsByAgentBoundaries(combinedParts),
		[combinedParts],
	);

	const agentSegments = useMemo(
		() =>
			segments.filter(
				(segment): segment is AgentSegment => segment.type === "agent",
			),
		[segments],
	);

	// State for agent open/closed state
	const [agentOpenStates, setAgentOpenStates] = useState<
		Record<string, boolean>
	>({});

	// Stabilize onOpenChange handlers per CoT segment
	const onOpenChangeByKey = useMemo(() => {
		const map: Record<string, (open: boolean) => void> = {};
		for (const seg of agentSegments) {
			const key = seg.key;
			map[key] = (open: boolean) => {
				agentManualOverrides.current[key] = true;
				setAgentOpenStates((prev) =>
					prev[key] === open ? prev : { ...prev, [key]: open },
				);
			};
		}
		return map;
	}, [agentSegments]);

	// State for reasoning collapse/expand functionality - track each reasoning part individually
	const [reasoningStates, setReasoningStates] = useState<
		Record<string, boolean>
	>({});
	// Track which reasoning parts were initially streaming (to show correct UI)
	const [reasoningStreamingStates, setReasoningStreamingStates] = useState<
		Record<string, boolean>
	>({});
	const initialStatusRef = useRef<Record<string, boolean>>({});
	const isTouch = useSyncExternalStore(
		subscribeToTouchCapability,
		getIsTouchDevice,
		() => false,
	);

	const agentManualOverrides = useRef<Record<string, boolean>>({});
	useEffect(() => {
		setAgentOpenStates((previousState) => {
			const activeKeys = new Set(agentSegments.map((segment) => segment.key));
			for (const key of Object.keys(agentManualOverrides.current)) {
				if (!activeKeys.has(key)) {
					delete agentManualOverrides.current[key];
				}
			}

			const nextState: Record<string, boolean> = {};

			for (const segment of agentSegments) {
				if (agentManualOverrides.current[segment.key]) {
					const manualValue = previousState[segment.key];
					nextState[segment.key] =
						manualValue !== undefined
							? manualValue
							: !agentSegmentHasEnd(segment);
					continue;
				}

				nextState[segment.key] = !agentSegmentHasEnd(segment);
			}

			const previousKeys = Object.keys(previousState);
			const nextKeys = Object.keys(nextState);

			if (previousKeys.length !== nextKeys.length) {
				return nextState;
			}

			for (const key of nextKeys) {
				if (previousState[key] !== nextState[key]) {
					return nextState;
				}
			}

			if (previousKeys.length === 0 && nextKeys.length === 0) {
				return previousState;
			}

			return previousState;
		});
	}, [agentSegments]);

	// Initialize reasoning states - only run once when reasoning parts are first detected
	useEffect(() => {
		if (combinedParts) {
			// Calculate new states in a single pass
			let newStates: Record<string, boolean> = {};
			let newStreamingStates: Record<string, boolean> = {};
			let hasStateChanges = false;
			let hasStreamingChanges = false;

			// Update both reasoning states in a single operation
			setReasoningStates((prevStates) => {
				setReasoningStreamingStates((prevStreamingStates) => {
					newStates = { ...prevStates };
					newStreamingStates = { ...prevStreamingStates };

					// Single pass through combinedParts to update both states
					combinedParts.forEach((part, index) => {
						if (part.type === "reasoning") {
							const key = `${id}-${index}`;

							// Handle reasoning states
							const hasContent = Boolean(
								part.text && part.text.trim().length > 0,
							);
							const isCurrentlyStreaming = status === "streaming";

							if (!(key in newStates)) {
								// Initialize new reasoning part - start closed if no content
								newStates[key] = hasContent && isCurrentlyStreaming;
								hasStateChanges = true;
							} else if (
								isCurrentlyStreaming &&
								hasContent &&
								!newStates[key]
							) {
								// Expand if we're streaming and content appears for the first time
								newStates[key] = true;
								hasStateChanges = true;
							}

							// Handle streaming states
							if (!(key in newStreamingStates)) {
								const isInitiallyStreaming = status === "streaming";
								newStreamingStates[key] = isInitiallyStreaming;
								// Store the initial status in ref to avoid re-initialization
								initialStatusRef.current[key] = isInitiallyStreaming;
								hasStreamingChanges = true;
							}
						}
					});

					// During streaming, handle collapsing and loading states for reasoning parts that have non-reasoning content after them
					if (status === "streaming") {
						combinedParts.forEach((part, index) => {
							if (part.type === "reasoning") {
								const key = `${id}-${index}`;
								// Check if there are non-reasoning parts after this reasoning part
								const hasSubsequentNonReasoningParts = combinedParts
									.slice(index + 1)
									.some((p) => p.type !== "reasoning");

								if (hasSubsequentNonReasoningParts) {
									// Collapse this specific reasoning block
									if (newStates[key]) {
										newStates[key] = false;
										hasStateChanges = true;
									}

									// Turn off loading for this reasoning part
									if (newStreamingStates[key]) {
										newStreamingStates[key] = false;
										hasStreamingChanges = true;
									}
								}
							}
						});
					} else {
						// When not streaming, turn off all reasoning streaming states (loading indicators)
						combinedParts.forEach((part, index) => {
							if (part.type === "reasoning") {
								const key = `${id}-${index}`;
								// Turn off loading for this reasoning part if it's currently on
								if (newStreamingStates[key]) {
									newStreamingStates[key] = false;
									hasStreamingChanges = true;
								}
							}
						});
					}

					return hasStreamingChanges ? newStreamingStates : prevStreamingStates;
				});

				return hasStateChanges ? newStates : prevStates;
			});
		}
	}, [combinedParts, id, status]);

	// Extract model from metadata or use direct model prop as fallback
	const modelFromMetadata = metadata?.modelName || metadata?.modelId;
	const displayModel = modelFromMetadata || model;
	const reasoningEffort = metadata?.reasoningEffort;
	const allSources = useMemo(
		() => extractSourcesFromParts(combinedParts),
		[combinedParts],
	);
	const searchQuery = useMemo(
		() => extractSearchQueryFromParts(combinedParts),
		[combinedParts],
	);
	const shouldRenderSourcesList = !(Boolean(searchQuery) && allSources.length > 0);

	// Helper function to toggle individual reasoning part
	const toggleReasoning = (index: number) => {
		const key = `${id}-${index}`;
		setReasoningStates((prev) => ({
			...prev,
			[key]: !prev[key],
		}));
	};

	return (
		<Message
			className={cn(
				"group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
				hasScrollAnchor ? "min-h-scroll-anchor" : "",
			)}
			id={id}
		>
			<div className={cn("flex w-full flex-col gap-2")}>
				{/* Show loader when streaming but no content yet */}
				{status === "streaming" && segments.length === 0 && (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader size="md" variant="dots" />
					</div>
				)}

				{/* Render parts in order: beforeAgent -> ChainOfThought(agentParts) -> afterAgent */}
				{segments.flatMap((segment) => {
					if (segment.type === "normal") {
						return segment.parts.map((part, innerIndex) => {
							const fallbackKey = `${segment.key}-${innerIndex}`;
							const stableKey = getStablePartKey(part, fallbackKey);

							return (
								<React.Fragment key={stableKey}>
									{renderPartDirectly(
										part,
										innerIndex,
										id,
										status === "streaming",
										stableKey,
										reasoningStates,
										reasoningStreamingStates,
										toggleReasoning,
									)}
								</React.Fragment>
							);
						});
					}

					const storedOpen = agentOpenStates[segment.key];
					const isOpen = storedOpen ?? !agentSegmentHasEnd(segment);

					return [
						<ChainOfThought
							key={segment.key}
							onOpenChange={onOpenChangeByKey[segment.key]}
							open={isOpen}
							tools={segment.boundary.toolkits}
						>
							<ChainOfThoughtHeader tools={segment.boundary.toolkits}>
								{segment.boundary.task.trim()}
							</ChainOfThoughtHeader>
							<ChainOfThoughtContent>
								{segment.parts.map((part, innerIndex) => {
									if (
										isCreateAgentToolPart(part) ||
										part.type === "data-agent-boundary"
									) {
										return null;
									}

									const fallbackKey = `${segment.key}-${innerIndex}`;
									const stepKey = getStablePartKey(part, fallbackKey);

									return renderPartInChainOfThought(
										part,
										innerIndex,
										id,
										status === "streaming",
										stepKey,
										reasoningStates,
										reasoningStreamingStates,
										toggleReasoning,
									);
								})}
							</ChainOfThoughtContent>
						</ChainOfThought>,
					];
				})}

				{/* Render sources list for non-search sources only */}
				{shouldRenderSourcesList && allSources.length > 0 ? (
					<SourcesList sources={allSources} />
				) : null}

				<MessageActions
					className={cn(
						"flex gap-0 transition-opacity",
						isTouch
							? "opacity-100"
							: "opacity-100 md:opacity-0 md:group-hover:opacity-100",
					)}
				>
					<MessageAction
						delayDuration={0}
						side="bottom"
						tooltip={copied ? "Copied!" : "Copy text"}
					>
						<button
							aria-label="Copy text"
							className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
							disabled={status === "streaming"}
							onClick={copyToClipboard}
							type="button"
						>
							{copied ? (
								<Check className="size-4" />
							) : (
								<Copy className="size-4" />
							)}
						</button>
					</MessageAction>
					{!readOnly && (
						<MessageAction
							delayDuration={0}
							side="bottom"
							tooltip="Create a new chat starting from here"
						>
							<button
								aria-label="Branch chat"
								className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
								disabled={status === "streaming"}
								onClick={onBranch}
								type="button"
							>
								<GitBranch className="size-4 rotate-180" />
							</button>
						</MessageAction>
					)}
					{!readOnly && (
						<MessageAction delayDuration={0} side="bottom" tooltip="Regenerate">
							<button
								aria-label="Regenerate"
								className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
								disabled={status === "streaming"}
								onClick={onReload}
								type="button"
							>
								<ArrowClockwise className="size-4" />
							</button>
						</MessageAction>
					)}
					{displayModel ? (
						<span className="ml-2 inline-block text-muted-foreground text-xs">
							{formatModelDisplayText(displayModel, reasoningEffort)}
						</span>
					) : null}
				</MessageActions>
			</div>
		</Message>
	);
}

// Custom comparator to ignore handler prop changes
const areEqual = (prev: MessageAssistantProps, next: MessageAssistantProps) => {
	return (
		prev.id === next.id &&
		prev.status === next.status &&
		prev.isLast === next.isLast &&
		prev.hasScrollAnchor === next.hasScrollAnchor &&
		prev.model === next.model &&
		prev.readOnly === next.readOnly &&
		prev.copied === next.copied &&
		prev.metadata === next.metadata &&
		prev.parts === next.parts && // keep ref equality
		prev.copyToClipboard === next.copyToClipboard
		// Intentionally ignore: onReload, onBranch
	);
};

export const MessageAssistant = memo(MessageAssistantInner, areEqual);
