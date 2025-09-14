"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { APP_NAME } from "@/lib/config";
import { HeaderGoBack } from "../components/header-go-back";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuthActions();

  async function handleSignInWithGoogle() {
    try {
      setIsLoading(true);
      setError(null);

      await signIn("google");
    } catch (err: unknown) {
      setIsLoading(false);
      // console.error('Error signing in with Google:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <HeaderGoBack href="/" showControls={false} />

      <main className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="mb-5 font-bold text-foreground text-xl">
              Welcome to{" "}
              <span className="-mt-1 ml-1.5 inline-block text-3xl">
                {APP_NAME}
              </span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              Sign in below to increase your message limits.
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="mt-8">
            <div className="mx-auto w-full max-w-sm">
              <Button
                className="h-14 w-full text-lg"
                disabled={isLoading}
                onClick={handleSignInWithGoogle}
                size="lg"
                variant="secondary"
              >
                <Image
                  alt="Google logo"
                  className="mr-3 size-6"
                  height={24}
                  src="https://www.google.com/favicon.ico"
                  unoptimized
                  width={24}
                />
                <span>
                  {isLoading ? "Connecting..." : "Continue with Google"}
                </span>
              </Button>
            </div>
            <div className="mt-6 text-center text-muted-foreground/60 text-sm">
              <p>
                By continuing, you agree to our{" "}
                <Link
                  className="text-muted-foreground hover:text-foreground"
                  href="/terms"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  className="text-muted-foreground hover:text-foreground"
                  href="/privacy"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-muted-foreground text-sm" />

      {/* Text hover effect overlay */}
      <div className="fixed right-0 bottom-0 left-0 z-50 hidden h-40 items-center justify-center overflow-hidden pt-15 md:flex">
        <div className="h-[250px] w-[1000px]">
          <TextHoverEffect text="oschat" />
        </div>
      </div>
    </div>
  );
}
