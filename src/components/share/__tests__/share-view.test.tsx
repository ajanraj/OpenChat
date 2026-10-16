import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareView } from "../share-view";

const mocks = vi.hoisted(() => ({
	session: {
		current: {
			user: null as { _id: string; isAnonymous: boolean } | null,
			isLoading: true,
		},
	},
	navigate: vi.fn<(options: { to: string }) => void>(),
}));

vi.mock("@/components/chat/message", () => ({ Message: () => null }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: mocks.navigate }) }));
vi.mock("@/providers/user-provider", () => ({ useUser: () => mocks.session.current }));

const messages = [
	{ _id: "messages:1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] },
];

function renderShare() {
	return render(<ShareView messages={messages} sourceChatId="chats:1" />);
}

describe("ShareView's call to action", () => {
	beforeEach(() => {
		mocks.navigate.mockClear();
	});

	it("waits for the session, so a returning user isn't offered sign-in", () => {
		mocks.session.current = { user: null, isLoading: true };
		const { rerender } = renderShare();

		expect(screen.queryByRole("button")).toBeNull();

		// Known, though the account's settings are still loading
		mocks.session.current = { user: { _id: "users:1", isAnonymous: false }, isLoading: true };
		rerender(<ShareView messages={messages} sourceChatId="chats:1" />);

		expect(screen.getByRole("button", { name: "Continue in your chat" })).toBeTruthy();
	});

	it("sends a signed-out visitor to sign in once the session settles", () => {
		mocks.session.current = { user: null, isLoading: false };
		renderShare();

		fireEvent.click(screen.getByRole("button", { name: "Sign in to continue" }));

		expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/auth" });
	});
});
