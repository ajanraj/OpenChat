import type { ChatStatus } from "ai";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatInput } from "../chat-input";

vi.mock("../button-file-upload", () => ({ ButtonFileUpload: () => null }));
vi.mock("../button-tools-dropdown", () => ({ ButtonToolsDropdown: () => null }));
vi.mock("../file-list", () => ({ FileList: () => null }));
vi.mock("../prompt-system", () => ({
	PromptSystem: ({ onSuggestion }: { onSuggestion: (suggestion: string) => void }) => (
		<button onClick={() => onSuggestion("a suggestion")} type="button">
			Suggest
		</button>
	),
}));
vi.mock("../select-model", () => ({ SelectModel: () => null }));
vi.mock("../select-reasoning-effort", () => ({ SelectReasoningEffort: () => null }));

function renderInput({
	status = "ready",
	isStartingChat = false,
	isSettingsLoading = false,
}: { status?: ChatStatus; isStartingChat?: boolean; isSettingsLoading?: boolean }) {
	const stop = vi.fn<() => void>();
	const onSendAction = vi.fn<(message: string, options: { enableSearch: boolean }) => void>();
	const onSuggestionAction = vi.fn<(suggestion: string) => void>();
	render(
		<ChatInput
			files={[]}
			hasSuggestions
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
			onSuggestionAction={onSuggestionAction}
			reasoningEffort="none"
			selectedModel="gpt-5.4-nano"
			status={status}
			stop={stop}
		/>,
		{ wrapper: TooltipProvider },
	);
	const button = screen.getByRole<HTMLButtonElement>("button", { name: "Send message" });
	const textarea = screen.getByRole<HTMLTextAreaElement>("textbox");
	return { button, textarea, stop, onSendAction, onSuggestionAction };
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
	it("keeps typing open but holds the send, message intact", () => {
		const { button, textarea, onSendAction } = renderInput({ isSettingsLoading: true });

		expect(textarea.disabled).toBe(false);
		expect(button.disabled).toBe(true);
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onSendAction).not.toHaveBeenCalled();
		expect(textarea.value).toBe("hello");
	});

	it("puts a picked suggestion in the input instead of sending it", () => {
		const { textarea, onSuggestionAction } = renderInput({ isSettingsLoading: true });

		fireEvent.click(screen.getByRole("button", { name: "Suggest" }));

		expect(onSuggestionAction).not.toHaveBeenCalled();
		expect(textarea.value).toBe("a suggestion");
	});

	it("sends once the settings have loaded", () => {
		const { textarea, onSendAction } = renderInput({});

		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onSendAction).toHaveBeenCalledWith("hello", { enableSearch: false });
	});
});
