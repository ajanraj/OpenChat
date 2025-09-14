"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ChatSessionProvider } from "@/app/providers/chat-session-provider";
import { CSPostHogProvider } from "@/app/providers/posthog-provider";
import { UserProvider } from "@/app/providers/user-provider";
import { Loader } from "@/components/prompt-kit/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AnonymousSignIn } from "./anonymous-sign-in";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  return (
    <ThemeProvider>
      {/* Auth Loading State - UserProvider never executes */}
      <AuthLoading>
        <div className="flex h-dvh items-center justify-center bg-background">
          <Loader size="lg" variant="dots" />
        </div>
      </AuthLoading>

      {/* Unauthenticated State - Triggers anonymous sign-in */}
      <Unauthenticated>
        <AnonymousSignIn />
      </Unauthenticated>

      {/* Authenticated State - Covers both Google users AND anonymous users */}
      <Authenticated>
        <UserProvider>
          <CSPostHogProvider>
            <ChatSessionProvider>
              <Toaster position="top-center" />
              {children}
            </ChatSessionProvider>
          </CSPostHogProvider>
        </UserProvider>
      </Authenticated>
    </ThemeProvider>
  );
}
