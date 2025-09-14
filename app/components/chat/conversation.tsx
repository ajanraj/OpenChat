import type { UIMessage } from "@ai-sdk/react";
import type { Infer } from "convex/values";
import React, { useRef } from "react";
import { ScrollButton } from "@/components/motion-primitives/scroll-button";
import { ChatContainer } from "@/components/prompt-kit/chat-container";
import { ImageSkeleton } from "@/components/prompt-kit/image-skeleton";
import { Loader } from "@/components/prompt-kit/loader";
import type { Message as MessageSchema } from "@/convex/schema/message";
import { MODELS_MAP } from "@/lib/config";
import { Message } from "./message";

export type MessageWithExtras = UIMessage & {
  model?: string;
  metadata?: Infer<typeof MessageSchema>["metadata"];
};

type ConversationProps = {
  messages: MessageWithExtras[];
  status?: "streaming" | "ready" | "submitted" | "error";
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
    }
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
    status = "ready",
    onDelete,
    onEdit,
    onReload,
    onBranch,
    autoScroll = true,
    selectedModel,
    isUserAuthenticated = false,
    isReasoningModel = false,
    reasoningEffort = "medium",
  }: ConversationProps) => {
    const initialMessageCount = useRef(messages.length);
    const containerRef = useRef<HTMLDivElement>(null);

    // Check if the selected model is an image generation model
    const isImageGenerationModel =
      selectedModel &&
      MODELS_MAP[selectedModel]?.features?.some(
        (feature) => feature.id === "image-generation" && feature.enabled
      );

    if (!messages || messages.length === 0) {
      return <div className="h-full w-full" />;
    }

    // console.log('Rendering messages:', messages);

    return (
      <div className="relative flex h-full w-full flex-col items-center overflow-y-auto overflow-x-hidden">
        <ChatContainer
          autoScroll={autoScroll}
          className="relative flex w-full flex-col items-center pt-20 pb-4"
          ref={containerRef}
          style={{
            scrollbarGutter: "stable both-edges",
          }}
        >
          {messages?.map((message, index) => {
            const isLast =
              index === messages.length - 1 && status !== "submitted";
            const hasScrollAnchor =
              isLast && messages.length > initialMessageCount.current;

            return (
              <Message
                hasScrollAnchor={hasScrollAnchor}
                id={message.id}
                isLast={isLast}
                isReasoningModel={isReasoningModel}
                isUserAuthenticated={isUserAuthenticated}
                key={message.id}
                metadata={message.metadata}
                model={message.model}
                onBranch={() => onBranch(message.id)}
                onDelete={onDelete}
                onEdit={onEdit}
                onReload={() => onReload(message.id)}
                parts={message.parts}
                reasoningEffort={reasoningEffort}
                selectedModel={selectedModel}
                status={status}
                variant={message.role}
              />
            );
          })}
          {((status === "submitted" &&
            messages.length > 0 &&
            messages.at(-1)?.role === "user") ||
            (status === "streaming" &&
              isImageGenerationModel &&
              messages.length > 0 &&
              (messages.at(-1)?.role === "user" ||
                (messages.at(-1)?.role === "assistant" &&
                  !messages
                    .at(-1)
                    ?.parts?.some((part) => part.type === "file"))))) && (
            <div className="group flex min-h-scroll-anchor w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
              {isImageGenerationModel ? (
                <ImageSkeleton height={300} width={300} />
              ) : (
                <Loader size="md" variant="dots" />
              )}
            </div>
          )}
        </ChatContainer>
        <div className="absolute bottom-0 w-full max-w-3xl">
          <ScrollButton
            className="absolute top-[-50px] right-[30px]"
            containerRef={containerRef}
          />
        </div>
      </div>
    );
  }
);

export { Conversation };
