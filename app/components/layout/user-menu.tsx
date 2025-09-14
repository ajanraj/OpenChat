"use client";

import {
  ChatCircleDotsIcon,
  Eye,
  EyeSlash,
  SignOut,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import React from "react";
import { useUser } from "@/app/providers/user-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Doc } from "../../../convex/_generated/dataModel";
// import dynamic from "next/dynamic"
// import { APP_NAME } from "../../../lib/config"
import { AppInfoTrigger } from "./app-info/app-info-trigger";
import { SettingsTrigger } from "./settings/settings-trigger";

export function UserMenu({ user }: { user: Doc<"users"> }) {
  const { signOut } = useUser();
  const router = useRouter();
  const [isMenuOpen, setMenuOpen] = React.useState(false);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);

  const [showEmail, setShowEmail] = React.useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("showEmail") === "true";
  });

  const maskEmail = (email?: string) => {
    if (!email) {
      return "";
    }
    const [local, domain] = email.split("@");
    const tld = domain.substring(domain.lastIndexOf("."));
    const prefix = local.slice(0, 2);
    return `${prefix}*****${tld}`;
  };

  const handleSettingsOpenChange = (isOpen: boolean) => {
    setSettingsOpen(isOpen);
    if (!isOpen) {
      setMenuOpen(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({ title: "Logged out", status: "success" });
      router.push("/");
    } catch {
      toast({ title: "Failed to sign out", status: "error" });
    }
  };

  return (
    <DropdownMenu modal={false} onOpenChange={setMenuOpen} open={isMenuOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger>
            <Avatar>
              <AvatarImage src={user?.image ?? undefined} />
              <AvatarFallback>
                {user?.name?.charAt(0) ||
                  (user?.email ? user.email.charAt(0) : "")}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Profile</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-56"
        forceMount
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (isSettingsOpen) {
            e.preventDefault();
            return;
          }
        }}
        onInteractOutside={(e) => {
          if (isSettingsOpen) {
            e.preventDefault();
            return;
          }
          setMenuOpen(false);
        }}
      >
        <DropdownMenuItem className="flex flex-col items-start gap-0 no-underline hover:bg-transparent focus:bg-transparent">
          <span>{user?.name}</span>
          <button
            className="flex items-center gap-1 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setShowEmail((prev) => {
                localStorage.setItem("showEmail", (!prev).toString());
                return !prev;
              });
            }}
            type="button"
          >
            <span>{showEmail ? user?.email : maskEmail(user?.email)}</span>
            {showEmail ? (
              <EyeSlash className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SettingsTrigger
          isMenuItem={true}
          onOpenChange={handleSettingsOpenChange}
        />
        <DropdownMenuItem
          onSelect={() => {
            window.open(
              "https://oschat.userjot.com",
              "_blank",
              "noopener,noreferrer"
            );
          }}
        >
          <ChatCircleDotsIcon className="size-4" />
          Feedback
        </DropdownMenuItem>
        <AppInfoTrigger />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
        >
          <SignOut className="mr-2 size-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
