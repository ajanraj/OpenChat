import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Chat from "../chat";

type ChatInputProps = {
	status: string;
	onSendAction: (message: string, options: { enableSearch: boolean }) => void;
	onSuggestionAction: (suggestion: string) => void;
};

const mocks = vi.hoisted(() => ({
	chatInput: { current: null as ChatInputProps | null },
	ensureSession: vi.fn<() => Promise<void>>(),
	handleCreateChat: vi.fn<(title: string) => Promise<string | null>>(),
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
	useSearch: () => ({}),
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
	useProfile: () => ({ activeProfile: undefined }),
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

describe("Chat first send", () => {
	it("starts one chat when a signed-out visitor sends again while their guest session starts", async () => {
		let finishSession: () => void = () => undefined;
		mocks.ensureSession.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishSession = resolve;
				}),
		);
		mocks.handleCreateChat.mockResolvedValue("chats:new");
		render(<Chat />);

		// Block bodies: the handlers return submit's promise, which would make act async
		act(() => {
			mocks.chatInput.current?.onSendAction("first", { enableSearch: false });
		});
		// The input treats the start as a request in flight, so it holds the next message
		expect(mocks.chatInput.current?.status).toBe("submitted");
		// Suggestions submit directly, without the input's own check
		act(() => {
			mocks.chatInput.current?.onSuggestionAction("second");
		});

		await act(async () => {
			finishSession();
		});
		await vi.waitFor(() => expect(mocks.sendMessages).toHaveBeenCalledTimes(1));

		expect(mocks.ensureSession).toHaveBeenCalledTimes(1);
		expect(mocks.handleCreateChat).toHaveBeenCalledTimes(1);
		expect(mocks.handleCreateChat.mock.calls[0]?.[0]).toBe("first");
		await vi.waitFor(() => expect(mocks.chatInput.current?.status).toBe("ready"));
	});
});
