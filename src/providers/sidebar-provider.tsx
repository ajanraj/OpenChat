import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";

interface SidebarContextType {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const SIDEBAR_COOKIE = "sidebarOpen";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// A cookie rather than localStorage: the server reads it too, so the server-rendered sidebar
// matches what the browser hydrates
const readSidebarOpen = createIsomorphicFn()
  .server(() => getCookie(SIDEBAR_COOKIE) === "true")
  .client(() => document.cookie.split("; ").includes(`${SIDEBAR_COOKIE}=true`));

function saveSidebarOpen(isOpen: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${isOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => readSidebarOpen());

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const newState = !prev;
      saveSidebarOpen(newState);
      return newState;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
