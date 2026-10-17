import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { HeaderGoBack } from "@/components/header-go-back";
import { Button } from "@/components/ui/button";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { APP_NAME } from "@/lib/config/constants";

const LoginPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuthActions();

  const handleSignInWithGoogle = async () => {
    try {
      setIsLoading(true);
      setError(null);

      await signIn("google");
    } catch (signInError: unknown) {
      setIsLoading(false);
      if (signInError instanceof Error) {
        setError(signInError.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <HeaderGoBack href="/" showControls={false} />

      <main className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="mb-5 text-xl font-bold text-foreground">
              Welcome to{" "}
              <span className="-mt-1 ml-1.5 inline-block text-3xl">
                {APP_NAME}
              </span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              Sign in below to increase your message limits.
            </p>
          </div>
          {error !== null && error !== "" ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <div className="mt-8">
            <div className="mx-auto w-full max-w-sm">
              <Button
                className="h-14 w-full text-lg"
                disabled={isLoading}
                onClick={() => {
                  // Never rejects: failures are shown via `error`
                  void handleSignInWithGoogle();
                }}
                size="lg"
                variant="secondary"
              >
                <img
                  alt="Google logo"
                  className="mr-3 size-6"
                  height={24}
                  src="https://www.google.com/favicon.ico"
                  width={24}
                />
                <span>
                  {isLoading ? "Connecting..." : "Continue with Google"}
                </span>
              </Button>
            </div>
            <div className="mt-6 text-center text-sm text-muted-foreground/60">
              <p>
                By continuing, you agree to our{" "}
                <Link
                  className="text-muted-foreground hover:text-foreground"
                  to="/terms"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  className="text-muted-foreground hover:text-foreground"
                  to="/privacy"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground" />

      {/* Text hover effect overlay */}
      <div className="fixed right-0 bottom-0 left-0 z-50 hidden h-40 items-center justify-center overflow-hidden pt-15 md:flex">
        <div className="h-[250px] w-[1000px]">
          <TextHoverEffect text="oschat" />
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/auth/")({
  component: LoginPage,
});
