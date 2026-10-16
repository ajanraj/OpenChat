import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/error")({
  component: AuthErrorPage,
});

// Create a separate component that uses useSearch
function AuthErrorContent() {
  const search = useSearch({ from: "/auth/error" });
  const message =
    (search as { message?: string }).message ||
    "An error occurred during authentication.";

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Authentication Error
        </h1>
        <div className="mt-6 rounded-md bg-red-500/10 p-4">
          <p className="text-red-400">{message}</p>
        </div>
        <div className="mt-8">
          <Button
            asChild
            className="w-full text-base sm:text-base"
            size="lg"
            variant="secondary"
          >
            <Link to="/auth">Try Again</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthErrorPage() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-800 text-white">
      {/* Header */}
      <header className="p-4">
        <Link
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-white hover:bg-zinc-700"
          to="/"
        >
          <ArrowLeft className="size-5 text-white" />
          <span className="font-base ml-2 hidden text-sm sm:inline-block">
            Back to Chat
          </span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        <Suspense fallback={<div>Loading...</div>}>
          <AuthErrorContent />
        </Suspense>
      </main>

      <footer className="py-6 text-center text-sm text-zinc-500">
        <p>
          Need help?{" "}
          <Link className="text-zinc-400 hover:underline" to="/">
            Contact Support
          </Link>
        </p>
      </footer>
    </div>
  );
}
