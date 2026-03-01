import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Loader } from "@/components/prompt-kit/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ChatSessionProvider } from "@/providers/chat-session-provider";
import { CSPostHogProvider } from "@/providers/posthog-provider";
import { ProfileProvider } from "@/providers/profile-provider";
import { UserProvider } from "@/providers/user-provider";
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
					<ProfileProvider>
						<CSPostHogProvider>
							<ChatSessionProvider>
								<Toaster position="top-center" />
								{children}
							</ChatSessionProvider>
						</CSPostHogProvider>
					</ProfileProvider>
				</UserProvider>
			</Authenticated>
		</ThemeProvider>
	);
}
