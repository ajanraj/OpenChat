import { fireEvent, render, waitFor } from "@testing-library/react";
import type { MouseEvent, ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandHistory } from "../command-history";
import { DrawerHistory } from "../drawer-history";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());
const useRouterMock = vi.hoisted(() => vi.fn());
const convexQueryMock = vi.hoisted(() => vi.fn(() => ({})));

type ChildrenProps = {
	children?: ReactNode;
};

type CommandDialogProps = ChildrenProps & {
	open?: boolean;
};

type CommandInputProps = {
	onValueChange?: (value: string) => void;
	placeholder?: string;
	value?: string;
};

type CommandItemProps = ChildrenProps & {
	className?: string;
	onSelect?: () => void;
	value?: string;
};

type DrawerProps = ChildrenProps & {
	open?: boolean;
};

type DrawerTriggerProps = ChildrenProps;

type LinkProps = ChildrenProps & {
	className?: string;
	onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

vi.mock("@tanstack/react-query", () => ({
	useQuery: useQueryMock,
}));

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("@convex-dev/react-query", () => ({
	convexQuery: convexQueryMock,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, className, onClick }: LinkProps) => (
		<a className={className} href="/mock" onClick={onClick}>
			{children}
		</a>
	),
	useParams: useParamsMock,
	useRouter: useRouterMock,
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: ChildrenProps) => <>{children}</>,
	TooltipContent: ({ children }: ChildrenProps) => <>{children}</>,
	TooltipTrigger: ({ children }: ChildrenProps) => <>{children}</>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

vi.mock("@/components/ui/drawer", () => ({
	Drawer: ({ children, open }: DrawerProps) => <>{open ? children : null}</>,
	DrawerContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	DrawerDescription: ({ children }: ChildrenProps) => <div>{children}</div>,
	DrawerHeader: ({ children }: ChildrenProps) => <div>{children}</div>,
	DrawerTitle: ({ children }: ChildrenProps) => <h2>{children}</h2>,
	DrawerTrigger: ({ children }: DrawerTriggerProps) => <>{children}</>,
}));

vi.mock("@/components/ui/command", () => ({
	Command: ({ children }: ChildrenProps) => <div>{children}</div>,
	CommandDialog: ({ children, open }: CommandDialogProps) => (
		<div>{open ? children : null}</div>
	),
	CommandEmpty: ({ children }: ChildrenProps) => <div>{children}</div>,
	CommandInput: ({ onValueChange, placeholder, value }: CommandInputProps) => (
		<input
			onChange={(event) => onValueChange?.(event.target.value)}
			placeholder={placeholder}
			value={value}
		/>
	),
	CommandItem: ({ children, className, onSelect, value }: CommandItemProps) => (
		<div className={className} data-value={value} onClick={onSelect}>
			{children}
		</div>
	),
	CommandList: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

function buildChat() {
	return {
		_id: "chat-1",
		title: "Keyboard chat",
		isPinned: false,
		createdAt: Date.now(),
	};
}

function primeQueryMocks() {
	useQueryMock.mockImplementation((options: { enabled?: boolean }) => {
		if (options.enabled !== undefined) {
			return { data: [] };
		}

		return { data: [buildChat()] };
	});
}

function primeMutationMocks(deleteMutation: (args: unknown) => Promise<void>) {
	const noopMutation = vi.fn(async () => {});
	useMutationMock.mockImplementation(
		(mutationRef: Parameters<typeof getFunctionName>[0]) => {
			if (getFunctionName(mutationRef) === "chats:deleteChat") {
				return deleteMutation;
			}

			return noopMutation;
		},
	);
}

function getLastButton(container: HTMLElement, errorMessage: string) {
	const buttons = container.querySelectorAll("button");
	const button = buttons.item(buttons.length - 1);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(errorMessage);
	}

	return button;
}

function getDeleteShortcutInput(container: HTMLElement, errorMessage: string) {
	const input = container.querySelector("input.sr-only");
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(errorMessage);
	}

	return input;
}

describe("history delete keyboard flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		convexQueryMock.mockReturnValue({});
		useParamsMock.mockReturnValue({ chatId: "chat-current" });
		useRouterMock.mockReturnValue({
			navigate: vi.fn(),
			preloadRoute: vi.fn(),
		});
		primeQueryMocks();
	});

	it("focuses command-history delete input and confirms on Enter", async () => {
		const deleteMutation = vi.fn(async () => {});
		primeMutationMocks(deleteMutation);
		const { container } = render(<CommandHistory />);

		const openButton = container.querySelector("button");
		if (!(openButton instanceof HTMLButtonElement)) {
			throw new Error("missing command history open button");
		}
		fireEvent.click(openButton);

		const deleteButton = getLastButton(container, "missing command history delete button");
		fireEvent.click(deleteButton);

		const deleteShortcutInput = getDeleteShortcutInput(
			container,
			"missing command history delete shortcut input",
		);
		expect(document.activeElement).toBe(deleteShortcutInput);

		fireEvent.keyDown(deleteShortcutInput, { key: "Enter" });

		await waitFor(() => {
			expect(deleteMutation).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(container.querySelector("input.sr-only")).toBeNull();
		});
	});

	it("focuses drawer delete input and cancels on Escape", async () => {
		const deleteMutation = vi.fn(async () => {});
		primeMutationMocks(deleteMutation);
		const setIsOpen = vi.fn();
		const { container } = render(
			<DrawerHistory
				isOpen
				setIsOpen={setIsOpen}
				trigger={<span>history</span>}
			/>,
		);

		const deleteButton = getLastButton(container, "missing drawer delete button");
		fireEvent.click(deleteButton);

		const deleteShortcutInput = getDeleteShortcutInput(
			container,
			"missing drawer delete shortcut input",
		);
		expect(document.activeElement).toBe(deleteShortcutInput);

		fireEvent.keyDown(deleteShortcutInput, { key: "Escape" });

		await waitFor(() => {
			expect(container.querySelector("input.sr-only")).toBeNull();
		});
		expect(deleteMutation).not.toHaveBeenCalled();
	});

	it("focuses drawer delete input and confirms on Enter", async () => {
		const deleteMutation = vi.fn(async () => {});
		primeMutationMocks(deleteMutation);
		const setIsOpen = vi.fn();
		const { container } = render(
			<DrawerHistory
				isOpen
				setIsOpen={setIsOpen}
				trigger={<span>history</span>}
			/>,
		);

		const deleteButton = getLastButton(container, "missing drawer delete button");
		fireEvent.click(deleteButton);

		const deleteShortcutInput = getDeleteShortcutInput(
			container,
			"missing drawer delete shortcut input",
		);
		expect(document.activeElement).toBe(deleteShortcutInput);

		fireEvent.keyDown(deleteShortcutInput, { key: "Enter" });

		await waitFor(() => {
			expect(deleteMutation).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(container.querySelector("input.sr-only")).toBeNull();
		});
	});
});
