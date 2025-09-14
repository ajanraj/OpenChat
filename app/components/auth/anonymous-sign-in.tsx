"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useRef } from "react";
import { Loader } from "@/components/prompt-kit/loader";

export function AnonymousSignIn() {
  const { signIn } = useAuthActions();
  const attemptedAnon = useRef(false);

  // Handle anonymous sign-in when user is unauthenticated
  useEffect(() => {
    if (!attemptedAnon.current) {
      attemptedAnon.current = true;
      signIn("anonymous");
    }
  }, [signIn]);

  // Show loading while anonymous sign-in is processing
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <Loader size="lg" variant="dots" />
    </div>
  );
}
