import type { ChatStatus } from "ai";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatInput } from "../chat-input";

vi.mock("../button-file-upload", () => ({ ButtonFileUpload: () => null }));
vi.mock("../button-tools-dropdown", () => ({ ButtonToolsDropdown: () => null }));
vi.mock("../file-list", () => ({ FileList: () => null }));
vi.mock("../prompt-system", () => ({ PromptSystem: () => null }));
vi.mock("../select-model", () => ({ SelectModel: () => null }));
vi.mock("../select-reasoning-effort", () => ({ SelectReasoningEffort: () => null }));

type InputState = { status?: ChatStatus; isStartingChat?: boolean; isSettingsLoading?: boolean };

function renderInput(initial: InputState) {
	const stop = vi.fn<() => void>();
	const onSendAction = vi.fn<(message: string, options: { enableSearch: boolean }) => void>();
	const input = ({ status = "ready", isStartingChat = false, isSettingsLoading = false }: InputState) => (
		<ChatInput
			files={[]}
			initialValue="hello"
			isReasoningModel={false}
			isSettingsLoading={isSettingsLoading}
			isStartingChat={isStartingChat}
			isUserAuthenticated={false}
			onFileRemoveAction={vi.fn()}
			onFileUploadAction={vi.fn()}
			onSelectModelAction={vi.fn()}
			onSelectReasoningEffortAction={vi.fn()}
			onSelectSystemPromptAction={vi.fn()}
			onSendAction={onSendAction}
			onSuggestionAction={vi.fn()}
			reasoningEffort="none"
			selectedModel="gpt-5.4-nano"
			status={status}
			stop={stop}
		/>
	);
	const { rerender } = render(input(initial), { wrapper: TooltipProvider });
	const button = screen.getByRole<HTMLButtonElement>("button", { name: "Send message" });
	const textarea = screen.getByRole<HTMLTextAreaElement>("textbox");
	return { button, textarea, stop, onSendAction, update: (next: InputState) => rerender(input(next)) };
}

describe("ChatInput while a new chat starts", () => {
	it("holds the typed message until the chat's request exists", () => {
		const { button, textarea, onSendAction } = renderInput({ isStartingChat: true });

		expect(button.disabled).toBe(true);
		fireEvent.click(button);

		expect(onSendAction).not.toHaveBeenCalled();
		expect(textarea.value).toBe("hello");
	});

	it("lets the first response be stopped once it streams", () => {
		const { button, stop, onSendAction } = renderInput({
			status: "streaming",
			isStartingChat: true,
		});

		expect(button.disabled).toBe(false);
		fireEvent.click(button);

		expect(stop).toHaveBeenCalledTimes(1);
		expect(onSendAction).not.toHaveBeenCalled();
	});
});

describe("ChatInput while saved settings load", () => {
	it("keeps typing open and holds the message until the settings arrive", () => {
		const { button, textarea, onSendAction, update } = renderInput({ isSettingsLoading: true });

		expect(textarea.disabled).toBe(false);
		expect(button.disabled).toBe(true);
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(onSendAction).not.toHaveBeenCalled();
		expect(textarea.value).toBe("hello");

		update({ isSettingsLoading: false });
		expect(button.disabled).toBe(false);
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onSendAction).toHaveBeenCalledExactlyOnceWith("hello", { enableSearch: false });
	});
});
