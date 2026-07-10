import type { UIMessage as MessageType } from "@ai-sdk/react";
import type { Infer } from "convex/values";
import React, { useCallback, useState } from "react";
import type { ReasoningEffort } from "@/lib/config";
import type { Message as MessageSchema } from "../../../convex/schema/message";
import { MessageAssistant } from "./message-assistant";
import { MessageUser } from "./message-user";

export type MessageProps = {
	variant: MessageType["role"];
	model?: string;
	id: string;
	isLast?: boolean;
	readOnly?: boolean;
	onDelete: (id: string) => void;
	onEdit: (
		id: string,
		newText: string,
		options: {
			model: string;
			enableSearch: boolean;
			files: File[];
			reasoningEffort: ReasoningEffort;
			removedFileUrls?: string[];
		},
	) => void;
	onReload: () => void;
	onBranch: () => void;
	hasScrollAnchor?: boolean;
	parts?: MessageType["parts"];
	status?: "streaming" | "ready" | "submitted" | "error"; // Add status prop
	metadata?: Infer<typeof MessageSchema>["metadata"];
	selectedModel?: string;
	isUserAuthenticated?: boolean;
	isReasoningModel?: boolean;
	reasoningEffort?: ReasoningEffort;
};

function MessageComponent({
	variant,
	model,
	id,
	isLast,
	readOnly,
	onDelete,
	onEdit,
	onReload,
	onBranch,
	hasScrollAnchor,
	parts,
	status, // Receive status prop
	metadata,
	selectedModel,
	isUserAuthenticated = false,
	isReasoningModel = false,
	reasoningEffort = "none",
}: MessageProps) {
	const [copied, setCopied] = useState(false);

	const copyToClipboard = useCallback(() => {
		// Extract text content from parts for copying
		const textContent =
			parts
				?.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("") || "";
		navigator.clipboard.writeText(textContent);
		setCopied(true);
		setTimeout(() => setCopied(false), 500);
	}, [parts]);

	if (variant === "user") {
		return (
			<MessageUser
				copied={copied}
				copyToClipboard={copyToClipboard}
				editFiles={[]}
				hasScrollAnchor={hasScrollAnchor}
				id={id}
				isReasoningModel={isReasoningModel}
				isSearchEnabled={metadata?.includeSearch ?? false}
				isUserAuthenticated={isUserAuthenticated}
				onDelete={onDelete}
				onEdit={onEdit}
				parts={parts}
				readOnly={readOnly}
				reasoningEffort={reasoningEffort}
				selectedModel={model || selectedModel || ""}
				status={status}
			/>
		);
	}

	if (variant === "assistant") {
		return (
			<MessageAssistant
				copied={copied}
				copyToClipboard={copyToClipboard}
				hasScrollAnchor={hasScrollAnchor}
				id={id}
				isLast={isLast}
				metadata={metadata}
				model={model}
				onBranch={onBranch}
				onReload={onReload}
				parts={parts}
				readOnly={readOnly}
				status={status}
			/>
		);
	}

	return null;
}

// Custom comparator to ignore handler prop changes
const equalMessage = (a: MessageProps, b: MessageProps) =>
	a.id === b.id &&
	a.variant === b.variant &&
	a.isLast === b.isLast &&
	a.hasScrollAnchor === b.hasScrollAnchor &&
	a.model === b.model &&
	a.readOnly === b.readOnly &&
	a.status === b.status &&
	a.metadata === b.metadata &&
	a.selectedModel === b.selectedModel &&
	a.isUserAuthenticated === b.isUserAuthenticated &&
	a.isReasoningModel === b.isReasoningModel &&
	a.reasoningEffort === b.reasoningEffort &&
	a.parts === b.parts &&
	a.onDelete === b.onDelete &&
	a.onEdit === b.onEdit;
// Intentionally ignore: onReload, onBranch (their identities change but logic doesn't)

export const Message = React.memo(MessageComponent, equalMessage);
Message.displayName = "Message";
