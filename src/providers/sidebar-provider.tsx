import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SidebarContextType {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const SIDEBAR_COOKIE = "sidebarOpen";
const SIDEBAR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// A cookie rather than localStorage: the server reads it too, so the server-rendered sidebar
// matches what the browser hydrates
const readSidebarOpen = createIsomorphicFn()
  .server(() => getCookie(SIDEBAR_COOKIE) === "true")
  .client(() => document.cookie.split("; ").includes(`${SIDEBAR_COOKIE}=true`));

/** Saves the sidebar state; without the Cookie Store API (Safari before 18.4) it stays unsaved. */
const saveSidebarOpen = async (isOpen: boolean) => {
  try {
    await cookieStore.set({
      name: SIDEBAR_COOKIE,
      value: String(isOpen),
      path: "/",
      expires: Date.now() + SIDEBAR_COOKIE_MAX_AGE_MS,
      sameSite: "lax",
    });
  } catch (error) {
    console.warn("Could not save the sidebar state:", error);
  }
};

export const SidebarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => readSidebarOpen());

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const newState = !prev;
      void saveSidebarOpen(newState);
      return newState;
    });
  }, []);

  const value = useMemo(
    () => ({ isSidebarOpen, toggleSidebar }),
    [isSidebarOpen, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};
