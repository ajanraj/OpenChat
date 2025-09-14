"use client";

import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";

type SidebarContextType = {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedState = localStorage.getItem("sidebarOpen");
        return savedState === "true";
      } catch {
        // Fallback to false if localStorage is blocked/unavailable
        return false;
      }
    }
    return false;
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const newState = !prev;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("sidebarOpen", String(newState));
        } catch {
          // Silently handle localStorage errors (private mode, quota exceeded, etc.)
        }
      }
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
