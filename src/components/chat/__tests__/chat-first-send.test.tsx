import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Chat from "../chat";

type ChatInputProps = {
	status: string;
	isStartingChat?: boolean;
	isSettingsLoading?: boolean;
	onSendAction: (message: string, options: { enableSearch: boolean }) => void;
	onSuggestionAction: (suggestion: string) => void;
};

const mocks = vi.hoisted(() => ({
	chatInput: { current: null as ChatInputProps | null },
	search: { current: {} as Record<string, string> },
	profile: {
		current: { activeProfile: undefined as { _id: string } | undefined, isProfilesLoading: false },
	},
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
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
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
	useChatSession: () => ({ chatId: null, isDeleting: false, setIsDeleting: () => undefined }),
}));
vi.mock("@/providers/profile-provider", () => ({
	useProfile: () => mocks.profile.current,
}));
vi.mock("@/providers/user-provider", () => ({
	useUser: () => ({
		user: null,
		hasPremium: false,
		isLoading: false,
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
		files: [],
		addFiles: vi.fn(),
		removeFile: vi.fn(),
		clearFiles: vi.fn(),
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
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search.current = {};
		mocks.profile.current = { activeProfile: undefined, isProfilesLoading: false };
		mocks.handleCreateChat.mockResolvedValue("chats:new");
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
});
