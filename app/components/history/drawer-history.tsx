import { convexQuery } from "@convex-dev/react-query";
import {
  Check,
  MagnifyingGlass,
  PencilSimple,
  PushPinSimpleIcon,
  PushPinSimpleSlashIcon,
  TrashSimple,
  X,
} from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  getOrderedGroupKeys,
  groupChatsByTime,
  hasChatsInGroup,
} from "@/lib/chat-utils/time-grouping";

type DrawerHistoryProps = {
  trigger: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

type DrawerHistoryItemProps = {
  chat: Doc<"chats">;
  pinned: boolean;
  editingId: Id<"chats"> | null;
  editTitle: string;
  deletingId: Id<"chats"> | null;
  handleEdit: (chat: Doc<"chats">) => void;
  handleSaveEdit: (id: Id<"chats">) => void;
  handleCancelEdit: () => void;
  handleDelete: (id: Id<"chats">) => void;
  handleConfirmDelete: (id: Id<"chats">) => void;
  handleCancelDelete: () => void;
  handleTogglePin: (chat: Doc<"chats">) => void;
  setEditTitle: (title: string) => void;
  currentChatId?: string;
  closeDrawer: () => void;
};

function DrawerHistoryItem({
  chat,
  pinned,
  editingId,
  editTitle,
  deletingId,
  handleEdit,
  handleSaveEdit,
  handleCancelEdit,
  handleDelete,
  handleConfirmDelete,
  handleCancelDelete,
  handleTogglePin,
  setEditTitle,
  currentChatId,
  closeDrawer,
}: DrawerHistoryItemProps) {
  const isEditing = editingId === chat._id;
  const isDeleting = deletingId === chat._id;
  const isCurrent = chat._id === currentChatId;

  if (isEditing) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-accent px-2 py-2.5">
        <form
          className="flex w-full items-center justify-between"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveEdit(chat._id);
          }}
        >
          <Input
            autoFocus
            className="h-8 flex-1"
            onChange={(e) => setEditTitle(e.target.value)}
            value={editTitle}
          />
          <div className="ml-2 flex gap-1">
            <Button
              className="h-8 w-8"
              size="icon"
              type="submit"
              variant="ghost"
            >
              <Check className="size-4" />
            </Button>
            <Button
              className="h-8 w-8"
              onClick={handleCancelEdit}
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
      <div className="flex items-center justify-between rounded-lg bg-accent px-2 py-2.5">
        <form
          className="flex w-full items-center justify-between"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmDelete(chat._id);
          }}
        >
          <div className="flex flex-1 items-center">
            <span className="font-normal text-base">{chat.title}</span>
            <input
              autoFocus
              className="sr-only"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelDelete();
                }
              }}
              type="text"
            />
          </div>
          <div className="ml-2 flex gap-1">
            <Button
              className="size-8 text-muted-foreground hover:text-destructive"
              size="icon"
              type="submit"
              variant="ghost"
            >
              <Check className="size-4" />
            </Button>
            <Button
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={handleCancelDelete}
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

  return (
    <div
      className={`group flex items-center justify-between rounded-lg px-2 py-1.5 ${
        isCurrent ? "bg-accent/50" : ""
      }`}
    >
      <Link
        className="flex flex-1 flex-col items-start"
        href={isCurrent ? "#" : `/c/${chat._id}`}
        onClick={(e) => {
          if (isCurrent) {
            e.preventDefault();
            closeDrawer();
          } else {
            closeDrawer();
          }
        }}
        prefetch
      >
        <span className="line-clamp-1 font-normal text-base">{chat.title}</span>
      </Link>
      <div className="flex items-center">
        <div className="flex gap-1">
          <Button
            className="size-8 text-muted-foreground hover:text-orange-600"
            onClick={(e) => {
              e.preventDefault();
              handleTogglePin(chat);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            {pinned ? (
              <PushPinSimpleSlashIcon className="size-4" />
            ) : (
              <PushPinSimpleIcon className="size-4" />
            )}
          </Button>
          <Button
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              handleEdit(chat);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PencilSimple className="size-4" />
          </Button>
          <Button
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              handleDelete(chat._id);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <TrashSimple className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DrawerHistory({
  trigger,
  isOpen,
  setIsOpen,
}: DrawerHistoryProps) {
  const params = useParams<{ chatId?: string }>();
  const currentChatId = params.chatId;
  const { data: chatHistory } = useTanStackQuery({
    ...convexQuery(api.chats.listChatsForUser, {}),
  });
  const deleteChat = useMutation(api.chats.deleteChat);
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const pinChatToggle = useMutation(api.chats.pinChatToggle);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<Id<"chats"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<Id<"chats"> | null>(null);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchQuery("");
      setEditingId(null);
      setEditTitle("");
      setDeletingId(null);
    }
  };

  const handleEdit = (chat: Doc<"chats">) => {
    setEditingId(chat._id);
    setEditTitle(chat.title || "");
  };

  const handleSaveEdit = async (id: Id<"chats">) => {
    setEditingId(null);
    await updateChatTitle({ chatId: id, title: editTitle });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDelete = (id: Id<"chats">) => {
    setDeletingId(id);
  };

  const handleConfirmDelete = async (id: Id<"chats">) => {
    setDeletingId(null);
    await deleteChat({ chatId: id });
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
  };

  const handleTogglePin = async (chat: Doc<"chats">) => {
    await pinChatToggle({ chatId: chat._id });
  };

  const filteredChat =
    chatHistory?.filter((chat) =>
      (chat.title || "").toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];

  // Separate pinned and unpinned chats
  const pinnedChats = filteredChat.filter((chat) => chat.isPinned);
  const unpinnedChats = filteredChat.filter((chat) => !chat.isPinned);

  // Group unpinned chats by time
  const groupedChats = groupChatsByTime(unpinnedChats);
  const orderedGroupKeys = getOrderedGroupKeys();

  return (
    <Drawer onOpenChange={handleOpenChange} open={isOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>History</TooltipContent>
      </Tooltip>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>History</DrawerTitle>
          <DrawerDescription className="hidden">
            History of your chats
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex h-dvh max-h-[80vh] flex-col">
          <div className="border-b p-4 pb-3">
            <div className="relative">
              <Input
                className="rounded-lg py-1.5 pl-8"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                value={searchQuery}
              />
              <MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 transform text-gray-400" />
            </div>
          </div>

          <ScrollArea className="flex-1 overflow-auto">
            <div className="flex flex-col space-y-2 px-4 pt-4 pb-8">
              {/* Pinned Chats Section */}
              {pinnedChats.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    <PushPinSimpleIcon className="mr-1 h-3 w-3" />
                    Pinned
                  </h3>
                  {pinnedChats.map((chat) => (
                    <DrawerHistoryItem
                      chat={chat}
                      closeDrawer={() => setIsOpen(false)}
                      currentChatId={currentChatId}
                      deletingId={deletingId}
                      editingId={editingId}
                      editTitle={editTitle}
                      handleCancelDelete={handleCancelDelete}
                      handleCancelEdit={handleCancelEdit}
                      handleConfirmDelete={handleConfirmDelete}
                      handleDelete={handleDelete}
                      handleEdit={handleEdit}
                      handleSaveEdit={handleSaveEdit}
                      handleTogglePin={handleTogglePin}
                      key={chat._id}
                      pinned
                      setEditTitle={setEditTitle}
                    />
                  ))}
                </div>
              )}
              {/* Time-based Groups */}
              {orderedGroupKeys.map(
                (groupKey) =>
                  hasChatsInGroup(groupedChats, groupKey) && (
                    <div className="space-y-2" key={groupKey}>
                      <h3 className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {groupKey}
                      </h3>
                      {groupedChats[groupKey].map((chat) => (
                        <DrawerHistoryItem
                          chat={chat}
                          closeDrawer={() => setIsOpen(false)}
                          currentChatId={currentChatId}
                          deletingId={deletingId}
                          editingId={editingId}
                          editTitle={editTitle}
                          handleCancelDelete={handleCancelDelete}
                          handleCancelEdit={handleCancelEdit}
                          handleConfirmDelete={handleConfirmDelete}
                          handleDelete={handleDelete}
                          handleEdit={handleEdit}
                          handleSaveEdit={handleSaveEdit}
                          handleTogglePin={handleTogglePin}
                          key={chat._id}
                          pinned={false}
                          setEditTitle={setEditTitle}
                        />
                      ))}
                    </div>
                  )
              )}
            </div>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
