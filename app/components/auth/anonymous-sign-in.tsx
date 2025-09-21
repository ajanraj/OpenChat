"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/prompt-kit/loader";
import { authClient } from "@/lib/auth-client";

export function AnonymousSignIn() {
  const attemptedAnon = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Handle anonymous sign-in when user is unauthenticated
  useEffect(() => {
    if (!attemptedAnon.current) {
      attemptedAnon.current = true;
      authClient.signIn.anonymous().catch(() => {
        setError("Failed to sign in. Please refresh the page.");
      });
    }
  }, []);

  // Show error if sign-in fails
  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <p className="text-destructive">{error}</p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => window.location.reload()}
          type="button"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  // Show loading while anonymous sign-in is processing
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <Loader size="lg" variant="dots" />
    </div>
  );
}
