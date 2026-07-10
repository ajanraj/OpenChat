import {
	CheckIcon,
	CopyIcon,
	FilePdfIcon,
	PencilSimpleIcon,
	PencilSimpleSlashIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import type { FileUIPart, UIMessage as MessageType } from "ai";
import type React from "react";
import { memo, useRef, useState, useSyncExternalStore } from "react";
import { EditInput } from "@/components/chat-input/edit-input";
import {
	MorphingDialog,
	MorphingDialogClose,
	MorphingDialogContainer,
	MorphingDialogContent,
	MorphingDialogImage,
	MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog";
import {
	MessageAction,
	MessageActions,
	Message as MessageContainer,
	MessageContent,
} from "@/components/prompt-kit/message";
import type { ReasoningEffort } from "@/lib/config";
import { cn } from "@/lib/utils";

const getTextFromDataUrl = (dataUrl: string) => {
	const base64 = dataUrl.split(",")[1];
	return base64;
};

function useIsTouchDevice(): boolean {
	return useSyncExternalStore(
		() => () => {},
		() =>
			typeof window !== "undefined" &&
			("ontouchstart" in window || navigator.maxTouchPoints > 0),
		() => false,
	);
}

// Helper function to render different file parts
function FilePartRenderer({ filePart }: { filePart: FileUIPart }) {
	if (filePart.mediaType?.startsWith("image")) {
		if (filePart.url === "redacted") {
			return (
				<div className="mb-1">
					<div
						aria-label="Image redacted"
						className="relative overflow-hidden rounded-md bg-muted"
						role="img"
						style={{ width: 160, height: 160 }}
					>
						<div
							aria-hidden
							className="absolute inset-0 opacity-40"
							style={{
								backgroundImage:
									"repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 10px, transparent 10px, transparent 20px)",
							}}
						/>
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
								Image redacted
							</span>
						</div>
					</div>
				</div>
			);
		}
		return (
			<MorphingDialog
				transition={{
					type: "spring",
					stiffness: 280,
					damping: 18,
					mass: 0.3,
				}}
			>
				<MorphingDialogTrigger className="z-10">
					<img
						alt={filePart.filename ?? ""}
						className="mb-1 h-40 w-40 rounded-md object-cover"
						src={filePart.url}
					/>
				</MorphingDialogTrigger>
				<MorphingDialogContainer>
					<MorphingDialogContent className="relative rounded-lg">
						<MorphingDialogImage
							alt={filePart.filename || ""}
							className="max-h-[90vh] max-w-[90vw] object-contain"
							src={filePart.url}
						/>
					</MorphingDialogContent>
					<MorphingDialogClose className="text-primary" />
				</MorphingDialogContainer>
			</MorphingDialog>
		);
	}

	if (filePart.mediaType?.startsWith("text")) {
		if (filePart.url === "redacted") {
			return (
				<div className="mb-2 w-40 rounded-md border bg-muted p-2 text-center text-muted-foreground text-xs">
					Attachment redacted
				</div>
			);
		}
		return (
			<div className="mb-3 h-24 w-40 overflow-hidden rounded-md border p-2 text-primary text-xs">
				{getTextFromDataUrl(filePart.url)}
			</div>
		);
	}

	if (filePart.mediaType === "application/pdf") {
		if (filePart.url === "redacted") {
			return (
				<div className="mb-2 w-[120px] rounded-md border bg-muted px-4 py-2 text-center text-muted-foreground text-xs">
					Attachment redacted
				</div>
			);
		}
		return (
			<a
				aria-label={`Download PDF: ${filePart.filename}`}
				className="mb-2 flex w-35 cursor-pointer flex-col justify-between rounded-lg border border-gray-200 bg-muted px-4 py-2 shadow-sm transition-colors hover:bg-muted/80 focus:bg-muted/70 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-700"
				download={filePart.filename}
				href={filePart.url}
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
					<FilePdfIcon
						aria-hidden="true"
						className="shrink-0 text-gray-500 dark:text-gray-300"
						size={20}
						weight="duotone"
					/>
					<span
						className="overflow-hidden truncate whitespace-nowrap font-medium text-gray-900 text-sm dark:text-gray-100"
						style={{ maxWidth: "calc(100% - 28px)" }}
						title={filePart.filename}
					>
						{filePart.filename}
					</span>
				</div>
			</a>
		);
	}

	return null;
}

const EMPTY_EDIT_FILES: File[] = [];

export type MessageUserProps = {
	hasScrollAnchor?: boolean;
	parts?: MessageType["parts"];
	copied: boolean;
	copyToClipboard: () => void;
	readOnly?: boolean;
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
	onDelete: (id: string) => void;
	id: string;
	status?: "streaming" | "ready" | "submitted" | "error";
	selectedModel: string;
	isUserAuthenticated: boolean;
	editFiles?: File[];
	isReasoningModel?: boolean;
	reasoningEffort?: ReasoningEffort;
	isSearchEnabled?: boolean;
};

function MessageUserInner({
	hasScrollAnchor,
	parts,
	copied,
	copyToClipboard,
	readOnly = false,
	onEdit,
	onDelete,
	id,
	status,
	selectedModel,
	isUserAuthenticated,
	editFiles = EMPTY_EDIT_FILES,
	isReasoningModel = false,
	reasoningEffort = "none",
	isSearchEnabled = false,
}: MessageUserProps): React.ReactElement {
	// Extract text content from parts
	const textContent =
		parts
			?.filter((part) => part.type === "text")
			.map((part) => ("text" in part ? part.text : ""))
			.join("") || "";

	const [isEditing, setIsEditing] = useState(false);
	const isTouch = useIsTouchDevice();
	const contentRef = useRef<HTMLDivElement>(null);
	const displayContent = textContent.replace(/\n{2,}/g, "\n\n");
	const showCancelEditIcon = isEditing && !readOnly;

	const handleDelete = () => {
		onDelete(id);
	};

	return (
		<MessageContainer
			className={cn(
				"group flex w-full max-w-3xl flex-col items-end gap-2 px-6 pb-2",
				hasScrollAnchor ? "min-h-scroll-anchor" : "",
			)}
			id={id}
		>
			{parts
				?.filter((part): part is FileUIPart => part.type === "file")
				.map((filePart) => (
					<div
						className="flex flex-row gap-2"
						key={`${filePart.url}-${filePart.filename}`}
					>
						<FilePartRenderer filePart={filePart} />
					</div>
				))}
			{isEditing ? (
				<EditInput
					existingFiles={
						parts
							?.filter((part): part is FileUIPart => part.type === "file")
							.map((f) => ({
								url: f.url,
								filename: f.filename,
								mediaType: f.mediaType,
							})) ?? []
					}
					initialFiles={editFiles}
					initialValue={textContent}
					isReasoningModel={isReasoningModel}
					isSearchEnabled={isSearchEnabled}
					isUserAuthenticated={isUserAuthenticated}
					onCancel={() => {
						setIsEditing(false);
					}}
					onSend={(newValue, options) => {
						onEdit(id, newValue, options);
						setIsEditing(false);
					}}
					reasoningEffort={reasoningEffort}
					selectedModel={selectedModel}
					status={status}
				/>
			) : (
				<MessageContent
					className="relative max-w-[70%] whitespace-pre-line rounded-3xl bg-accent px-5 py-2.5"
					markdown={false}
					ref={contentRef}
				>
					{displayContent}
				</MessageContent>
			)}
			<MessageActions
				className={cn(
					"flex gap-0 transition-opacity",
					isTouch || isEditing
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
							<CheckIcon className="size-4" />
						) : (
							<CopyIcon className="size-4" />
						)}
					</button>
				</MessageAction>
				{!readOnly && (
					<MessageAction
						delayDuration={0}
						side="bottom"
						tooltip={isEditing ? "Cancel Edit" : "Edit"}
					>
						<button
							aria-label={isEditing ? "Cancel edit" : "Edit"}
							aria-pressed={isEditing}
							className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
							disabled={status === "streaming"}
							onClick={() => {
								if (readOnly) {
									return;
								}
								setIsEditing(!isEditing);
							}}
							type="button"
						>
							{showCancelEditIcon ? (
								<PencilSimpleSlashIcon className="size-4" />
							) : (
								<PencilSimpleIcon className="size-4" />
							)}
						</button>
					</MessageAction>
				)}
				{!readOnly && (
					<MessageAction delayDuration={0} side="bottom" tooltip="Delete">
						<button
							aria-label="Delete"
							className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
							disabled={status === "streaming"}
							onClick={handleDelete}
							type="button"
						>
							<TrashIcon className="size-4" />
						</button>
					</MessageAction>
				)}
			</MessageActions>
		</MessageContainer>
	);
}

export const MessageUser = memo(MessageUserInner);
