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
const useUserMock = vi.hoisted(() => vi.fn());
const useProfileMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/providers/user-provider", () => ({
	useUser: useUserMock,
}));

vi.mock("@/providers/profile-provider", () => ({
	useProfile: useProfileMock,
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
		<div
			className={className}
			data-value={value}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect?.();
				}
			}}
			role="button"
			tabIndex={0}
		>
			{children}
		</div>
	),
	CommandList: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

function buildChat() {
	return buildChatWithOverrides({});
}

function buildChatWithOverrides(overrides: {
	_id?: string;
	title?: string;
	isPinned?: boolean;
	createdAt?: number;
	profileId?: string;
}) {
	return {
		_id: overrides._id ?? "chat-1",
		title: overrides.title ?? "Keyboard chat",
		isPinned: overrides.isPinned ?? false,
		createdAt: overrides.createdAt ?? Date.now(),
		profileId: overrides.profileId,
	};
}

function primeQueryMocks(chats = [buildChat()]) {
	useQueryMock.mockImplementation((options: { enabled?: boolean }) => {
		if (options.enabled !== undefined) {
			return { data: [] };
		}

		return { data: chats };
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
		useUserMock.mockReturnValue({
			user: { isAnonymous: false },
		});
		useProfileMock.mockReturnValue({
			activeProfile: {
				_id: "profile-default",
				isDefault: true,
			},
			isProfilesLoading: false,
		});
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

	it("scopes drawer history to active non-default profile chats", () => {
		useProfileMock.mockReturnValue({
			activeProfile: {
				_id: "profile-p2",
				isDefault: false,
			},
			isProfilesLoading: false,
		});
		primeQueryMocks([
			buildChatWithOverrides({
				_id: "chat-default",
				title: "Default profile chat",
			}),
			buildChatWithOverrides({
				_id: "chat-p1",
				title: "Profile one chat",
				profileId: "profile-p1",
			}),
			buildChatWithOverrides({
				_id: "chat-p2",
				title: "Profile two chat",
				profileId: "profile-p2",
			}),
		]);
		primeMutationMocks(vi.fn(async () => {}));

		const { getByText, queryByText } = render(
			<DrawerHistory
				isOpen
				setIsOpen={vi.fn()}
				trigger={<span>history</span>}
			/>,
		);

		expect(getByText("Profile two chat")).toBeTruthy();
		expect(queryByText("Default profile chat")).toBeNull();
		expect(queryByText("Profile one chat")).toBeNull();
	});
});
