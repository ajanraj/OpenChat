import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ChatSessionProvider } from "@/providers/chat-session-provider";
import { CSPostHogProvider } from "@/providers/posthog-provider";
import { ProfileProvider } from "@/providers/profile-provider";
import { UserProvider } from "@/providers/user-provider";

/**
 * App-wide providers, rendered for every visitor without waiting on auth so pages server-render
 * real content. Signed-out visitors get `user: null`; their guest account is created on their
 * first message (see `ensureSession` in UserProvider).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <ProfileProvider>
          <CSPostHogProvider>
            <ChatSessionProvider>
              <Toaster position="top-center" />
              {children}
            </ChatSessionProvider>
          </CSPostHogProvider>
        </ProfileProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
