"use client";

import { convexQuery } from "@convex-dev/react-query";
import { ListMagnifyingGlass, PushPinSimple } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { CommandHistoryItem } from "./command-history-item";

function getSnippet(text: string, query: string, length = 80): React.ReactNode {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return text.slice(0, length);
  }
  const start = Math.max(0, idx - Math.floor((length - q.length) / 2));
  const snippet = text.slice(start, start + length);
  const matchStart = idx - start;
  return (
    <>
      {snippet.slice(0, matchStart)}
      <mark>{snippet.slice(matchStart, matchStart + q.length)}</mark>
      {snippet.slice(matchStart + q.length)}
    </>
  );
}

export function CommandHistory() {
  const router = useRouter();
  const { data: chatHistory } = useTanStackQuery({
    ...convexQuery(api.chats.listChatsForUser, {}),
  });
  const deleteChat = useMutation(api.chats.deleteChat);
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const pinChatToggle = useMutation(api.chats.pinChatToggle);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: messageResults = [] } = useTanStackQuery({
    ...convexQuery(
      api.messages.searchMessages,
      searchQuery ? { query: searchQuery } : "skip"
    ),
    enabled: Boolean(searchQuery),
  });
  const [editingId, setEditingId] = useState<Id<"chats"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<Id<"chats"> | null>(null);

  const handleEdit = useCallback((chat: Doc<"chats">) => {
    setEditingId(chat._id);
    setEditTitle(chat.title || "");
  }, []);

  const handleSaveEdit = useCallback(
    async (id: Id<"chats">) => {
      setEditingId(null);
      await updateChatTitle({ chatId: id, title: editTitle });
    },
    [editTitle, updateChatTitle]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
  }, []);

  const handleDelete = useCallback((id: Id<"chats">) => {
    setDeletingId(id);
  }, []);

  const handleConfirmDelete = useCallback(
    async (id: Id<"chats">) => {
      setDeletingId(null);
      await deleteChat({ chatId: id });
    },
    [deleteChat]
  );

  const handleCancelDelete = useCallback(() => {
    setDeletingId(null);
  }, []);

  const handleTogglePin = useCallback(
    async (chat: Doc<"chats">) => {
      await pinChatToggle({ chatId: chat._id });
    },
    [pinChatToggle]
  );

  // Listen for global openCommandHistory and toggleFloatingSearch events
  useEffect(() => {
    const open = () => setIsOpen(true);
    const toggle = () => setIsOpen((prev) => !prev);
    window.addEventListener("openCommandHistory", open);
    window.addEventListener("toggleFloatingSearch", toggle);
    return () => {
      window.removeEventListener("openCommandHistory", open);
      window.removeEventListener("toggleFloatingSearch", toggle);
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchQuery("");
      setEditingId(null);
      setEditTitle("");
      setDeletingId(null);
    }
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

  useEffect(() => {
    if (!(isOpen && chatHistory)) {
      return;
    }
    for (const chat of chatHistory) {
      router.prefetch(`/c/${chat._id}`);
    }
  }, [isOpen, chatHistory, router]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            <ListMagnifyingGlass size={24} />
          </button>
        </TooltipTrigger>
        <TooltipContent>History</TooltipContent>
      </Tooltip>

      <CommandDialog
        description="Search through your past conversations"
        onOpenChange={handleOpenChange}
        open={isOpen}
        title="Chat History"
      >
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={(value) => setSearchQuery(value)}
            placeholder="Search history..."
            value={searchQuery}
          />
          <CommandList className="max-h-[480px] min-h-[480px] flex-1">
            {/* Invisible placeholder (size zero, no pointer) so nothing visible is preselected */}
            <CommandItem
              className="pointer-events-none h-0 w-0 overflow-hidden opacity-0"
              value="__placeholder"
            />
            {filteredChat.length === 0 && messageResults.length === 0 && (
              <CommandEmpty>No chat history found.</CommandEmpty>
            )}

            {searchQuery && messageResults.length > 0 && (
              <div className="px-2 pb-2">
                <div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                  Messages
                </div>
                {messageResults.map((msg) => (
                  <CommandItem
                    className="px-2 py-1"
                    key={msg._id}
                    onSelect={() => {
                      // For messages, always navigate since the message ID parameter makes it a different URL
                      // and we want to scroll to the specific message
                      router.replace(`/c/${msg.chatId}?m=${msg._id}`, {
                        scroll: false,
                      });
                      setIsOpen(false);
                    }}
                    value={msg._id}
                  >
                    <div className="flex flex-col">
                      <span className="line-clamp-2 text-sm">
                        {getSnippet(msg.content, searchQuery)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {chatHistory?.find((c) => c._id === msg.chatId)
                          ?.title || "Untitled Chat"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </div>
            )}
            {/* Pinned Chats Section */}
            {pinnedChats.length > 0 && (
              <div className="px-2 pb-2">
                <div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                  <PushPinSimple className="mr-1.5 h-4 w-4" />
                  Pinned
                </div>
                {pinnedChats.map((chat) => (
                  <CommandHistoryItem
                    chat={chat}
                    chatHistory={chatHistory}
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
                    setEditTitle={setEditTitle}
                    setIsOpen={setIsOpen}
                  />
                ))}
              </div>
            )}
            {/* Time-based Groups */}
            {orderedGroupKeys.map(
              (groupKey) =>
                hasChatsInGroup(groupedChats, groupKey) && (
                  <div className="px-2 pb-2" key={groupKey}>
                    <div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                      {groupKey}
                    </div>
                    {groupedChats[groupKey].map((chat) => (
                      <CommandHistoryItem
                        chat={chat}
                        chatHistory={chatHistory}
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
                        setEditTitle={setEditTitle}
                        setIsOpen={setIsOpen}
                      />
                    ))}
                  </div>
                )
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
