import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import type { Infer } from "convex/values";
import React, { useEffect, useRef, useState } from "react";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import {
	ChatContainerContent,
	ChatContainerRoot,
	ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { ImageSkeleton } from "@/components/prompt-kit/image-skeleton";
import { Loader } from "@/components/prompt-kit/loader";
import { MODELS_MAP } from "@/lib/config";
import type { Message as MessageSchema } from "../../../convex/schema/message";
import { Message } from "./message";

export type MessageWithExtras = UIMessage & {
	model?: string;
	metadata?: Infer<typeof MessageSchema>["metadata"];
	clientId?: string;
	serverId?: string;
};

type ConversationProps = {
	messages: MessageWithExtras[];
	status: ChatStatus;
	onDelete: (id: string) => void;
	onEdit: (
		id: string,
		newText: string,
		options: {
			model: string;
			enableSearch: boolean;
			files: File[];
			reasoningEffort: "low" | "medium" | "high";
			removedFileUrls?: string[];
		},
	) => void;
	onReload: (id: string) => void;
	onBranch: (messageId: string) => void;
	autoScroll?: boolean;
	selectedModel?: string;
	isUserAuthenticated?: boolean;
	isReasoningModel?: boolean;
	reasoningEffort?: "low" | "medium" | "high";
};

const Conversation = React.memo(
	({
		messages,
		status,
		onDelete,
		onEdit,
		onReload,
		onBranch,
		selectedModel,
		isUserAuthenticated = false,
		isReasoningModel = false,
		reasoningEffort = "medium",
	}: ConversationProps) => {
		const [initialMessageCount] = useState(messages.length);
		const [resizeMode, setResizeMode] = useState<"instant" | "smooth">(
			"instant",
		);
		const didSetSmooth = useRef(false);

		// Check if the selected model is an image generation model
		const isImageGenerationModel =
			selectedModel &&
			MODELS_MAP[selectedModel]?.features?.some(
				(feature) => feature.id === "image-generation" && feature.enabled,
			);

		useEffect(() => {
			if (messages.length === 0 || didSetSmooth.current) {
				return;
			}
			didSetSmooth.current = true;
			let raf2 = 0;
			const raf1 = requestAnimationFrame(() => {
				raf2 = requestAnimationFrame(() => {
					setResizeMode("smooth");
				});
			});
			return () => {
				cancelAnimationFrame(raf1);
				if (raf2) {
					cancelAnimationFrame(raf2);
				}
			};
		}, [messages.length]);

		if (!messages || messages.length === 0) {
			return <div className="h-full w-full" />;
		}

		const lastMessage = messages.at(-1);
		const showSkeleton =
			(status === "submitted" && lastMessage?.role === "user") ||
			(status === "streaming" &&
				isImageGenerationModel &&
				(lastMessage?.role === "user" ||
					(lastMessage?.role === "assistant" &&
						!lastMessage.parts?.some((part) => part.type === "file"))));

		return (
			<div className="relative flex h-full min-h-0 w-full flex-col items-center">
				<ChatContainerRoot
					className="relative flex-1 min-h-0 w-full flex-col items-center overflow-x-hidden"
					resize={resizeMode}
					style={{
						scrollbarGutter: "stable both-edges",
					}}
				>
					<ChatContainerContent className="relative flex w-full flex-col items-center pt-20 pb-4">
						{messages?.map((message, index) => {
							const isLast =
								index === messages.length - 1 && status !== "submitted";
							const hasScrollAnchor = isLast
								? messages.length > initialMessageCount
								: false;
							const messageStatus = isLast ? status : "ready";
							const stableKey =
								(message as MessageWithExtras).clientId ?? message.id;

							return (
								<Message
									hasScrollAnchor={hasScrollAnchor}
									id={message.id}
									isLast={isLast}
									isReasoningModel={isReasoningModel}
									isUserAuthenticated={isUserAuthenticated}
									key={stableKey}
									metadata={message.metadata}
									model={message.model}
									onBranch={() => onBranch(message.id)}
									onDelete={onDelete}
									onEdit={onEdit}
									onReload={() => onReload(message.id)}
									parts={message.parts}
									reasoningEffort={reasoningEffort}
									selectedModel={selectedModel}
									status={messageStatus}
									variant={message.role}
								/>
							);
						})}
						{showSkeleton ? (
							<div className="group flex min-h-scroll-anchor w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
								{isImageGenerationModel ? (
									<ImageSkeleton height={300} width={300} />
								) : (
									<Loader size="md" variant="dots" />
								)}
							</div>
						) : null}
					</ChatContainerContent>

					<ChatContainerScrollAnchor />

					<div className="absolute bottom-0 w-full max-w-3xl">
						<ScrollButton className="absolute top-[-50px] right-[30px]" />
					</div>
				</ChatContainerRoot>
			</div>
		);
	},
);

export { Conversation };
