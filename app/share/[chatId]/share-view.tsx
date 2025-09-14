"use client";

import type { UIMessage } from "@ai-sdk/react";
import { ArrowUpRight, Lock } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Message } from "@/app/components/chat/message";
import { useUser } from "@/app/providers/user-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { shouldDisableFork } from "@/lib/redacted-content-detector";

type SharedMessage = {
  _id: string;
  role: UIMessage["role"];
  parts?: UIMessage["parts"];
  metadata?: Record<string, unknown>;
};

function getButtonText(canFork: boolean, isAuthenticated: boolean): string {
  if (!canFork) {
    return "Cannot fork this chat";
  }
  return isAuthenticated ? "Continue in your chat" : "Sign in to continue";
}

function getAriaLabel(canFork: boolean, isAuthenticated: boolean): string {
  if (!canFork) {
    return "Cannot fork - contains private content";
  }
  return isAuthenticated ? "Continue in your chat" : "Sign in to continue";
}

export default function ShareView({
  messages,
  sourceChatId,
}: {
  messages: SharedMessage[];
  sourceChatId: string;
}) {
  const { user } = useUser();
  const fork = useMutation(api.chats.forkFromShared);
  const router = useRouter();
  const [showCannotForkDialog, setShowCannotForkDialog] = useState(false);

  const isAuthenticated = Boolean(user && !user.isAnonymous);

  // Check if messages contain redacted content
  const canFork = !shouldDisableFork(messages);

  const onFork = async () => {
    try {
      const result = await fork({ sourceChatId: sourceChatId as Id<"chats"> });
      // Navigate to the new chat
      router.push(`/c/${result.chatId}`);
    } catch (error) {
      // Provide user-friendly error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      let friendlyMessage = "Failed to fork chat. Please try again.";

      if (errorMessage.includes("UNAUTHENTICATED")) {
        friendlyMessage = "Please sign in to fork this chat.";
      } else if (errorMessage.includes("NOT_PUBLIC")) {
        friendlyMessage = "This chat is no longer publicly available.";
      } else if (errorMessage.includes("NOT_FOUND")) {
        friendlyMessage = "Chat not found or no longer available.";
      } else if (errorMessage.includes("REDACTED_CONTENT")) {
        // Open the existing redaction / cannot fork dialog and skip toast
        setShowCannotForkDialog(true);
        return;
      }

      toast({
        title: "Fork Failed",
        description: friendlyMessage,
        status: "error",
      });
    }
  };

  const onSignIn = () => {
    router.push("/auth");
  };

  const handleButtonClick = () => {
    if (!canFork) {
      // Show dialog for redacted content
      setShowCannotForkDialog(true);
    } else if (isAuthenticated) {
      // Fork the chat
      onFork();
    } else {
      // Sign in to continue
      onSignIn();
    }
  };
  if (!messages || messages.length === 0) {
    return (
      <div className="text-center text-muted-foreground">No messages.</div>
    );
  }

  return (
    <div className="mt-10 w-full">
      {messages.map((m, idx) => (
        <Message
          hasScrollAnchor={false}
          id={m._id}
          isLast={idx === messages.length - 1}
          key={m._id}
          metadata={m.metadata ?? {}}
          onBranch={() => {
            /* No-op: shared messages cannot be branched */
          }}
          onDelete={() => {
            /* No-op: shared messages cannot be deleted */
          }}
          onEdit={() => {
            /* No-op: shared messages cannot be edited */
          }}
          onReload={() => {
            /* No-op: shared messages cannot be reloaded */
          }}
          parts={m.parts}
          readOnly={true}
          status="ready"
          variant={m.role}
        />
      ))}
      {/* Floating CTA inspired by Zola's "Ask Zola" */}
      <div className="fixed bottom-6 left-0 z-50 flex w-full justify-center">
        <Button
          aria-label={getAriaLabel(canFork, isAuthenticated)}
          className="group flex h-12 items-center justify-between rounded-full border border-border bg-background py-2 pr-2 pl-4 text-muted-foreground shadow-sm transition-all hover:scale-[1.02] hover:bg-background active:scale-[0.98]"
          onClick={handleButtonClick}
          variant="outline"
        >
          <span className="flex items-center gap-2">
            {!canFork && <Lock className="h-5 w-5" />}
            {getButtonText(canFork, isAuthenticated)}
          </span>
          {canFork && (
            <span className="rounded-full bg-black/20 p-2 backdrop-blur-sm transition-colors group-hover:bg-black/30">
              <ArrowUpRight className="h-4 w-4 text-white" />
            </span>
          )}
        </Button>
      </div>

      {/* Cannot Fork Dialog */}
      <Dialog
        onOpenChange={setShowCannotForkDialog}
        open={showCannotForkDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Cannot Fork Chat
            </DialogTitle>
            <DialogDescription>
              Forking is disabled because some of this chat's content has been
              redacted for privacy.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Button
              className="w-full"
              onClick={() => setShowCannotForkDialog(false)}
            >
              I understand
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
