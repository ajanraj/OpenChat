import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProfileSection } from "../sidebar-profile-section";

const useProfileMock = vi.hoisted(() => vi.fn());
const useChatSessionMock = vi.hoisted(() => vi.fn());
const useCreateProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/providers/profile-provider", () => ({
	useProfile: useProfileMock,
}));

vi.mock("@/providers/chat-session-provider", () => ({
	useChatSession: useChatSessionMock,
}));

vi.mock("@/hooks/use-create-profile", () => ({
	useCreateProfile: useCreateProfileMock,
}));

describe("SidebarProfileSection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("passes active chat id when profile creation succeeds", () => {
		const setActiveProfile = vi.fn();
		let onCreateSuccessHandler: ((profileId: string) => void) | undefined;

		useProfileMock.mockReturnValue({
			profiles: [],
			activeProfile: undefined,
			setActiveProfile,
		});
		useChatSessionMock.mockReturnValue({ chatId: "chat-current" });
		useCreateProfileMock.mockImplementation((onSuccess) => {
			onCreateSuccessHandler = onSuccess;
			return vi.fn();
		});

		render(<SidebarProfileSection />);

		expect(onCreateSuccessHandler).toBeTypeOf("function");
		if (!onCreateSuccessHandler) {
			throw new Error("missing create profile success handler");
		}
		const createSuccessHandler = onCreateSuccessHandler;

		act(() => {
			createSuccessHandler("profile-created");
		});

		expect(setActiveProfile).toHaveBeenCalledWith("profile-created", "chat-current");
	});
});
