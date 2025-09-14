"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import { APP_NAME } from "../../../lib/config";

export function PopoverContentAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuthActions();

  const handleSignInWithGoogle = async () => {
    try {
      setIsLoading(true);
      setError(null);

      await signIn("google");
    } catch (_err: unknown) {
      // console.error('Error signing in with Google:', err);
      setError("Unable to sign in at the moment. Please try again later.");
      // TODO: send `err` to Sentry / console for diagnostics
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <PopoverContent
      align="start"
      className="w-[300px] overflow-hidden rounded-xl p-0"
      side="top"
    >
      <Image
        alt={`calm paint generate by ${APP_NAME}`}
        className="h-32 w-full object-cover"
        height={128}
        src="/banner_forest.jpg"
        width={300}
      />
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}
      <div className="p-3">
        <p className="mb-1 font-medium text-base text-primary">
          Login to try more features for free
        </p>
        <p className="mb-5 text-base text-muted-foreground">
          Add files, use more models. <br />
          Soon search, agents, and more.
        </p>
        <Button
          className="w-full text-base"
          disabled={isLoading}
          onClick={handleSignInWithGoogle}
          size="lg"
          variant="secondary"
        >
          <Image
            alt="Google logo"
            className="mr-2 size-4"
            height={20}
            src="https://www.google.com/favicon.ico"
            width={20}
          />
          <span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
        </Button>
      </div>
    </PopoverContent>
  );
}
