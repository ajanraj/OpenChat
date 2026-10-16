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

function renderStartingChat(status: ChatStatus) {
	const stop = vi.fn<() => void>();
	const onSendAction = vi.fn<(message: string, options: { enableSearch: boolean }) => void>();
	render(
		<ChatInput
			files={[]}
			initialValue="hello"
			isReasoningModel={false}
			isStartingChat
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
		/>,
		{ wrapper: TooltipProvider },
	);
	const button = screen.getByRole<HTMLButtonElement>("button", { name: "Send message" });
	return { button, stop, onSendAction };
}

describe("ChatInput while a new chat starts", () => {
	it("holds the typed message until the chat's request exists", () => {
		const { button, onSendAction } = renderStartingChat("ready");

		expect(button.disabled).toBe(true);
		fireEvent.click(button);

		expect(onSendAction).not.toHaveBeenCalled();
		expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("hello");
	});

	it("lets the first response be stopped once it streams", () => {
		const { button, stop, onSendAction } = renderStartingChat("streaming");

		expect(button.disabled).toBe(false);
		fireEvent.click(button);

		expect(stop).toHaveBeenCalledTimes(1);
		expect(onSendAction).not.toHaveBeenCalled();
	});
});
