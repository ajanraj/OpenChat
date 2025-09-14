"use client";

import {
  CheckCircleIcon,
  GithubLogoIcon,
  InfoIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HistoryTrigger } from "@/app/components/history/history-trigger";
import { AppInfoTrigger } from "@/app/components/layout/app-info/app-info-trigger";
import { DialogShare } from "@/app/components/layout/dialog-share";
import { UserMenu } from "@/app/components/layout/user-menu";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";
import { useUser } from "@/app/providers/user-provider";
import { useTheme } from "@/components/theme-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GITHUB_REPO_URL } from "@/lib/config";
import ThemeSwitchIcon from "./theme-switch-icon";

export function Header() {
  const { user } = useUser();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isLoggedIn = Boolean(user) && !user?.isAnonymous;
  const isMobile = useBreakpoint(768);

  return (
    <header className="fixed top-0 right-0 left-0 z-50 h-app-header">
      <div className="pointer-events-none absolute top-app-header left-0 z-50 mx-auto h-app-header w-full bg-background to-transparent backdrop-blur-xl [-webkit-mask-image:linear-gradient(to_bottom,black,transparent)] lg:hidden" />
      <div className="relative mx-auto flex h-full items-center justify-between bg-background px-4 sm:px-6 lg:bg-transparent lg:px-8">
        {/* Logo on mobile */}
        <div className="flex items-center md:hidden">
          <Link className="flex items-center" href="/" prefetch>
            <Image
              alt="oschat Logo"
              height={28}
              priority
              src={
                theme === "dark"
                  ? "/oschat_logo_dark.svg"
                  : "/oschat_logo_light.svg"
              }
              unoptimized
              width={100}
            />
          </Link>
        </div>

        {/* Hidden placeholder to prevent layout shift on desktop */}
        <div className="hidden w-24 md:block" />

        {isLoggedIn ? (
          <div className="flex items-center gap-4">
            {/* Mobile button for new chat */}
            {isMobile && pathname !== "/" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="New Chat"
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => router.push("/")}
                    type="button"
                  >
                    <PlusIcon size={24} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>New Chat</TooltipContent>
              </Tooltip>
            )}
            {/* Tasks button - mobile only, home page only */}
            {isMobile && pathname === "/" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Background Agents"
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => router.push("/tasks")}
                    type="button"
                  >
                    <CheckCircleIcon size={24} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Background Agents</TooltipContent>
              </Tooltip>
            )}
            {/* Mobile: Share first, then History for better UX */}
            {isMobile && (
              <>
                <DialogShare />
                <HistoryTrigger />
              </>
            )}
            {/* Desktop: History first (hidden), then Share to avoid gap */}
            {!isMobile && (
              <>
                <HistoryTrigger />
                <DialogShare />
              </>
            )}
            <ThemeSwitchIcon />
            {user && <UserMenu user={user} />}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  aria-label="View on GitHub"
                  className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  href={GITHUB_REPO_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <GithubLogoIcon
                    aria-hidden="true"
                    className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                    weight="bold"
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent>View on GitHub</TooltipContent>
            </Tooltip>
            <AppInfoTrigger
              trigger={
                <button
                  aria-label={"About"}
                  className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  tabIndex={0}
                  type="button"
                >
                  <InfoIcon
                    className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                    weight="bold"
                  />
                </button>
              }
            />
            <ThemeSwitchIcon />
            <Link
              className="font-base text-base text-muted-foreground transition-colors hover:text-foreground"
              href="/auth"
            >
              Login
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
