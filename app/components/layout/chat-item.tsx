"use client";

import {
  Check,
  GitBranch,
  PencilSimple,
  PushPinSimple,
  PushPinSimpleSlash,
  TrashSimple,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Id } from "@/convex/_generated/dataModel";

// Helper function for conditional classes
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

type ChatItemProps = {
  id: Id<"chats">;
  title: string | undefined;
  originalChatId?: Id<"chats">;
  parentChatTitle?: string;
  handleSaveEdit: (id: Id<"chats">, title: string) => void;
  handleConfirmDelete: (id: Id<"chats">) => void;
  handleTogglePin: (id: Id<"chats">) => void;
  isPinned: boolean;
  isActive?: boolean;
};

const ChatItemComponent = function ChatItemComponent({
  id,
  title,
  originalChatId,
  parentChatTitle,
  handleSaveEdit,
  handleConfirmDelete,
  handleTogglePin,
  isPinned,
  isActive,
}: ChatItemProps): React.ReactElement {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title || "");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const onSave = () => {
    handleSaveEdit(id, editedTitle);
    setIsEditing(false);
  };

  const onDelete = () => {
    handleConfirmDelete(id);
    setIsDeleting(false);
  };

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="group/menu-item relative flex h-9 items-center rounded-lg bg-accent px-2 py-0.5">
          <form
            className="flex w-full items-center justify-between"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <Input
              autoFocus
              className="h-8 flex-1 rounded-none border-0 bg-transparent px-1 text-sm shadow-none outline-none focus:ring-0"
              onChange={(e) => setEditedTitle(e.target.value)}
              value={editedTitle}
            />
            <div className="ml-2 flex gap-0.5">
              <Button
                className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-primary"
                size="icon"
                type="submit"
                variant="ghost"
              >
                <Check className="size-4" />
              </Button>
              <Button
                className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => setIsEditing(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
          </form>
        </div>
      );
    }

    if (isDeleting) {
      return (
        <div className="group/menu-item relative flex h-9 w-full items-center overflow-hidden rounded-lg bg-accent px-2 py-1 text-accent-foreground text-sm">
          <div className="flex w-full items-center justify-between">
            <span className="font-medium text-destructive text-sm">
              Delete chat?
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Check className="size-4" />
              </Button>
              <Button
                className="size-8 rounded-md p-1.5 text-muted-foreground hover:text-primary"
                onClick={(e) => {
                  e.preventDefault();
                  setIsDeleting(false);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        className={cn(
          "group/link relative flex h-9 w-full items-center overflow-hidden rounded-lg px-2 py-1 text-sm outline-none",
          "hover:bg-accent hover:text-accent-foreground focus-visible:text-accent-foreground",
          "focus-visible:ring-2 focus-visible:ring-primary",
          isActive && "bg-accent text-accent-foreground"
        )}
        href={`/c/${id}`}
        key={id}
        onClick={(e) => {
          if (isActive) {
            e.preventDefault();
          }
        }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        prefetch
        replace
        scroll={false}
      >
        <div className="relative flex w-full items-center">
          {originalChatId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="mr-1 text-muted-foreground/50 hover:text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/c/${originalChatId}`);
                  }}
                  type="button"
                >
                  <GitBranch className="h-4 w-4 rotate-180" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="z-[9999]" side="top">
                Branched From: {parentChatTitle ?? "Parent Chat"}
              </TooltipContent>
            </Tooltip>
          )}
          <div className="relative w-full">
            <span className="hover:truncate-none pointer-events-none block h-full w-full cursor-pointer overflow-hidden truncate rounded bg-transparent px-1 py-1 text-sm outline-none">
              {title}
            </span>
          </div>
        </div>
        {(showActions || isActive) && (
          <div className="-right-0.25 pointer-events-auto absolute top-0 bottom-0 z-10 flex translate-x-full items-center justify-end text-muted-foreground transition-transform duration-200 group-hover/link:translate-x-0 group-hover/link:bg-accent dark:group-hover/link:bg-muted">
            <div className="pointer-events-none absolute top-0 right-[100%] bottom-0 h-12 w-8 bg-gradient-to-l from-accent to-transparent opacity-0 transition-opacity duration-200 group-hover/link:opacity-100 dark:from-muted" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-400"
                  onClick={(e) => {
                    e.preventDefault();
                    handleTogglePin(id);
                  }}
                  size="icon"
                  tabIndex={-1}
                  type="button"
                  variant="ghost"
                >
                  {isPinned ? (
                    <PushPinSimpleSlash className="size-4" />
                  ) : (
                    <PushPinSimple className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[9999]" side="bottom">
                {isPinned ? "Unpin" : "Pin Chat"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsEditing(true);
                  }}
                  size="icon"
                  tabIndex={-1}
                  type="button"
                  variant="ghost"
                >
                  <PencilSimple className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[9999]" side="bottom">
                Edit
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/50 hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsDeleting(true);
                  }}
                  size="icon"
                  tabIndex={-1}
                  type="button"
                  variant="ghost"
                >
                  <TrashSimple className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[9999]" side="bottom">
                Delete
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </Link>
    );
  };

  return (
    <li className="group/menu-item relative" key={id}>
      {renderContent()}
    </li>
  );
};

// Export with custom memo comparison to prevent unnecessary re-renders
export const ChatItem = React.memo(
  ChatItemComponent,
  (prevProps, nextProps) => {
    // Only re-render if props that affect the UI have actually changed
    return (
      prevProps.id === nextProps.id &&
      prevProps.title === nextProps.title &&
      prevProps.originalChatId === nextProps.originalChatId &&
      prevProps.parentChatTitle === nextProps.parentChatTitle &&
      prevProps.isPinned === nextProps.isPinned &&
      prevProps.isActive === nextProps.isActive
      // Note: We intentionally don't compare handler functions as they're
      // memoized in the parent and should be stable across renders
    );
  }
);
