import { useLocation, useRouter } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback } from "react";
import {
	HOTKEY_EVENT_OPEN_MODEL_PICKER,
	HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT,
	isChatRoute,
	isCurrentChatRoute,
	isInputLikeTarget,
} from "@/lib/hotkey-events";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/providers/sidebar-provider";
import ChatSidebar from "./chat-sidebar";
import { Header } from "./header";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
	const { toggleSidebar } = useSidebar();
	const router = useRouter();
	const location = useLocation();
	const pathname = location.pathname;
	const isSettings = pathname?.startsWith("/settings");
	const isAuth = pathname?.startsWith("/auth");
	const isLegal =
		pathname?.startsWith("/terms") ||
		pathname?.startsWith("/privacy") ||
		pathname?.startsWith("/security") ||
		pathname?.startsWith("/legal");
	const isChat = isChatRoute(pathname);

	const handleGlobalSearch = useCallback((e: KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		window.dispatchEvent(new Event("toggleFloatingSearch"));
	}, []);

	const handleNewChat = useCallback(
		(e: KeyboardEvent) => {
			e.preventDefault();
			if (pathname !== "/") {
				router.navigate({ to: "/" });
			}
		},
		[pathname, router],
	);

	useHotkey("Mod+K", handleGlobalSearch, {
		preventDefault: false,
		stopPropagation: false,
	});

	useHotkey(
		"Mod+Shift+O",
		(e) => {
			if (isInputLikeTarget(e.target)) {
				return;
			}
			handleNewChat(e);
		},
		{
			preventDefault: false,
			stopPropagation: false,
		},
	);

	useHotkey(
		"Mod+B",
		(e) => {
			if (isInputLikeTarget(e.target)) {
				return;
			}
			e.preventDefault();
			toggleSidebar();
		},
		{
			preventDefault: false,
			stopPropagation: false,
		},
	);

	useHotkey(
		"Mod+/",
		(e) => {
			if (!isChatRoute(pathname)) {
				return;
			}
			e.preventDefault();
			window.dispatchEvent(new Event(HOTKEY_EVENT_OPEN_MODEL_PICKER));
		},
		{
			preventDefault: false,
			stopPropagation: false,
		},
	);

	useHotkey(
		"Mod+Shift+Backspace",
		(e) => {
			if (isInputLikeTarget(e.target)) {
				return;
			}
			if (!isCurrentChatRoute(pathname)) {
				return;
			}
			e.preventDefault();
			window.dispatchEvent(
				new Event(HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT),
			);
		},
		{
			preventDefault: false,
			stopPropagation: false,
		},
	);

	// Settings, Auth, and Legal pages use their own layout; do not render ChatSidebar/Header
	if (isSettings || isAuth || isLegal) {
		return <>{children}</>; // allow nested settings layout to control structure
	}

	return (
		// Main flex container
		<div className="flex h-dvh overflow-hidden bg-background">
			{/* Sidebar */}
			<ChatSidebar />

			{/* Main Content Area */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Header is fixed, overlays this div */}
				<Header />
				{/* Scrollable main content */}
				<main
					className={cn(
						"flex-1 min-h-0",
						isChat ? "overflow-hidden" : "overflow-y-auto",
					)}
				>
					{children}
				</main>
			</div>
		</div>
	);
}
