"use client";

import { type UIMessage, useChat } from "@ai-sdk/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { useConvex } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Conversation,
  type MessageWithExtras,
} from "@/app/components/chat/conversation";
import { ChatInput } from "@/app/components/chat-input/chat-input";
import { useChatOperations } from "@/app/hooks/use-chat-operations";
import { useChatValidation } from "@/app/hooks/use-chat-validation";
import { useDocumentTitle } from "@/app/hooks/use-document-title";
import { useFileHandling } from "@/app/hooks/use-file-handling";
import { useChatSession } from "@/app/providers/chat-session-provider";
import { useUser } from "@/app/providers/user-provider";
import { toast } from "@/components/ui/toast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createChatErrorHandler } from "@/lib/chat-error-utils";
import { MODEL_DEFAULT } from "@/lib/config";
import {
  createOptimisticAttachments,
  revokeOptimisticAttachments,
  uploadFilesInParallel,
} from "@/lib/file-upload-utils";
import {
  createPlaceholderId,
  mapMessage,
  validateInput,
} from "@/lib/message-utils";
import {
  createModelValidator,
  supportsReasoningEffort,
} from "@/lib/model-utils";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { API_ROUTE_CHAT } from "@/lib/routes";
import {
  getDisplayName,
  getUserTimezone,
  isUserAuthenticated,
} from "@/lib/user-utils";
import { cn } from "@/lib/utils";

// Schema for chat body
const ChatBodySchema = z.object({
  chatId: z.string(),
  model: z.string(),
  personaId: z.string().optional(),
  enableSearch: z.boolean().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  userInfo: z
    .object({
      timezone: z.string().optional(),
    })
    .optional(),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

// Dynamic imports
const DialogAuth = dynamic(
  () => import("./dialog-auth").then((mod) => mod.DialogAuth),
  { ssr: false }
);

export default function Chat() {
  const { chatId, isDeleting, setIsDeleting } = useChatSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    hasPremium,
    isLoading: isUserLoading,
    hasApiKey,
    isApiKeysLoading,
  } = useUser();

  // Initialize utilities
  const getValidModel = useMemo(() => createModelValidator(), []);
  const _convex = useConvex();

  // Connector status is calculated server-side for security

  // Custom hooks
  const {
    handleCreateChat,
    handleModelChange: handleModelUpdate,
    handleBranch,
    handleDeleteMessage,
  } = useChatOperations();

  const { checkRateLimits, validateModelAccess, validateSearchQuery } =
    useChatValidation();

  const {
    files,
    addFiles,
    removeFile,
    clearFiles,
    processFiles,
    createOptimisticFiles,
    hasFiles,
    uploadFile,
    saveFileAttachment,
  } = useFileHandling();

  // Local state
  const [hasDialogAuth, setHasDialogAuth] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<
    "low" | "medium" | "high"
  >("low");
  const [tempPersonaId, setTempPersonaId] = useState<string | undefined>();
  const [tempSelectedModel, setTempSelectedModel] = useState<
    string | undefined
  >();
  const processedUrl = useRef(false);

  // Data queries
  const { data: messagesFromDB } = useTanStackQuery({
    ...convexQuery(
      api.messages.getMessagesForChat,
      chatId ? { chatId: chatId as Id<"chats"> } : "skip"
    ),
    enabled: Boolean(chatId),
  });

  const { data: currentChat } = useTanStackQuery({
    ...convexQuery(
      api.chats.getChat,
      chatId ? { chatId: chatId as Id<"chats"> } : "skip"
    ),
    enabled: Boolean(chatId),
  });

  // Derived state
  const selectedModel = useMemo(() => {
    if (currentChat?.model) {
      return getValidModel(currentChat.model, user?.disabledModels);
    }
    const preferredModel =
      tempSelectedModel ?? user?.preferredModel ?? MODEL_DEFAULT;
    return getValidModel(preferredModel, user?.disabledModels);
  }, [
    currentChat?.model,
    tempSelectedModel,
    user?.preferredModel,
    user?.disabledModels,
    getValidModel,
  ]);

  const personaId = currentChat?.personaId ?? tempPersonaId;
  const isAuthenticated = isUserAuthenticated(user);

  // Enhanced useChat hook with AI SDK best practices
  const { messages, status, regenerate, stop, setMessages, sendMessage } =
    useChat({
      transport: new DefaultChatTransport({
        api: API_ROUTE_CHAT,
        // Global configuration
        headers: {
          "Content-Type": "application/json",
        },
      }),
      // AI SDK error handling
      onError: createChatErrorHandler(),
    });

  // Message synchronization effect - optimized to prevent infinite re-renders
  useEffect(() => {
    if (
      (status !== "ready" && status !== "error") ||
      !messagesFromDB ||
      isDeleting
    ) {
      return;
    }

    const mappedDb = messagesFromDB.map((msg, index) => {
      const mappedMessage = mapMessage(msg) as MessageWithExtras;

      if (msg.role === "user") {
        // Next message is always the assistant response
        const nextMsg = messagesFromDB[index + 1];
        if (nextMsg?.role === "assistant") {
          if (nextMsg.metadata?.modelId) {
            mappedMessage.model = nextMsg.metadata.modelId;
          }
          // Copy search setting from assistant's metadata to the user message metadata
          if (nextMsg.metadata?.includeSearch !== undefined) {
            mappedMessage.metadata = {
              ...mappedMessage.metadata,
              includeSearch: nextMsg.metadata.includeSearch,
            };
          }
        }
      } else if (msg.role === "assistant" && msg.metadata?.modelId) {
        mappedMessage.model = msg.metadata.modelId;
      }

      return mappedMessage;
    });

    // Use functional update to access current messages without creating a dependency
    setMessages((currentMessages) => {
      // Early return if DB is empty
      if (mappedDb.length === 0) {
        return currentMessages;
      }

      // Check if we need to update at all by comparing lengths and IDs
      if (
        mappedDb.length === currentMessages.length &&
        mappedDb.every((dbMsg, idx) => dbMsg.id === currentMessages[idx]?.id)
      ) {
        return currentMessages; // No change needed - prevents unnecessary re-renders
      }

      if (mappedDb.length >= currentMessages.length) {
        // DB is up-to-date or ahead – merge to preserve streaming properties
        const merged = mappedDb.map((dbMsg: UIMessage, idx: number) => {
          const prev = currentMessages[idx];
          if (prev?.parts && !dbMsg.parts) {
            return { ...dbMsg, parts: prev.parts };
          }
          return dbMsg;
        });
        return merged;
      }
      if (mappedDb.length > 0) {
        // DB is behind: merge IDs for the portion we have without dropping optimistic messages
        const merged = currentMessages.map((msg, idx) => {
          if (idx < mappedDb.length) {
            const dbMsg = mappedDb[idx];
            return {
              ...msg,
              id: dbMsg.id,
              parts: msg.parts ?? dbMsg.parts,
            };
          }
          return msg;
        });
        return merged;
      }

      return currentMessages;
    });
  }, [messagesFromDB, status, setMessages, isDeleting]);

  // Reset state for new chats
  useEffect(() => {
    if ((status === "ready" || status === "error") && !chatId) {
      setMessages([]);
      setTempPersonaId(undefined);
      setTempSelectedModel(undefined);
    }
  }, [status, chatId, setMessages]);

  // Core message sending function
  const sendMessageHelper = useCallback(
    async (
      inputMessage: string,
      currentChatId?: string,
      options?: { enableSearch?: boolean }
    ) => {
      const chatIdToUse = currentChatId || chatId;
      if (!chatIdToUse) {
        return;
      }

      const isReasoningModel = supportsReasoningEffort(selectedModel);
      const timezone = getUserTimezone();

      const body: ChatBody = {
        chatId: chatIdToUse,
        model: selectedModel,
        personaId,
        ...(typeof options?.enableSearch !== "undefined"
          ? { enableSearch: options.enableSearch }
          : {}),
        ...(isReasoningModel ? { reasoningEffort } : {}),
        ...(timezone ? { userInfo: { timezone } } : {}),
      };

      // Handle files if present
      let attachments: FileUIPart[] | undefined;
      if (hasFiles) {
        const optimisticAttachments = createOptimisticFiles();
        const placeholderId = createPlaceholderId();

        // Add optimistic message
        setMessages((cur) => [
          ...cur,
          {
            id: placeholderId,
            role: "user" as const,
            parts: [
              { type: "text", text: inputMessage },
              ...optimisticAttachments,
            ],
          },
        ]);

        try {
          attachments = await processFiles(chatIdToUse as Id<"chats">);
          // Remove placeholder and cleanup blob URLs
          setMessages((cur) => cur.filter((m) => m.id !== placeholderId));
          revokeOptimisticAttachments(optimisticAttachments);
        } catch {
          // Remove placeholder and cleanup blob URLs; rely on upload utils to toast errors
          setMessages((cur) => cur.filter((m) => m.id !== placeholderId));
          revokeOptimisticAttachments(optimisticAttachments);
          return;
        }
      }

      // Send message with AI SDK
      try {
        const messageParts = [
          { type: "text" as const, text: inputMessage },
          ...(attachments || []),
        ];

        await sendMessage({ parts: messageParts, role: "user" }, { body });
      } catch {
        toast({ title: "Failed to send message", status: "error" });
      }
    },
    [
      chatId,
      selectedModel,
      personaId,
      reasoningEffort,
      hasFiles,
      createOptimisticFiles,
      processFiles,
      sendMessage,
      setMessages,
    ]
  );

  // URL parameter processing
  useEffect(() => {
    if (isUserLoading || isApiKeysLoading || !user || processedUrl.current) {
      return;
    }

    const modelId = searchParams.get("model");
    const query = searchParams.get("q");

    if (modelId && query) {
      processedUrl.current = true;

      const trimmedQuery = validateSearchQuery(query);
      if (!trimmedQuery) {
        return;
      }

      if (!validateModelAccess(modelId, user, hasPremium, hasApiKey)) {
        return;
      }

      const startChat = async () => {
        try {
          const newChatId = await handleCreateChat(
            trimmedQuery,
            modelId,
            personaId
          );
          if (newChatId) {
            window.history.pushState(null, "", `/c/${newChatId}`);
            await sendMessageHelper(trimmedQuery, newChatId, {
              enableSearch: false,
            });
          }
        } catch {
          toast({ title: "Failed to create chat", status: "error" });
        }
      };

      startChat();
    }
  }, [
    isUserLoading,
    isApiKeysLoading,
    user,
    searchParams,
    hasPremium,
    hasApiKey,
    handleCreateChat,
    personaId,
    validateSearchQuery,
    validateModelAccess,
    sendMessageHelper,
  ]);

  // Main submit handler
  const submit = useCallback(
    async (
      inputMessage: string,
      opts?: { body?: { enableSearch?: boolean } }
    ) => {
      if (!validateInput(inputMessage, files.length, user?._id)) {
        return;
      }

      const allowed = checkRateLimits(isAuthenticated, setHasDialogAuth);
      if (!allowed) {
        return;
      }

      let currentChatId = chatId;

      // Create chat if needed
      if (!currentChatId && messages.length === 0 && inputMessage) {
        currentChatId = await handleCreateChat(
          inputMessage,
          selectedModel,
          personaId
        );
        if (!currentChatId) {
          return;
        }

        window.history.pushState(null, "", `/c/${currentChatId}`);
        setTempSelectedModel(undefined);
        setTempPersonaId(undefined);
      }

      clearFiles();
      await sendMessageHelper(
        inputMessage,
        currentChatId || undefined,
        opts?.body
      );
    },
    [
      files.length,
      user?._id,
      checkRateLimits,
      isAuthenticated,
      chatId,
      messages.length,
      handleCreateChat,
      selectedModel,
      personaId,
      clearFiles,
      sendMessageHelper,
    ]
  );

  // Model change handler
  const handleModelChange = useCallback(
    async (model: string) => {
      // Allow anonymous and logged-in users to change the model selection in UI.
      // For new chats (no chatId yet), store temporarily.
      if (!chatId) {
        setTempSelectedModel(model);
        return;
      }

      // For existing chats, persist via mutation. Server validates access.
      await handleModelUpdate(chatId, model, user);
    },
    [chatId, user, handleModelUpdate]
  );

  // Message handlers
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleDelete = useCallback(
    async (id: string) => {
      const currentMessages = messagesRef.current;
      const originalMessages = [...currentMessages];
      const idx = originalMessages.findIndex((m) => m.id === id);

      if (idx === -1) {
        return;
      }

      const filteredMessages = originalMessages.slice(0, idx);
      setMessages(filteredMessages);
      setIsDeleting(true);

      try {
        const result = await handleDeleteMessage(id);
        if (result?.chatDeleted) {
          router.push("/");
        } else {
          setIsDeleting(false);
        }
      } catch {
        setMessages(originalMessages);
        setIsDeleting(false);
      }
    },
    [handleDeleteMessage, router, setIsDeleting, setMessages]
  );

  const handleReload = useCallback(
    async (messageId: string, opts?: { enableSearch?: boolean }) => {
      if (!(user?._id && chatId)) {
        return;
      }

      const currentMessages = messagesRef.current;
      const originalMessages = [...currentMessages];
      const targetIdx = originalMessages.findIndex((m) => m.id === messageId);

      if (targetIdx === -1) {
        return;
      }

      const trimmedMessages = originalMessages.slice(0, targetIdx + 1);
      setMessages(trimmedMessages);

      const firstFollowing = originalMessages[targetIdx + 1];
      if (firstFollowing) {
        setIsDeleting(true);
        try {
          await handleDeleteMessage(firstFollowing.id);
        } catch {
          setMessages(originalMessages);
          toast({
            title: "Failed to delete messages for reload",
            status: "error",
          });
        } finally {
          setIsDeleting(false);
        }
      }

      const isReasoningModel = supportsReasoningEffort(selectedModel);
      const timezone = getUserTimezone();

      const options = {
        body: {
          chatId,
          model: selectedModel,
          personaId,
          reloadAssistantMessageId: messageId,
          ...(typeof opts?.enableSearch !== "undefined"
            ? { enableSearch: opts.enableSearch }
            : {}),
          ...(isReasoningModel ? { reasoningEffort } : {}),
          ...(timezone ? { userInfo: { timezone } } : {}),
        },
      };
      regenerate(options);
    },
    [
      user,
      chatId,
      selectedModel,
      personaId,
      reasoningEffort,
      setMessages,
      handleDeleteMessage,
      setIsDeleting,
      regenerate,
    ]
  );

  const handleEdit = useCallback(
    async (
      id: string,
      newText: string,
      editOptions: {
        model: string;
        enableSearch: boolean;
        files: File[];
        reasoningEffort: "low" | "medium" | "high";
        removedFileUrls?: string[];
      }
    ) => {
      if (!chatId) {
        return;
      }

      const originalMessages = [...messagesRef.current];
      const targetIdx = originalMessages.findIndex((m) => m.id === id);

      if (targetIdx === -1) {
        return;
      }

      // Helper function to filter out optimistic (blob URL) files
      const getNonOptimisticFiles = (parts: UIMessage["parts"]) =>
        (parts || [])
          .filter((part): part is FileUIPart => part.type === "file")
          .filter(
            (file) =>
              !(typeof file.url === "string" && file.url.startsWith("blob:"))
          );

      // No-op guard: Check if edit has no substantive changes
      const originalMessage = originalMessages[targetIdx] as MessageWithExtras;
      const originalText =
        originalMessage.parts?.find((p) => p.type === "text")?.text || "";

      // Get current settings for comparison
      const originalModel = originalMessage.model || selectedModel;
      const originalSearch = originalMessage.metadata?.includeSearch ?? false;
      const originalEffort =
        originalMessage.metadata?.reasoningEffort || reasoningEffort;

      // Return early if nothing has changed
      if (
        originalText.trim() === newText.trim() &&
        editOptions.files.length === 0 &&
        originalModel === editOptions.model &&
        originalSearch === editOptions.enableSearch &&
        originalEffort === editOptions.reasoningEffort &&
        (editOptions.removedFileUrls?.length ?? 0) === 0
      ) {
        return;
      }

      // Process new files if any were added
      const hasNewFiles = editOptions.files.length > 0;
      let optimisticFileParts: FileUIPart[] = [];

      if (hasNewFiles) {
        // Create optimistic attachments for immediate UI feedback
        optimisticFileParts = createOptimisticAttachments(editOptions.files);
      }

      try {
        const removedSet = new Set(
          (editOptions.removedFileUrls || []).map((u) => u.split("?")[0])
        );
        // 1. Update message content and remove subsequent messages immediately
        setMessages((currentMsgs) => {
          const editTargetIdx = currentMsgs.findIndex((m) => m.id === id);
          if (editTargetIdx === -1) {
            return currentMsgs;
          }

          // Single pass: slice and update in one operation
          return currentMsgs.slice(0, editTargetIdx + 1).map((msg, idx) => {
            // Only create new object for the edited message
            if (idx !== editTargetIdx) {
              return msg; // Return unchanged reference
            }

            // Update only the edited message
            const existingNonOptimisticFiles = getNonOptimisticFiles(msg.parts);
            const filteredExisting = existingNonOptimisticFiles.filter((f) => {
              const url = typeof f.url === "string" ? f.url.split("?")[0] : "";
              return !removedSet.has(url);
            });

            return {
              ...msg,
              parts: [
                { type: "text" as const, text: newText },
                ...filteredExisting,
                ...optimisticFileParts, // Include optimistic files for immediate feedback
              ],
            };
          });
        });

        // 2. Upload files if any (replace optimistic with real files after upload)
        if (hasNewFiles) {
          try {
            const newFileParts = await uploadFilesInParallel(
              editOptions.files,
              chatId as Id<"chats">,
              uploadFile,
              ({ chatId: cid, key, fileName }) =>
                saveFileAttachment({ chatId: cid, key, fileName })
            );

            // Update again to replace optimistic files with uploaded files
            setMessages((currentMsgs) => {
              const editIdx = currentMsgs.findIndex((m) => m.id === id);
              if (editIdx === -1) {
                return currentMsgs;
              }

              const next = currentMsgs.map((msg, idx) => {
                if (idx !== editIdx) {
                  return msg;
                }

                // Remove blob URLs and add real uploaded files
                const nonBlobFiles = getNonOptimisticFiles(msg.parts).filter(
                  (f) => {
                    const url =
                      typeof f.url === "string" ? f.url.split("?")[0] : "";
                    return !removedSet.has(url);
                  }
                );

                return {
                  ...msg,
                  parts: [
                    { type: "text" as const, text: newText },
                    ...nonBlobFiles,
                    ...newFileParts, // Real uploaded files
                  ],
                };
              });
              // Cleanup any previously created blob URLs now that we've replaced them
              revokeOptimisticAttachments(optimisticFileParts);
              return next;
            });
          } catch (_error) {
            // Rollback on file upload failure
            revokeOptimisticAttachments(optimisticFileParts);
            setMessages(originalMessages);
            return; // Abort edit on file upload failure
          }
        }

        // 3. Trigger AI regeneration using the edit-specific model and settings
        const isEditReasoningModel = supportsReasoningEffort(editOptions.model);
        const timezone = getUserTimezone();

        const options = {
          body: {
            chatId,
            model: editOptions.model, // Use the model selected in edit mode
            personaId,
            editMessageId: id,
            enableSearch: editOptions.enableSearch, // Use edit-specific search setting
            ...(isEditReasoningModel
              ? { reasoningEffort: editOptions.reasoningEffort }
              : {}),
            ...(timezone ? { userInfo: { timezone } } : {}),
          },
        };

        await regenerate(options);
      } catch {
        // Rollback on failure - restore all original messages
        setMessages(originalMessages);
        toast({
          title: "Failed to update message",
          status: "error",
        });
      }
    },
    [
      chatId,
      personaId,
      setMessages,
      regenerate,
      uploadFile,
      saveFileAttachment,
      selectedModel,
      reasoningEffort,
    ]
  );

  // Chat redirect effect
  useEffect(() => {
    if (!isUserLoading && chatId && currentChat === null && !isDeleting) {
      router.replace("/");
    }
  }, [chatId, currentChat, isUserLoading, router, isDeleting]);

  // Document title update
  useDocumentTitle(currentChat?.title, chatId || undefined);

  // Message scrolling
  const targetMessageId = searchParams.get("m");
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (targetMessageId) {
      hasScrolledRef.current = false;
    }
  }, [targetMessageId]);

  useEffect(() => {
    if (!targetMessageId || hasScrolledRef.current || messages.length === 0) {
      return;
    }
    const el = document.getElementById(targetMessageId);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      hasScrolledRef.current = true;
    }
  }, [targetMessageId, messages]);

  // Early return for redirect
  if (currentChat === null && chatId) {
    return null;
  }

  return (
    <div
      className={cn(
        "@container/main relative flex h-full flex-col items-center justify-end md:justify-center"
      )}
    >
      <DialogAuth open={hasDialogAuth} setOpen={setHasDialogAuth} />

      <AnimatePresence initial={false} mode="popLayout">
        {!chatId && messages.length === 0 ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute bottom-[60%] mx-auto max-w-[50rem] md:relative md:bottom-auto"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="onboarding"
            layout="position"
            layoutId="onboarding"
            transition={{ layout: { duration: 0 } }}
          >
            <h1 className="mb-6 font-medium text-3xl tracking-tight">
              {(() => {
                const displayName = getDisplayName(user);
                return displayName
                  ? `What's on your mind, ${displayName}?`
                  : "What's on your mind?";
              })()}
            </h1>
          </motion.div>
        ) : (
          <Conversation
            autoScroll={!targetMessageId}
            isReasoningModel={supportsReasoningEffort(selectedModel)}
            isUserAuthenticated={isAuthenticated}
            key="conversation"
            messages={messages as MessageWithExtras[]}
            onBranch={(messageId) =>
              chatId && handleBranch(chatId, messageId, user)
            }
            onDelete={handleDelete}
            onEdit={handleEdit}
            onReload={handleReload}
            reasoningEffort={reasoningEffort}
            selectedModel={selectedModel}
            status={status}
          />
        )}
      </AnimatePresence>

      <motion.div
        className={cn(
          "relative inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl"
        )}
        layout="position"
        layoutId="chat-input-container"
        transition={{
          layout: {
            ...TRANSITION_LAYOUT,
            duration: messages.length === 1 ? 0.2 : 0,
          },
        }}
      >
        <ChatInput
          files={files}
          hasSuggestions={!chatId && messages.length === 0}
          isReasoningModel={supportsReasoningEffort(selectedModel)}
          isSubmitting={status === "streaming"}
          isUserAuthenticated={isAuthenticated}
          onFileRemoveAction={removeFile}
          onFileUploadAction={addFiles}
          onSelectModelAction={handleModelChange}
          onSelectReasoningEffortAction={setReasoningEffort}
          onSelectSystemPromptAction={(id: string) => setTempPersonaId(id)}
          onSendAction={(
            message: string,
            { enableSearch }: { enableSearch: boolean }
          ) => submit(message, { body: { enableSearch } })}
          onSuggestionAction={(suggestion: string) =>
            sendMessage({ text: suggestion })
          }
          reasoningEffort={reasoningEffort}
          selectedModel={selectedModel}
          selectedPersonaId={personaId}
          status={status}
          stopAction={stop}
        />
      </motion.div>
    </div>
  );
}
