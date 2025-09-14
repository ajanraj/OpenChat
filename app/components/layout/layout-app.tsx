"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useSidebar } from "@/app/providers/sidebar-provider";
import ChatSidebar from "./chat-sidebar";
import { Header } from "./header";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  const { toggleSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const isSettings = pathname?.startsWith("/settings");
  const isAuth = pathname?.startsWith("/auth");
  const isLegal =
    pathname?.startsWith("/terms") ||
    pathname?.startsWith("/privacy") ||
    pathname?.startsWith("/security") ||
    pathname?.startsWith("/legal");

  // Helper functions to reduce complexity
  const isInputElementFocused = useCallback((target: EventTarget | null) => {
    const element = target as HTMLElement;
    const tag = element?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || element?.isContentEditable;
  }, []);

  const handleGlobalSearch = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new Event("toggleFloatingSearch"));
  }, []);

  const handleNewChat = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      if (pathname !== "/") {
        router.push("/");
      }
    },
    [pathname, router]
  );

  const handleToggleSidebar = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      toggleSidebar();
    },
    [toggleSidebar]
  );

  // Keyboard shortcuts: Cmd+Shift+O for new chat, Cmd+B to toggle sidebar, Cmd+K for search
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isMeta = e.metaKey || e.ctrlKey;

      // Handle Cmd+K globally (even when inputs are focused)
      if (isMeta && key === "k") {
        handleGlobalSearch(e);
        return;
      }

      // For other shortcuts, skip if focused on input elements
      if (isInputElementFocused(e.target)) {
        return;
      }

      if (!isMeta) {
        return;
      }

      if (e.shiftKey && key === "o") {
        handleNewChat(e);
        return;
      }

      if (!e.shiftKey && key === "b") {
        handleToggleSidebar(e);
      }
    },
    [
      handleGlobalSearch,
      isInputElementFocused,
      handleNewChat,
      handleToggleSidebar,
    ]
  );
  useEffect(() => {
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handler]);

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
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
