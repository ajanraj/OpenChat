"use client";

import { ArrowLeft, Moon, SignOut, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/providers/user-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type HeaderGoBackProps = {
  href?: string;
  showControls?: boolean;
};

export function HeaderGoBack({
  href = "/",
  showControls = true,
}: HeaderGoBackProps) {
  const { theme, setTheme } = useTheme();
  const { signOut } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
      toast({ title: "Logged out", status: "success" });
    } catch (_e) {
      // console.error('Sign out failed:', e);
      toast({ title: "Failed to sign out", status: "error" });
    }
  };

  return (
    <header className="flex items-center justify-between p-4">
      <Link
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground hover:bg-muted"
        href={href}
        prefetch
      >
        <ArrowLeft className="size-5 text-foreground" />
        <span className="ml-2 hidden font-base text-sm sm:inline-block">
          Back to Chat
        </span>
      </Link>
      {showControls && (
        <div className="flex items-center gap-2">
          <button
            aria-label="Switch theme"
            className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            tabIndex={0}
            type="button"
          >
            {theme === "dark" ? (
              <Sun
                className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                weight="bold"
              />
            ) : (
              <Moon
                className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                weight="bold"
              />
            )}
            <span className="sr-only">Toggle theme</span>
          </button>
          <Button
            className="flex items-center gap-1 px-2"
            onClick={handleSignOut}
            size="sm"
            variant="ghost"
          >
            <SignOut className="size-5" />
            <span className="text-sm">Log out</span>
          </Button>
        </div>
      )}
    </header>
  );
}
