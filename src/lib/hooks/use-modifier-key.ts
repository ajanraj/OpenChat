import { useSyncExternalStore } from "react";

function getIsMac(): boolean {
	if (typeof navigator === "undefined") {
		return false;
	}
	return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

const isMac = getIsMac();
const modifierKey = isMac ? "⌘" : "Ctrl";

function subscribe() {
	return () => {};
}

function getSnapshot(): string {
	return modifierKey;
}

function getServerSnapshot(): string {
	return "⌘";
}

export function useModifierKey(): string {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
