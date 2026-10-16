import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Chat from "../chat";

type ChatInputProps = {
	status: string;
	isStartingChat?: boolean;
	isSettingsLoading?: boolean;
	initialValue?: string;
	selectedModel: string;
	onSendAction: (message: string, options: { enableSearch: boolean }) => Promise<boolean>;
	onSuggestionAction: (suggestion: string) => void;
};

const mocks = vi.hoisted(() => ({
	chatInput: { current: null as ChatInputProps | null },
	search: { current: {} as Record<string, string> },
	user: {
		current: { user: null as { _id: string; isAnonymous: boolean } | null, isLoading: false },
	},
	profile: {
		current: { activeProfile: undefined as { _id: string } | undefined, isProfilesLoading: false },
	},
	chatId: { current: null as string | null },
	isQueryLoading: { current: false },
	files: { current: [] as File[] },
	clearFiles: vi.fn<() => void>(),
	ensureSession: vi.fn<() => Promise<void>>(),
	handleCreateChat:
		vi.fn<
			(title: string, model: string, personaId?: string, profileId?: string) => Promise<string | null>
		>(),
	sendMessages: vi.fn<() => Promise<ReadableStream>>(
		async () =>
			new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
	),
}));

vi.mock("@/components/chat-input/chat-input", () => ({
	ChatInput: (props: ChatInputProps) => {
		mocks.chatInput.current = props;
		return null;
	},
}));
vi.mock("@/components/chat/conversation", () => ({ Conversation: () => null }));
vi.mock("../dialog-auth", () => ({ DialogAuth: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => null }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined, isLoading: mocks.isQueryLoading.current }),
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn() }),
	useSearch: () => mocks.search.current,
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/lib/chat-transport", () => ({
	chatTransport: { sendMessages: mocks.sendMessages, reconnectToStream: async () => null },
	setChatAuthToken: () => undefined,
}));
vi.mock("@/providers/chat-session-provider", () => ({
	useChatSession: () => ({
		chatId: mocks.chatId.current,
		isDeleting: false,
		setIsDeleting: () => undefined,
	}),
}));
vi.mock("@/providers/profile-provider", () => ({
	useProfile: () => mocks.profile.current,
}));
vi.mock("@/providers/user-provider", () => ({
	useUser: () => ({
		...mocks.user.current,
		hasPremium: false,
		hasApiKey: new Map(),
		isApiKeysLoading: false,
		ensureSession: mocks.ensureSession,
	}),
}));
vi.mock("@/hooks/use-chat-operations", () => ({
	useChatOperations: () => ({
		handleCreateChat: mocks.handleCreateChat,
		handleModelChange: vi.fn(),
		handleBranch: vi.fn(),
		handleDeleteMessage: vi.fn(),
	}),
}));
vi.mock("@/hooks/use-chat-validation", () => ({
	useChatValidation: () => ({
		checkRateLimits: () => true,
		validateModelAccess: () => true,
		validateSearchQuery: (query: string) => query,
	}),
}));
vi.mock("@/hooks/use-file-handling", () => ({
	useFileHandling: () => ({
		files: mocks.files.current,
		addFiles: vi.fn(),
		removeFile: vi.fn(),
		clearFiles: mocks.clearFiles,
		processFiles: vi.fn(),
		createOptimisticFiles: vi.fn(),
		hasFiles: false,
		uploadFile: vi.fn(),
		saveFileAttachment: vi.fn(),
	}),
}));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => undefined }));

/** Like the real session gate: concurrent callers share one pending session start. */
function holdSession() {
	let finish: () => void = () => undefined;
	const session = new Promise<void>((resolve) => {
		finish = resolve;
	});
	mocks.ensureSession.mockReturnValue(session);
	return finish;
}

describe("Chat first send", () => {
	// Unique across tests: the chat registry is module state, and a draft is only promoted to an id
	// it doesn't hold yet
	let createdChats = 0;
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search.current = {};
		mocks.user.current = { user: null, isLoading: false };
		mocks.profile.current = { activeProfile: undefined, isProfilesLoading: false };
		mocks.chatId.current = null;
		mocks.isQueryLoading.current = false;
		mocks.files.current = [];
		mocks.handleCreateChat.mockImplementation(async () => `chats:new-${++createdChats}`);
		mocks.ensureSession.mockResolvedValue(undefined);
	});

	it("starts one chat when a signed-out visitor sends again while their guest session starts", async () => {
		const finishSession = holdSession();
		render(<Chat />);

		// Block bodies: the handlers return submit's promise, which would make act async
		act(() => {
			mocks.chatInput.current?.onSendAction("first", { enableSearch: false });
		});
		// The input holds further sends while the chat starts
		expect(mocks.chatInput.current?.isStartingChat).toBe(true);
		// A second send that gets past the input's own hold (mocked out here)
		act(() => {
			mocks.chatInput.current?.onSuggestionAction("second");
		});

		await act(async () => {
			finishSession();
		});
		await vi.waitFor(() => expect(mocks.sendMessages).toHaveBeenCalledTimes(1));

		expect(mocks.handleCreateChat).toHaveBeenCalledTimes(1);
		expect(mocks.handleCreateChat.mock.calls[0]?.[0]).toBe("first");
		await vi.waitFor(() => expect(mocks.chatInput.current?.isStartingChat).toBe(false));
	});

	it("starts one chat when a visitor sends while a ?q= link is starting one", async () => {
		mocks.search.current = { model: "gpt-5.4-nano", q: "from the link" };
		const finishSession = holdSession();
		render(<Chat />);
		expect(mocks.chatInput.current?.isStartingChat).toBe(true);

		act(() => {
			mocks.chatInput.current?.onSuggestionAction("manual");
		});
		await act(async () => {
			finishSession();
		});
		await vi.waitFor(() => expect(mocks.sendMessages).toHaveBeenCalledTimes(1));

		expect(mocks.handleCreateChat).toHaveBeenCalledTimes(1);
		expect(mocks.handleCreateChat.mock.calls[0]?.[0]).toBe("from the link");
	});

	it("waits for a returning user's saved profile before starting a ?q= chat", async () => {
		mocks.search.current = { model: "gpt-5.4-nano", q: "from the link" };
		mocks.profile.current = { activeProfile: undefined, isProfilesLoading: true };
		mocks.ensureSession.mockResolvedValue(undefined);
		const { rerender } = render(<Chat />);

		// Typed sends wait too
		expect(mocks.chatInput.current?.isSettingsLoading).toBe(true);
		await act(async () => {});
		expect(mocks.handleCreateChat).not.toHaveBeenCalled();

		mocks.profile.current = { activeProfile: { _id: "profiles:work" }, isProfilesLoading: false };
		rerender(<Chat />);

		await vi.waitFor(() => expect(mocks.handleCreateChat).toHaveBeenCalledTimes(1));
		expect(mocks.handleCreateChat.mock.calls[0]?.[3]).toBe("profiles:work");
		expect(mocks.chatInput.current?.isSettingsLoading).toBe(false);
	});

	it("lets a signed-out visitor send at once: there are no saved settings to wait for", () => {
		render(<Chat />);

		expect(mocks.chatInput.current?.isSettingsLoading).toBe(false);
	});

	it.each([
		{
			settings: "the user's data loads",
			arrange: () => {
				mocks.user.current = { user: null, isLoading: true };
			},
		},
		{
			settings: "the user's profiles load",
			arrange: () => {
				mocks.profile.current = { activeProfile: undefined, isProfilesLoading: true };
			},
		},
		{
			settings: "the open chat's model and persona load",
			arrange: () => {
				mocks.chatId.current = "chats:open";
				mocks.isQueryLoading.current = true;
			},
		},
	])("holds sends until $settings", ({ arrange }) => {
		arrange();
		render(<Chat />);

		expect(mocks.chatInput.current?.isSettingsLoading).toBe(true);
	});

	it("holds sends after sign-out until the user clears, then drops their attachments", () => {
		const signedIn = { _id: "users:1", isAnonymous: false };
		mocks.user.current = { user: signedIn, isLoading: false };
		mocks.files.current = [new File(["notes"], "notes.txt")];
		const { rerender } = render(<Chat />);
		expect(mocks.clearFiles).not.toHaveBeenCalled();

		// UserProvider reports loading while the signed-out session's cached user lingers
		mocks.user.current = { user: signedIn, isLoading: true };
		rerender(<Chat />);
		expect(mocks.chatInput.current?.isSettingsLoading).toBe(true);

		mocks.user.current = { user: null, isLoading: false };
		rerender(<Chat />);
		expect(mocks.clearFiles).toHaveBeenCalled();
	});

	it.each([
		{ outcome: "the message went out", sent: true, arrange: () => undefined },
		{
			outcome: "the guest session couldn't start",
			sent: false,
			arrange: () => {
				mocks.ensureSession.mockRejectedValue(new Error("Timed out"));
			},
		},
		{
			outcome: "the chat couldn't be created",
			sent: false,
			arrange: () => {
				mocks.handleCreateChat.mockResolvedValue(null);
			},
		},
	])("tells the input whether $outcome", async ({ sent, arrange }) => {
		arrange();
		render(<Chat />);

		let result: boolean | undefined;
		await act(async () => {
			result = await mocks.chatInput.current?.onSendAction("hello", { enableSearch: false });
		});

		expect(result).toBe(sent);
		expect(mocks.sendMessages).toHaveBeenCalledTimes(sent ? 1 : 0);
	});

	it("puts a ?q= link's query and model back in the input when its start fails", async () => {
		mocks.search.current = { model: "gpt-5.4-mini", q: "from the link" };
		mocks.ensureSession.mockRejectedValue(new Error("Timed out"));
		render(<Chat />);

		// The link is processed once; sending from the input is the retry
		await waitFor(() => expect(mocks.chatInput.current?.initialValue).toBe("from the link"));
		expect(mocks.chatInput.current?.selectedModel).toBe("gpt-5.4-mini");
		expect(mocks.handleCreateChat).not.toHaveBeenCalled();
	});

	it("keeps a signed-in user's attachments when a new chat has no text to start from", async () => {
		mocks.user.current = { user: { _id: "users:1", isAnonymous: false }, isLoading: false };
		mocks.files.current = [new File(["notes"], "notes.txt")];
		render(<Chat />);

		let result: boolean | undefined;
		await act(async () => {
			result = await mocks.chatInput.current?.onSendAction("", { enableSearch: false });
		});

		expect(result).toBe(false);
		expect(mocks.handleCreateChat).not.toHaveBeenCalled();
		expect(mocks.clearFiles).not.toHaveBeenCalled();
	});
});
