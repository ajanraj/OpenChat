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
	it("holds the typed message until the chat's request exists, while typing stays open", () => {
		const { button, textarea, onSendAction } = renderInput({ isStartingChat: true });

		expect(textarea.disabled).toBe(false);
		// Held: Enter neither sends nor adds a line (the textarea never adds one on Enter)
		expect(fireEvent.keyDown(textarea, { key: "Enter" })).toBe(false);
		expect(onSendAction).not.toHaveBeenCalled();
		expect(button.disabled).toBe(true);
		// The spinner shows the guest session and chat are on their way, and screen readers hear it
		expect(button.getAttribute("aria-busy")).toBe("true");
		expect(screen.getByRole("status").textContent).toBe("Starting your chat…");
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
		expect(button.getAttribute("aria-busy")).toBe("false");
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
		// Nothing to announce until the user tries to send
		expect(screen.getByRole("status").textContent).toBe("");
		expect(fireEvent.keyDown(textarea, { key: "Enter" })).toBe(false);
		expect(onSendAction).not.toHaveBeenCalled();
		expect(textarea.value).toBe("hello");
		expect(screen.getByRole("status").textContent).toBe("Loading your settings…");

		update({ isSettingsLoading: false });
		expect(screen.getByRole("status").textContent).toBe("Ready to send.");
		expect(button.disabled).toBe(false);
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onSendAction).toHaveBeenCalledExactlyOnceWith("hello", { enableSearch: false });
		// A new chat's start ends it, so it isn't announced again once the chat has started
		update({ isStartingChat: true });
		expect(screen.getByRole("status").textContent).toBe("Starting your chat…");
		update({});
		expect(screen.getByRole("status").textContent).toBe("");

		// So does an existing chat's request
		update({ isSettingsLoading: true });
		fireEvent.keyDown(textarea, { key: "Enter" });
		update({});
		expect(screen.getByRole("status").textContent).toBe("Ready to send.");
		update({ status: "submitted" });
		expect(screen.getByRole("status").textContent).toBe("");
		update({});
		expect(screen.getByRole("status").textContent).toBe("");
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

	it("gives the message back ahead of a follow-up typed while it was starting", async () => {
		let finish: (sent: boolean) => void = () => undefined;
		const { textarea, onSendAction, update } = renderInput({});
		onSendAction.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);

		fireEvent.keyDown(textarea, { key: "Enter" });
		update({ isStartingChat: true });
		fireEvent.change(textarea, { target: { value: "and another thing" } });
		finish(false);
		update({ isStartingChat: false });

		await waitFor(() => expect(textarea.value).toBe("hello\n\nand another thing"));
	});

	it("gives back one copy of a message that was typed again while it was starting", async () => {
		let finish: (sent: boolean) => void = () => undefined;
		const { textarea, onSendAction } = renderInput({});
		onSendAction.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);

		fireEvent.keyDown(textarea, { key: "Enter" });
		fireEvent.change(textarea, { target: { value: "hello " } });
		finish(false);

		await waitFor(() => expect(onSendAction).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(textarea.value).toBe("hello "));
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

	it("puts the query ahead of what the user typed, keeping both", () => {
		const { textarea, update } = renderInput({ initialValue: "" });
		fireEvent.change(textarea, { target: { value: "my own words" } });

		update({ initialValue: "from the link" });

		expect(textarea.value).toBe("from the link\n\nmy own words");
	});

	it("doesn't repeat a query the user already typed", () => {
		const { textarea, update } = renderInput({ initialValue: "" });
		fireEvent.change(textarea, { target: { value: "from the link" } });

		update({ initialValue: "from the link" });

		expect(textarea.value).toBe("from the link");
	});
});
