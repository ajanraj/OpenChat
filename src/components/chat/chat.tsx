import { Chat as ChatInstance, useChat } from "@ai-sdk/react";
import type { UIMessage } from "@ai-sdk/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FileUIPart } from "ai";
import { AnimatePresence, m } from "motion/react";
import {
	createContext,
	lazy,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
} from "react";
import { z } from "zod";
import {
	Conversation,
	type MessageWithExtras,
} from "@/components/chat/conversation";
import { ChatInput } from "@/components/chat-input/chat-input";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { useChatOperations } from "@/hooks/use-chat-operations";
import { useChatValidation } from "@/hooks/use-chat-validation";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useFileHandling } from "@/hooks/use-file-handling";
import { createChatErrorHandler } from "@/lib/chat-error-utils";
import { chatTransport, setChatAuthToken } from "@/lib/chat-transport";
import {
	MODEL_DEFAULT,
	MODELS_MAP,
	ReasoningEffortSchema,
	type ReasoningEffort,
} from "@/lib/config";
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
	getDefaultReasoningEffort,
	getReasoningEffortOptions,
	supportsReasoningEffort,
} from "@/lib/model-utils";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT } from "@/lib/hotkey-events";
import {
	getDisplayName,
	getUserTimezone,
	isUserAuthenticated,
} from "@/lib/user-utils";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/providers/chat-session-provider";
import { useProfile } from "@/providers/profile-provider";
import { useUser } from "@/providers/user-provider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const DRAFT_CHAT_KEY = "draft-chat";
const chatRegistry = new Map<string, ChatInstance<MessageWithExtras>>();
const chatIdentityRegistry = new WeakMap<object, number>();
let chatIdentityCounter = 0;

function promoteDraftChatToReal(chatId: string) {
	if (!chatId || chatRegistry.has(chatId)) {
		return;
	}
	const draftChat = chatRegistry.get(DRAFT_CHAT_KEY);
	if (!draftChat) {
		return;
	}
	// Keep internal Chat id aligned with real chat key.
	// AI SDK transport uses chat.id as request chatId.
	void Reflect.set(draftChat, "id", chatId);
	// Move the SAME Chat instance to the real key so in-flight
	// sendMessage / streaming keeps working across navigation.
	chatRegistry.set(chatId, draftChat);
	chatRegistry.delete(DRAFT_CHAT_KEY);
}

const MAX_REGISTRY_SIZE = 20;

function evictOldestChats() {
	if (chatRegistry.size <= MAX_REGISTRY_SIZE) {
		return;
	}
	const keysToEvict = [...chatRegistry.keys()].slice(
		0,
		chatRegistry.size - MAX_REGISTRY_SIZE,
	);
	for (const key of keysToEvict) {
		cleanupChatInstance(key);
	}
}

function cleanupChatInstance(chatId: string) {
	const instance = chatRegistry.get(chatId);
	if (instance && instance.status !== "ready") {
		void instance.stop();
	}
	chatRegistry.delete(chatId);
}

function getChatIdentity(instance: ChatInstance<MessageWithExtras>) {
	const existing = chatIdentityRegistry.get(instance);
	if (existing) {
		return existing;
	}
	chatIdentityCounter += 1;
	chatIdentityRegistry.set(instance, chatIdentityCounter);
	return chatIdentityCounter;
}

const ChatInstanceContext = createContext<ChatInstance<MessageWithExtras> | null>(null);

function useChatInstance(): ChatInstance<MessageWithExtras> {
	const instance = useContext(ChatInstanceContext);
	if (!instance) {
		throw new Error("useChatInstance must be used within ChatInstanceContext.Provider");
	}
	return instance;
}

// Schema for chat body
const ChatBodySchema = z.object({
	chatId: z.string(),
	model: z.string(),
	personaId: z.string().optional(),
	profileId: z.string().optional(),
	enableSearch: z.boolean().optional(),
	reasoningEffort: ReasoningEffortSchema.optional(),
	userInfo: z
		.object({
			timezone: z.string().optional(),
		})
		.optional(),
});

type ChatBody = z.infer<typeof ChatBodySchema>;

// Dynamic imports
const DialogAuth = lazy(() =>
	import("./dialog-auth").then((mod) => ({ default: mod.DialogAuth })),
);

function ChatContent() {
	return useChatContentView();
}

function useChatContentView() {
	const { chatId, isDeleting, setIsDeleting } = useChatSession();
	const router = useRouter();
	const searchParams = useSearch({ strict: false }) as Record<
		string,
		string | undefined
	>;
	const {
		user,
		hasPremium,
		isLoading: isUserLoading,
		hasApiKey,
		isApiKeysLoading,
		ensureSession,
	} = useUser();

	// Initialize utilities
	const getValidModel = useMemo(() => createModelValidator(), []);

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
	const deleteChat = useMutation(api.chats.deleteChat);

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
	type ChatUIState = {
		hasDialogAuth: boolean;
		isStartingChat: boolean;
		reasoningEffort: ReasoningEffort;
		tempPersonaId: string | undefined;
		tempSelectedModel: string | undefined;
		showDeleteChatDialog: boolean;
		/** A ?q= link's query whose start didn't go out, back in the input to send again. */
		urlDraft: string | undefined;
	};
	type ChatUIAction =
		| { type: "SET_DIALOG_AUTH"; value: boolean }
		| { type: "SET_STARTING_CHAT"; value: boolean }
		| { type: "SET_REASONING_EFFORT"; value: ReasoningEffort }
		| { type: "SET_TEMP_PERSONA"; id: string | undefined }
		| { type: "SET_TEMP_MODEL"; model: string | undefined }
		| { type: "SET_DELETE_CHAT_DIALOG"; value: boolean }
		| { type: "RESTORE_URL_START"; query: string; model: string }
		| { type: "CLEAR_TEMP" };

	const [chatUIState, dispatchUI] = useReducer(
		(s: ChatUIState, action: ChatUIAction): ChatUIState => {
			switch (action.type) {
				case "SET_DIALOG_AUTH":
					return { ...s, hasDialogAuth: action.value };
				case "SET_STARTING_CHAT":
					return { ...s, isStartingChat: action.value };
				case "SET_REASONING_EFFORT":
					return { ...s, reasoningEffort: action.value };
				case "SET_TEMP_PERSONA":
					return { ...s, tempPersonaId: action.id };
				case "SET_TEMP_MODEL":
					return { ...s, tempSelectedModel: action.model };
				case "SET_DELETE_CHAT_DIALOG":
					return { ...s, showDeleteChatDialog: action.value };
				case "RESTORE_URL_START":
					return { ...s, urlDraft: action.query, tempSelectedModel: action.model };
				case "CLEAR_TEMP":
					return { ...s, tempPersonaId: undefined, tempSelectedModel: undefined };
			}
		},
		{ hasDialogAuth: false, isStartingChat: false, reasoningEffort: "none", tempPersonaId: undefined, tempSelectedModel: undefined, showDeleteChatDialog: false, urlDraft: undefined },
	);
	const { hasDialogAuth, isStartingChat, reasoningEffort, tempPersonaId, tempSelectedModel, showDeleteChatDialog, urlDraft } = chatUIState;
	// Starting a chat spans several round trips (guest sign-in, createChat) before the chat's own
	// status shows a request. Every start (a send, or ?q= in the URL) runs through here, one at a
	// time, so a second send in that window can't start a second chat. Resolves whether the start
	// sent its message.
	const startingChatRef = useRef(false);
	const runChatStart = useCallback(async (start: () => Promise<boolean>) => {
		if (startingChatRef.current) {
			return false;
		}
		startingChatRef.current = true;
		dispatchUI({ type: "SET_STARTING_CHAT", value: true });
		try {
			return await start();
		} finally {
			startingChatRef.current = false;
			dispatchUI({ type: "SET_STARTING_CHAT", value: false });
		}
	}, []);
	const processedUrl = useRef(false);
	const retiredFallbackChatIds = useRef(new Set<string>());

	// Data queries
	const { data: messagesFromDB } = useTanStackQuery({
		...convexQuery(
			api.messages.getMessagesForChat,
			chatId ? { chatId: chatId as Id<"chats"> } : "skip",
		),
		enabled: Boolean(chatId),
	});

	const { data: currentChat, isLoading: isChatLoading } = useTanStackQuery({
		...convexQuery(
			api.chats.getChat,
			chatId ? { chatId: chatId as Id<"chats"> } : "skip",
		),
		enabled: Boolean(chatId),
	});

	// Derived state
	const { activeProfile, isProfilesLoading } = useProfile();
	// A returning user's saved model and profile, and an open chat's own settings, load after the
	// page does. A send reads them when it starts, so sends wait for them (isUserLoading also covers
	// a session whose user hasn't arrived, and a signed-out one whose user hasn't cleared)
	const isSettingsLoading = isUserLoading || isProfilesLoading || isChatLoading;
	const disabledModels = activeProfile?.disabledModels ?? user?.disabledModels;
	const currentChatModelId = currentChat?.model;
	const retiredChatModel = currentChatModelId
		? MODELS_MAP[currentChatModelId]
		: undefined;
	const isRetiredChatModel = retiredChatModel?.retired === true;
	const selectedModel = isRetiredChatModel
		? MODEL_DEFAULT
		: currentChatModelId
		? getValidModel(currentChatModelId, disabledModels)
		: getValidModel(
				tempSelectedModel ?? activeProfile?.preferredModel ?? user?.preferredModel ?? MODEL_DEFAULT,
				disabledModels,
			);
	const reasoningEffortOptions = getReasoningEffortOptions(selectedModel);
	const selectedReasoningEffort = reasoningEffortOptions.includes(reasoningEffort)
		? reasoningEffort
		: (getDefaultReasoningEffort(selectedModel) ?? reasoningEffort);

	const personaId = currentChat?.personaId ?? tempPersonaId;
	const isAuthenticated = isUserAuthenticated(user);
	// Only signed-in accounts can attach files. The view stays mounted when one signs out, so drop
	// what it attached rather than send it from a guest account (sends wait until the user clears)
	if (!isAuthenticated && files.length > 0) {
		clearFiles();
	}

	useEffect(() => {
		if (
			!chatId ||
			!isRetiredChatModel ||
			retiredFallbackChatIds.current.has(chatId)
		) {
			return;
		}

		retiredFallbackChatIds.current.add(chatId);
		void (async () => {
			const updated = await handleModelUpdate(chatId, MODEL_DEFAULT, null);
			if (!updated) {
				retiredFallbackChatIds.current.delete(chatId);
				return;
			}

			const retiredName = retiredChatModel?.name ?? currentChatModelId;
			const fallbackName = MODELS_MAP[MODEL_DEFAULT]?.name ?? MODEL_DEFAULT;
			toast({
				title: "Model updated",
				description: `${retiredName} was retired. This chat now uses ${fallbackName}.`,
				status: "info",
			});
		})();
	}, [
		chatId,
		currentChatModelId,
		handleModelUpdate,
		isRetiredChatModel,
		retiredChatModel?.name,
	]);

	// Get chat instance from context and bind useChat
	const chatInstance = useChatInstance();
	const { messages, status, sendMessage, regenerate, setMessages, stop } = useChat<MessageWithExtras>({
		chat: chatInstance,
	});

	// Message synchronization effect - optimized to prevent infinite re-renders
	useEffect(() => {
		if (
			!chatId ||
			(status !== "ready" && status !== "error") ||
			!messagesFromDB ||
			isDeleting
		) {
			return;
		}

		const mappedDb: MessageWithExtras[] = messagesFromDB.map((msg, index) => {
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
					if (nextMsg.metadata?.reasoningEffort !== undefined) {
						mappedMessage.metadata = {
							...mappedMessage.metadata,
							reasoningEffort: nextMsg.metadata.reasoningEffort,
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

			const getCurrentServerId = (msg?: UIMessage) =>
				(msg as MessageWithExtras | undefined)?.serverId ?? msg?.id;

			// Check if we need to update at all by comparing lengths and server IDs
			if (
				mappedDb.length === currentMessages.length &&
				mappedDb.every(
					(dbMsg, idx) =>
						dbMsg.id === getCurrentServerId(currentMessages[idx]),
				)
			) {
				return currentMessages; // No change needed - prevents unnecessary re-renders
			}

			if (mappedDb.length >= currentMessages.length) {
				// DB is up-to-date or ahead – merge to preserve client IDs and parts
				const merged = mappedDb.map((dbMsg, idx: number) => {
					const prev = currentMessages[idx] as MessageWithExtras | undefined;
					if (!prev) {
						return {
							...dbMsg,
							clientId: dbMsg.id,
							serverId: dbMsg.id,
						};
					}
					const clientId = prev.clientId ?? prev.id;
					return {
						...dbMsg,
						id: clientId,
						clientId,
						serverId: prev.serverId ?? dbMsg.id,
						parts: prev.parts ?? dbMsg.parts,
					};
				});
				return merged;
			}
			if (mappedDb.length > 0) {
				// DB is behind: merge server IDs without replacing client IDs or parts
				const merged = currentMessages.map((msg, idx) => {
					if (idx < mappedDb.length) {
						const dbMsg = mappedDb[idx];
						const clientId = (msg as MessageWithExtras).clientId ?? msg.id;
						return {
							...msg,
							id: clientId,
							clientId,
							serverId: (msg as MessageWithExtras).serverId ?? dbMsg.id,
							parts: msg.parts ?? dbMsg.parts,
						};
					}
					return msg;
				});
				return merged;
			}

			return currentMessages;
		});
	}, [chatId, messagesFromDB, status, setMessages, isDeleting]);

	// Core message sending function. Resolves whether the message went out.
	const sendMessageHelper = useCallback(
		async (
			inputMessage: string,
			currentChatId?: string,
			options?: { enableSearch?: boolean },
		): Promise<boolean> => {
			const chatIdToUse = currentChatId || chatId;
			if (!chatIdToUse) {
				return false;
			}

			const isReasoningModel = supportsReasoningEffort(selectedModel);
			const timezone = getUserTimezone();

			const body: ChatBody = {
				chatId: chatIdToUse,
				model: selectedModel,
				personaId,
				profileId: activeProfile?._id,
				...(typeof options?.enableSearch !== "undefined"
					? { enableSearch: options.enableSearch }
					: {}),
				...(isReasoningModel ? { reasoningEffort: selectedReasoningEffort } : {}),
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
					return false;
				}
			}

			// Send message with AI SDK
			const messageParts = [
				{ type: "text" as const, text: inputMessage },
				...(attachments || []),
			];
			try {
				await sendMessage({ parts: messageParts, role: "user" }, { body });
			} catch {
				// The message is already in the conversation, so it counts as sent
				toast({ title: "Failed to send message", status: "error" });
			}
			return true;
		},
		[
			chatId,
			selectedModel,
			personaId,
			activeProfile?._id,
			selectedReasoningEffort,
			hasFiles,
			createOptimisticFiles,
			processFiles,
			sendMessage,
			setMessages,
		],
	);

	// URL parameter processing
	useEffect(() => {
		if (isSettingsLoading || isApiKeysLoading || processedUrl.current) {
			return;
		}

		const modelId = searchParams.model;
		const query = searchParams.q;

		if (modelId && query) {
			processedUrl.current = true;

			const trimmedQuery = validateSearchQuery(query);
			if (!trimmedQuery) {
				return;
			}

			if (!validateModelAccess(modelId, user, hasPremium, hasApiKey, disabledModels)) {
				return;
			}

				const startChat = async () => {
					await ensureSession();
					const newChatId = await handleCreateChat(
						trimmedQuery,
						modelId,
						personaId,
						activeProfile?._id,
					);
					if (!newChatId) {
						return false;
					}

					promoteDraftChatToReal(newChatId);
					void router.navigate({ to: `/c/${newChatId}` });
					await sendMessageHelper(trimmedQuery, newChatId, {
						enableSearch: false,
					});
					return true;
				};

				// The link is only processed once, so a start that didn't go out (e.g. the guest
				// session couldn't start) puts its query and model in the input to send again
				void runChatStart(startChat)
					.catch(() => {
						toast({ title: "Failed to create chat", status: "error" });
						return false;
					})
					.then((sent) => {
						if (!sent) {
							dispatchUI({ type: "RESTORE_URL_START", query: trimmedQuery, model: modelId });
						}
					});
			}
		}, [
		isSettingsLoading,
		isApiKeysLoading,
		user,
		searchParams,
		hasPremium,
		hasApiKey,
		handleCreateChat,
		personaId,
		activeProfile?._id,
		disabledModels,
		validateSearchQuery,
		validateModelAccess,
		sendMessageHelper,
		ensureSession,
		runChatStart,
	]);

	// Main submit handler. Resolves whether the message went out; when it didn't (invalid, rate
	// limited, or the session or chat couldn't start), the input gives the text back.
	const submit = useCallback(
		async (
			inputMessage: string,
			opts?: { body?: { enableSearch?: boolean } },
		): Promise<boolean> => {
			if (!validateInput(inputMessage, files.length)) {
				return false;
			}

			const allowed = checkRateLimits(isAuthenticated, (v) => dispatchUI({ type: "SET_DIALOG_AUTH", value: v }));
			if (!allowed) {
				return false;
			}

			const isNewChat = !chatId && messages.length === 0;
			const send = async () => {
				// A signed-out visitor's first message is what creates their guest account
				try {
					await ensureSession();
				} catch {
					toast({ title: "Couldn't start your session. Please try again.", status: "error" });
					return false;
				}

				let currentChatId = chatId;

				// Create chat if needed
				if (isNewChat && inputMessage) {
					currentChatId = await handleCreateChat(
						inputMessage,
						selectedModel,
						personaId,
						activeProfile?._id,
					);
					if (!currentChatId) {
						return false;
					}

					promoteDraftChatToReal(currentChatId);
					void router.navigate({ to: `/c/${currentChatId}` });
					dispatchUI({ type: "CLEAR_TEMP" });
				}

				// A new chat starts from text, so attachments alone stay in the input
				if (!currentChatId) {
					return false;
				}

				clearFiles();
				return sendMessageHelper(inputMessage, currentChatId, opts?.body);
			};

			return isNewChat ? runChatStart(send) : send();
		},
		[
			files.length,
			checkRateLimits,
			isAuthenticated,
			ensureSession,
			runChatStart,
			chatId,
			messages.length,
			handleCreateChat,
			selectedModel,
			personaId,
			activeProfile?._id,
			clearFiles,
			sendMessageHelper,
			router,
		],
	);

	// Model change handler
	const handleModelChange = useCallback(
		async (model: string) => {
			const nextEffortOptions = getReasoningEffortOptions(model);
			if (!nextEffortOptions.includes(reasoningEffort)) {
				const defaultEffort = getDefaultReasoningEffort(model);
				if (defaultEffort) {
					dispatchUI({ type: "SET_REASONING_EFFORT", value: defaultEffort });
				}
			}

			// Allow anonymous and logged-in users to change the model selection in UI.
			// For new chats (no chatId yet), store temporarily.
			if (!chatId) {
				dispatchUI({ type: "SET_TEMP_MODEL", model });
				return;
			}

			// For existing chats, persist via mutation. Server validates access.
			await handleModelUpdate(chatId, model, user);
		},
		[chatId, user, handleModelUpdate, reasoningEffort],
	);

	// Message handlers
	const messagesRef = useRef(messages);
	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);
	const getServerId = useCallback((id: string) => {
		const msg = messagesRef.current.find((m) => m.id === id);
		return (msg as MessageWithExtras | undefined)?.serverId ?? id;
	}, []);

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

			const result = await handleDeleteMessage(getServerId(id)).catch(() => null);
			if (!result) {
				setMessages(originalMessages);
				setIsDeleting(false);
				return;
			}

			if (result.chatDeleted) {
				if (chatId) {
					cleanupChatInstance(chatId);
				}
				router.navigate({ to: "/" });
				return;
			}

			setIsDeleting(false);
		},
		[handleDeleteMessage, router, setIsDeleting, setMessages, getServerId, chatId],
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
				const deletedFollowingMessage = await handleDeleteMessage(
					getServerId(firstFollowing.id),
				)
					.then(() => true)
					.catch(() => false);
				if (!deletedFollowingMessage) {
					setMessages(originalMessages);
					toast({
						title: "Failed to delete messages for reload",
						status: "error",
					});
				}
				setIsDeleting(false);
			}

			const isReasoningModel = supportsReasoningEffort(selectedModel);
			const timezone = getUserTimezone();
			const serverMessageId = getServerId(messageId);

			const options = {
				body: {
					chatId,
					model: selectedModel,
					personaId,
					profileId: activeProfile?._id,
					reloadAssistantMessageId: serverMessageId,
					...(typeof opts?.enableSearch !== "undefined"
						? { enableSearch: opts.enableSearch }
						: {}),
					...(isReasoningModel ? { reasoningEffort: selectedReasoningEffort } : {}),
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
			activeProfile?._id,
			selectedReasoningEffort,
			setMessages,
			handleDeleteMessage,
			setIsDeleting,
			regenerate,
			getServerId,
		],
	);

	const handleEdit = useCallback(
		async (
			id: string,
			newText: string,
			editOptions: {
				model: string;
				enableSearch: boolean;
				files: File[];
				reasoningEffort: ReasoningEffort;
				removedFileUrls?: string[];
			},
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
							!(typeof file.url === "string" && file.url.startsWith("blob:")),
					);

			// No-op guard: Check if edit has no substantive changes
			const originalMessage = originalMessages[targetIdx] as MessageWithExtras;
			const originalText =
				originalMessage.parts?.find((p) => p.type === "text")?.text || "";

			// Get current settings for comparison
			const originalModel = originalMessage.model || selectedModel;
			const originalSearch = originalMessage.metadata?.includeSearch ?? false;
			const originalEffort =
				originalMessage.metadata?.reasoningEffort || selectedReasoningEffort;

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
				const removedSet = new Set(
					(editOptions.removedFileUrls || []).map((u) => u.split("?")[0]),
				);
				const applyEdit = async () => {
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
						const newFileParts = await uploadFilesInParallel(
							editOptions.files,
							chatId as Id<"chats">,
							uploadFile,
							({ chatId: cid, key, fileName }) =>
								saveFileAttachment({ chatId: cid, key, fileName }),
						).catch(() => null);
						if (!newFileParts) {
							// Rollback on file upload failure
							revokeOptimisticAttachments(optimisticFileParts);
							setMessages(originalMessages);
							return; // Abort edit on file upload failure
						}

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
									},
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
					}

					// 3. Trigger AI regeneration using the edit-specific model and settings
					const isEditReasoningModel = supportsReasoningEffort(editOptions.model);
					const timezone = getUserTimezone();
					const serverMessageId = getServerId(id);

					const options = {
						body: {
							chatId,
							model: editOptions.model, // Use the model selected in edit mode
							personaId,
							profileId: activeProfile?._id,
							editMessageId: serverMessageId,
							enableSearch: editOptions.enableSearch, // Use edit-specific search setting
							...(isEditReasoningModel
								? { reasoningEffort: editOptions.reasoningEffort }
								: {}),
							...(timezone ? { userInfo: { timezone } } : {}),
						},
					};

					await regenerate(options);
				};
				const editApplied = await applyEdit()
					.then(() => true)
					.catch(() => false);
				if (!editApplied) {
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
			activeProfile?._id,
			setMessages,
			regenerate,
			uploadFile,
			saveFileAttachment,
			selectedModel,
			selectedReasoningEffort,
			getServerId,
		],
	);

	const handleDeleteCurrentChat = useCallback(async () => {
		if (!chatId || isDeleting) {
			return;
		}

		setIsDeleting(true);

		try {
			await deleteChat({ chatId: chatId as Id<"chats"> });
			cleanupChatInstance(chatId);
			dispatchUI({ type: "SET_DELETE_CHAT_DIALOG", value: false });
			void router.navigate({ to: "/" });
		} catch {
			setIsDeleting(false);
			toast({ title: "Failed to delete current chat", status: "error" });
		}
	}, [chatId, isDeleting, setIsDeleting, deleteChat, router]);

	useEffect(() => {
		const handleShortcutDeleteRequest = () => {
			if (!chatId || isDeleting) {
				return;
			}

			dispatchUI({ type: "SET_DELETE_CHAT_DIALOG", value: true });
		};

		window.addEventListener(
			HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT,
			handleShortcutDeleteRequest,
		);

		return () =>
			window.removeEventListener(
				HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT,
				handleShortcutDeleteRequest,
			);
	}, [chatId, isDeleting]);

	// Chat redirect effect
	useEffect(() => {
		if (!isUserLoading && chatId && currentChat === null && !isDeleting) {
			router.navigate({ to: "/", replace: true });
		}
	}, [chatId, currentChat, isUserLoading, router, isDeleting]);

	// Document title update
	useDocumentTitle(currentChat?.title, chatId || undefined);

	// Message scrolling
	const targetMessageId = searchParams.m;
	const hasScrolledRef = useRef(false);
	const previousTargetMessageIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (targetMessageId !== previousTargetMessageIdRef.current) {
			hasScrolledRef.current = false;
			previousTargetMessageIdRef.current = targetMessageId;
		}
		if (!targetMessageId || hasScrolledRef.current || messages.length === 0) {
			return;
		}
		const target =
			messages.find(
				(message) =>
					(message as MessageWithExtras).serverId === targetMessageId ||
					message.id === targetMessageId,
			) ?? null;
		const el = document.getElementById(target?.id ?? targetMessageId);
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
				"@container/main relative flex h-full min-h-0 flex-col items-center justify-end md:justify-center",
			)}
		>
			<Suspense fallback={null}>
				<DialogAuth open={hasDialogAuth} setOpenAction={(v) => dispatchUI({ type: "SET_DIALOG_AUTH", value: v })} />
			</Suspense>
			<AlertDialog
				onOpenChange={(open) => {
					if (isDeleting) return;
					dispatchUI({ type: "SET_DELETE_CHAT_DIALOG", value: open });
				}}
				open={showDeleteChatDialog}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Chat</AlertDialogTitle>
						<AlertDialogDescription>
							{`Are you sure you want to delete "${
								currentChat?.title || "Untitled Chat"
							}"? This action cannot be undone.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isDeleting}
							onClick={(event) => {
								event.preventDefault();
								void handleDeleteCurrentChat();
							}}
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AnimatePresence initial={false} mode="popLayout">
				{!chatId && messages.length === 0 ? (
					<m.div
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
					</m.div>
				) : (
					<Conversation
						autoScroll={!targetMessageId}
						fallbackReasoningEffort={selectedReasoningEffort}
						isUserAuthenticated={isAuthenticated}
						key="conversation"
						messages={messages as MessageWithExtras[]}
						status={status}
						onBranch={(messageId) => {
							if (!chatId) {
								return;
							}
							handleBranch(chatId, getServerId(messageId), user);
						}}
						onDelete={handleDelete}
						onEdit={handleEdit}
						onReload={handleReload}
						selectedModel={selectedModel}
					/>
				)}
			</AnimatePresence>

			<m.div
				className={cn(
					"relative inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl",
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
					initialValue={urlDraft}
					isStartingChat={isStartingChat}
					isSettingsLoading={isSettingsLoading}
					status={status}
					stop={stop}
					isReasoningModel={supportsReasoningEffort(selectedModel)}
					isUserAuthenticated={isAuthenticated}
					onFileRemoveAction={removeFile}
					onFileUploadAction={addFiles}
					onSelectModelAction={handleModelChange}
					onSelectReasoningEffortAction={(v) => dispatchUI({ type: "SET_REASONING_EFFORT", value: v })}
					onSelectSystemPromptAction={(id: string) => dispatchUI({ type: "SET_TEMP_PERSONA", id })}
					onSendAction={(
						message: string,
						{ enableSearch }: { enableSearch: boolean },
					) => submit(message, { body: { enableSearch } })}
					onSuggestionAction={(suggestion: string) => submit(suggestion)}
					reasoningEffort={selectedReasoningEffort}
					selectedModel={selectedModel}
					selectedPersonaId={personaId}
				/>
			</m.div>
		</div>
	);
}

export default function Chat() {
	const { chatId } = useChatSession();
	const authToken = useAuthToken();
	const storeKey = chatId ?? DRAFT_CHAT_KEY;

	// The shared transport reads the token per request, so instances never need recreating
	useEffect(() => {
		setChatAuthToken(authToken);
	}, [authToken]);

	const chatInstance = useMemo(() => {
		// The registry is module state, shared by every request on the server, so SSR gets a
		// throwaway instance
		if (typeof window === "undefined") {
			return new ChatInstance<MessageWithExtras>({ id: storeKey, transport: chatTransport });
		}
		const existing = chatRegistry.get(storeKey);
		if (existing) {
			// Promote reused entry to most-recently-used position.
			chatRegistry.delete(storeKey);
			chatRegistry.set(storeKey, existing);
			return existing;
		}
		const instance = new ChatInstance<MessageWithExtras>({
			id: storeKey,
			transport: chatTransport,
			onError: createChatErrorHandler(),
		});
		chatRegistry.set(storeKey, instance);
		evictOldestChats();
		return instance;
	}, [storeKey]);

	const chatIdentity = useMemo(
		() => getChatIdentity(chatInstance),
		[chatInstance],
	);

	return (
		<ChatInstanceContext.Provider value={chatInstance}>
			<ChatContent key={chatIdentity} />
		</ChatInstanceContext.Provider>
	);
}
