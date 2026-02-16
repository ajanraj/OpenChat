import { render } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
	HOTKEY_EVENT_OPEN_MODEL_PICKER,
	HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT,
} from "@/lib/hotkey-events";
import LayoutApp from "../layout-app";

type HotkeyRegistration = {
	hotkey: string;
	callback: (event: KeyboardEvent) => void;
	options?: {
		preventDefault?: boolean;
		stopPropagation?: boolean;
	};
};

const navigateMock = vi.hoisted(() => vi.fn());
const useLocationMock = vi.hoisted(() => vi.fn());
const toggleSidebarMock = vi.hoisted(() => vi.fn());
const useHotkeyMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-hotkeys", () => ({
	useHotkey: useHotkeyMock,
}));

vi.mock("@tanstack/react-router", () => ({
	useLocation: useLocationMock,
	useRouter: () => ({ navigate: navigateMock }),
}));

vi.mock("@/providers/sidebar-provider", () => ({
	useSidebar: () => ({ toggleSidebar: toggleSidebarMock }),
}));

vi.mock("../chat-sidebar", () => ({
	default: () => <div data-testid="chat-sidebar" />,
}));

vi.mock("../header", () => ({
	Header: () => <div data-testid="header" />,
}));

let registrations: HotkeyRegistration[] = [];

function renderLayout(pathname: string): void {
	useLocationMock.mockReturnValue({ pathname });
	render(
		<LayoutApp>
			<div>Child</div>
		</LayoutApp>,
	);
}

function getRegistration(hotkey: string): HotkeyRegistration {
	const registration = registrations.find((item) => item.hotkey === hotkey);
	if (!registration) {
		throw new Error(`Missing hotkey registration: ${hotkey}`);
	}
	return registration;
}

function createEvent(target: EventTarget): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
	});
	Object.defineProperty(event, "target", {
		configurable: true,
		value: target,
	});
	return event;
}

describe("LayoutApp hotkeys", () => {
	beforeEach(() => {
		registrations = [];
		vi.clearAllMocks();
		useHotkeyMock.mockImplementation(
			(
				hotkey: string,
				callback: (event: KeyboardEvent) => void,
				options?: HotkeyRegistration["options"],
			) => {
				registrations.push({
					hotkey,
					callback,
					options,
				});
			},
		);
	});

	it("registers all expected shortcuts", () => {
		renderLayout("/c/chat-1");

		const keys = registrations.map((item) => item.hotkey);
		expect(keys).toEqual([
			"Mod+K",
			"Mod+Shift+O",
			"Mod+B",
			"Mod+/",
			"Mod+Shift+Backspace",
		]);

		for (const registration of registrations) {
			expect(registration.options).toEqual({
				preventDefault: false,
				stopPropagation: false,
			});
		}
	});

	it("triggers global search event for Mod+K", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		renderLayout("/c/chat-1");
		const handler = getRegistration("Mod+K");
		const event = createEvent(document.body);
		const stopPropagationSpy = vi.spyOn(event, "stopPropagation");

		handler.callback(event);

		expect(event.defaultPrevented).toBe(true);
		expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: "toggleFloatingSearch" }),
		);
	});

	it("navigates to home on Mod+Shift+O when target is not input-like", () => {
		renderLayout("/c/chat-1");
		const handler = getRegistration("Mod+Shift+O");
		const event = createEvent(document.body);

		handler.callback(event);

		expect(event.defaultPrevented).toBe(true);
		expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
	});

	it("skips new chat and sidebar toggle hotkeys when input is focused", () => {
		renderLayout("/c/chat-1");
		const input = document.createElement("input");

		const newChatHandler = getRegistration("Mod+Shift+O");
		const newChatEvent = createEvent(input);
		newChatHandler.callback(newChatEvent);
		expect(newChatEvent.defaultPrevented).toBe(false);
		expect(navigateMock).not.toHaveBeenCalled();

		const sidebarHandler = getRegistration("Mod+B");
		const sidebarEvent = createEvent(input);
		sidebarHandler.callback(sidebarEvent);
		expect(sidebarEvent.defaultPrevented).toBe(false);
		expect(toggleSidebarMock).not.toHaveBeenCalled();
	});

	it("dispatches model picker event only on chat routes", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		renderLayout("/settings");
		const nonChatEvent = createEvent(document.body);
		getRegistration("Mod+/").callback(nonChatEvent);
		expect(dispatchSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: HOTKEY_EVENT_OPEN_MODEL_PICKER }),
		);

		registrations = [];
		renderLayout("/c/chat-1");
		const chatEvent = createEvent(document.body);
		getRegistration("Mod+/").callback(chatEvent);
		expect(chatEvent.defaultPrevented).toBe(true);
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: HOTKEY_EVENT_OPEN_MODEL_PICKER }),
		);
	});

	it("dispatches delete-current-chat event only on current chat routes", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		renderLayout("/");
		const rootEvent = createEvent(document.body);
		getRegistration("Mod+Shift+Backspace").callback(rootEvent);
		expect(dispatchSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT }),
		);

		registrations = [];
		renderLayout("/c/chat-1");
		const currentChatEvent = createEvent(document.body);
		getRegistration("Mod+Shift+Backspace").callback(currentChatEvent);
		expect(currentChatEvent.defaultPrevented).toBe(true);
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT }),
		);
	});

	it("skips delete-current-chat hotkey when input-like target is focused", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		renderLayout("/c/chat-1");
		const input = document.createElement("textarea");
		const event = createEvent(input);

		getRegistration("Mod+Shift+Backspace").callback(event);

		expect(event.defaultPrevented).toBe(false);
		expect(dispatchSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT }),
		);
	});
});
