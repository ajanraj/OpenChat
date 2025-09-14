"use client";

import { convexQuery } from "@convex-dev/react-query";
import {
  Check,
  Copy,
  Export as ExportIcon,
  FacebookLogo,
  LinkedinLogo,
  RedditLogo,
  SpinnerGap,
  XLogo as XLogoIcon,
} from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useChatSession } from "@/app/providers/chat-session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { APP_BASE_URL } from "@/lib/config/constants";

export function DialogShare() {
  const { chatId } = useChatSession();
  const pathname = usePathname();
  const canShare = useMemo(
    () => Boolean(chatId) && pathname?.startsWith("/c/"),
    [chatId, pathname]
  );

  // Load current chat status to know if it's already shared
  const { data: currentChat } = useTanStackQuery({
    ...convexQuery(
      api.chats.getChat,
      chatId ? ({ chatId } as unknown as { chatId: Id<"chats"> }) : "skip"
    ),
    enabled: Boolean(chatId),
  });

  const isShared = Boolean(currentChat?.public);

  const publishChat = useMutation(api.chats.publishChat);
  const unpublishChat = useMutation(api.chats.unpublishChat);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"confirm" | "link">("confirm");
  // Default OFF (do not include attachments/images)
  const [includeImages, setIncludeImages] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  if (!canShare) {
    return null;
  }

  const publicLink = `${APP_BASE_URL}/share/${chatId}`;
  const shareTitle = currentChat?.title || "Chat";

  const onOpenDialog = () => {
    // If already shared, go to link/settings view; else confirm first
    if (isShared) {
      setStep("link");
      setIncludeImages(currentChat?.shareAttachments ?? false);
    } else {
      setStep("confirm");
      setIncludeImages(false);
    }
    setOpen(true);
  };

  const onCreateLink = async () => {
    if (!chatId) {
      return;
    }
    setIsLoading(true);
    try {
      await publishChat({
        chatId: chatId as Id<"chats">,
        hideImages: !includeImages,
      });
      setStep("link");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleIncludeImages = async (value: boolean) => {
    setIncludeImages(value);
    if (!chatId) {
      return;
    }
    // Only update backend live when already shared (link step)
    if (step === "link") {
      try {
        setIsToggling(true);
        await publishChat({
          chatId: chatId as Id<"chats">,
          hideImages: !value,
        });
      } finally {
        setIsToggling(false);
      }
    }
  };

  const onUnshare = async () => {
    if (!chatId) {
      return;
    }
    setIsLoading(true);
    try {
      await unpublishChat({ chatId: chatId as Id<"chats"> });
      // Return to confirm step with defaults
      setStep("confirm");
      setIncludeImages(false);
    } finally {
      setIsLoading(false);
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Share"
              className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              disabled={isLoading}
              onClick={onOpenDialog}
              tabIndex={0}
              type="button"
            >
              {isLoading ? (
                <SpinnerGap className="size-5 animate-spin text-muted-foreground transition-colors group-hover:text-foreground" />
              ) : (
                <ExportIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Share chat</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-[500px]">
          {step === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>Share conversation</DialogTitle>
                <DialogDescription>
                  You are sharing the entire conversation. Tool calls are
                  redacted for privacy.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Include attachments/images</span>
                  <Switch
                    aria-label="Include attachments and images"
                    checked={includeImages}
                    onCheckedChange={setIncludeImages}
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => setOpen(false)}
                  variant="outline"
                >
                  Close
                </Button>
                <Button
                  className="flex-1"
                  disabled={isLoading}
                  onClick={onCreateLink}
                >
                  {isLoading ? (
                    <>
                      <SpinnerGap className="mr-2 size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create link"
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share conversation</DialogTitle>
                <DialogDescription>
                  {isShared ? (
                    <>
                      A publicly accessible link to this conversation has been
                      created. You can manage your shared links in{" "}
                      <Link
                        className="underline underline-offset-4"
                        href="/settings/history"
                      >
                        your settings
                      </Link>
                      .
                    </>
                  ) : (
                    "Anyone with the link can view a sanitized version of this chat."
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                {/* Settings visible when shared */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Include attachments/images</span>
                  <Switch
                    aria-label="Include attachments and images"
                    checked={includeImages}
                    disabled={isToggling || isLoading}
                    onCheckedChange={handleToggleIncludeImages}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Public share link"
                      readOnly
                      value={publicLink}
                    />
                    <Button onClick={onCopy} variant="outline">
                      {copied ? (
                        <>
                          <Check className="mr-1 size-4" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1 size-4" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid w-full grid-cols-2 gap-2">
                  <Button
                    aria-label="Share on Twitter"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://x.com/intent/tweet?url=${encodeURIComponent(publicLink)}&text=${encodeURIComponent(shareTitle)}`,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    variant="outline"
                  >
                    <XLogoIcon className="mr-2 size-4" /> Twitter
                  </Button>
                  <Button
                    aria-label="Share on Reddit"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://www.reddit.com/submit?url=${encodeURIComponent(publicLink)}&title=${encodeURIComponent(shareTitle)}`,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    variant="outline"
                  >
                    <RedditLogo className="mr-2 size-4" /> Reddit
                  </Button>
                  <Button
                    aria-label="Share on LinkedIn"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicLink)}`,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    variant="outline"
                  >
                    <LinkedinLogo className="mr-2 size-4" /> LinkedIn
                  </Button>
                  <Button
                    aria-label="Share on Facebook"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicLink)}`,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    variant="outline"
                  >
                    <FacebookLogo className="mr-2 size-4" /> Facebook
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex">
                <Button
                  className="w-full"
                  disabled={isLoading}
                  onClick={onUnshare}
                  variant="destructive"
                >
                  Unshare conversation
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
