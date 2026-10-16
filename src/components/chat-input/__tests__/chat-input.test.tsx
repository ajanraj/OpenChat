import type { ChatStatus } from "ai";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatInput } from "../chat-input";

vi.mock("../button-file-upload", () => ({ ButtonFileUpload: () => null }));
vi.mock("../button-tools-dropdown", () => ({ ButtonToolsDropdown: () => null }));
vi.mock("../file-list", () => ({ FileList: () => null }));
vi.mock("../prompt-system", () => ({ PromptSystem: () => null }));
vi.mock("../select-model", () => ({ SelectModel: () => null }));
vi.mock("../select-reasoning-effort", () => ({ SelectReasoningEffort: () => null }));

type InputState = {
	status?: ChatStatus;
	isStartingChat?: boolean;
	isSettingsLoading?: boolean;
	initialValue?: string;
};

function renderInput(initial: InputState) {
	const stop = vi.fn<() => void>();
	const onSendAction = vi.fn<(message: string, options: { enableSearch: boolean }) => Promise<boolean>>(
		async () => true,
	);
	const input = ({
		status = "ready",
		isStartingChat = false,
		isSettingsLoading = false,
		initialValue = "hello",
	}: InputState) => (
		<ChatInput
			files={[]}
			initialValue={initialValue}
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

describe("ChatInput after a send", () => {
	it("clears the message once it went out", async () => {
		const { textarea, onSendAction } = renderInput({});

		fireEvent.keyDown(textarea, { key: "Enter" });

		await waitFor(() => expect(onSendAction).toHaveBeenCalledTimes(1));
		expect(textarea.value).toBe("");
	});

	it("gives the message back when it didn't go out", async () => {
		const { textarea, onSendAction } = renderInput({});
		// e.g. the guest session couldn't start
		onSendAction.mockResolvedValue(false);

		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(textarea.value).toBe("");

		await waitFor(() => expect(textarea.value).toBe("hello"));
	});
});

describe("ChatInput when its initial value changes", () => {
	it("shows a query handed back into an input the user cleared", () => {
		const { textarea, update } = renderInput({ initialValue: "" });
		fireEvent.change(textarea, { target: { value: "half a thought" } });
		fireEvent.change(textarea, { target: { value: "" } });

		// e.g. a ?q= link whose start failed
		update({ initialValue: "from the link" });

		expect(textarea.value).toBe("from the link");
	});

	it("keeps what the user typed", () => {
		const { textarea, update } = renderInput({ initialValue: "" });
		fireEvent.change(textarea, { target: { value: "my own words" } });

		update({ initialValue: "from the link" });

		expect(textarea.value).toBe("my own words");
	});
});
