"use client";

import { convexQuery } from "@convex-dev/react-query";
import { MagnifyingGlass, Plus, SidebarSimple } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatSession } from "@/app/providers/chat-session-provider";
import { useSidebar } from "@/app/providers/sidebar-provider";
import { useUser } from "@/app/providers/user-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { ChatList } from "./chat-list";

const ChatSidebar = memo(function SidebarComponent() {
  const { isSidebarOpen: isOpen, toggleSidebar } = useSidebar();
  const { theme } = useTheme();
  const { data: chatsQuery = [], isLoading: chatsLoading } = useTanStackQuery({
    ...convexQuery(api.chats.listChatsForUser, {}),
    // Extended cache for chat list to prevent flickering
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const deleteChat = useMutation(api.chats.deleteChat);
  const pinChatToggle = useMutation(api.chats.pinChatToggle);
  const { setIsDeleting: setChatIsDeleting, chatId: activeChatId } =
    useChatSession();
  // Keep a stable ref to the latest activeChatId so callbacks don't change on chat switch
  const activeChatIdRef = useRef<string | null>(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const { user } = useUser();

  const router = useRouter();
  const pathname = usePathname();

  // State for search and edit/delete in the main sidebar list
  const [searchQuery, setSearchQuery] = useState("");

  // Memoize search input handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  // Memoize search button handler
  const handleSearchButtonClick = useCallback(() => {
    if (!isOpen) {
      window.dispatchEvent(new Event("openCommandHistory"));
    }
  }, [isOpen]);

  // Memoize new chat button handler
  const handleNewChatClick = useCallback(() => {
    router.push("/");
  }, [router]);

  // Memoize conditional new chat button handler
  const handleConditionalNewChatClick = useCallback(() => {
    if (pathname !== "/") {
      router.push("/");
    }
  }, [pathname, router]);

  // Memoize conditional tasks button handler
  const handleConditionalTasksClick = useCallback(() => {
    if (!user || user.isAnonymous) {
      router.push("/auth");
      return;
    }

    if (pathname !== "/tasks") {
      router.push("/tasks");
    }
  }, [pathname, router, user]);

  // Use chats directly from query (already memoized by TanStack Query)
  const chats = chatsQuery;

  // --- Handlers for main sidebar list ---
  const handleSaveEdit = useCallback(
    async (id: Id<"chats">, newTitle: string) => {
      await updateChatTitle({ chatId: id, title: newTitle });
    },
    [updateChatTitle]
  );

  const handleConfirmDelete = useCallback(
    async (id: Id<"chats">) => {
      // Determine current chat at execution time to avoid dependency churn
      const isCurrentChat = activeChatIdRef.current === id;
      if (isCurrentChat) {
        // Signal to the active Chat component that we are deleting it so it can
        // suppress the "Chat not found" toast during the brief race condition
        // between the mutation completing and the route change finishing.
        setChatIsDeleting(true);
      }

      try {
        await deleteChat({ chatId: id });

        if (isCurrentChat) {
          router.push("/");
          // We intentionally do NOT reset `isDeleting` here. The
          // ChatSessionProvider will automatically clear this flag when the route
          // (and therefore the chatId) changes, ensuring the flag remains set
          // long enough for the Chat component to unmount and preventing a false
          // "Chat not found" error toast.
        }
      } catch (err) {
        // Roll back deletion flag on error so UI interactions are not blocked.
        if (isCurrentChat) {
          setChatIsDeleting(false);
        }
        throw err;
      }
    },
    [deleteChat, router, setChatIsDeleting]
  );

  const handleTogglePin = useCallback(
    async (id: Id<"chats">) => {
      await pinChatToggle({ chatId: id });
    },
    [pinChatToggle]
  );

  // Memoize filtered chats with early return for empty arrays
  const filteredChats = useMemo(() => {
    if (!chats?.length) {
      return [];
    }
    if (!searchQuery.trim()) {
      return chats;
    }

    const lowerQuery = searchQuery.toLowerCase();
    return chats.filter((chat) =>
      (chat.title || "").toLowerCase().includes(lowerQuery)
    );
  }, [chats, searchQuery]);

  // Memoize pinned and unpinned chats with optimized single-pass separation
  const { pinnedChats, unpinnedChats } = useMemo(() => {
    if (!filteredChats.length) {
      return { pinnedChats: [], unpinnedChats: [] };
    }

    const pinned: Doc<"chats">[] = [];
    const unpinned: Doc<"chats">[] = [];

    // Single pass through the array instead of two filter operations
    for (const chat of filteredChats) {
      if (chat.isPinned) {
        pinned.push(chat);
      } else {
        unpinned.push(chat);
      }
    }

    return { pinnedChats: pinned, unpinnedChats: unpinned };
  }, [filteredChats]);

  // Memoize grouped chats and ordered group keys
  const { groupedChats, orderedGroupKeys } = useMemo(() => {
    const grouped = groupChatsByTime(unpinnedChats);
    const ordered = getOrderedGroupKeys();
    return { groupedChats: grouped, orderedGroupKeys: ordered };
  }, [unpinnedChats]);

  return (
    <div className="z-51 hidden md:block">
      {/* Fixed collapse button with animated extra buttons (always same size/position) */}
      <div className="fixed top-4 left-4 z-[60] flex flex-row items-center">
        <button
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          className={
            "group flex items-center justify-center rounded-full p-2 outline-none transition-all duration-300 hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          }
          onClick={toggleSidebar}
          tabIndex={0}
          type="button"
        >
          <SidebarSimple
            className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
            weight="bold"
          />
        </button>
        {/* Animated search and new chat buttons in collapsed state only */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              animate={{
                x: isOpen ? -8 : 0,
                scale: isOpen ? 0.5 : 1,
                opacity: isOpen ? 0 : 1,
              }}
              aria-label="Search"
              className="group pointer-events-auto ml-1 flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              initial={{
                x: isOpen ? -8 : 0,
                scale: isOpen ? 0.5 : 1,
                opacity: isOpen ? 0 : 1,
              }}
              onClick={handleSearchButtonClick}
              style={{ pointerEvents: isOpen ? "none" : "auto" }}
              tabIndex={isOpen ? -1 : 0}
              transition={{
                ...TRANSITION_LAYOUT,
                delay: isOpen ? 0 : 0.1,
              }}
              type="button"
            >
              <MagnifyingGlass
                className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                weight="bold"
              />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent>Search</TooltipContent>
        </Tooltip>
        {pathname !== "/" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                animate={{
                  x: isOpen ? -8 : 0,
                  scale: isOpen ? 0.5 : 1,
                  opacity: isOpen ? 0 : 1,
                }}
                aria-label="New chat"
                className="group pointer-events-auto ml-1 flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                initial={{
                  x: isOpen ? -8 : 0,
                  scale: isOpen ? 0.5 : 1,
                  opacity: isOpen ? 0 : 1,
                }}
                onClick={handleNewChatClick}
                style={{ pointerEvents: isOpen ? "none" : "auto" }}
                tabIndex={isOpen ? -1 : 0}
                transition={{
                  ...TRANSITION_LAYOUT,
                  delay: isOpen ? 0 : 0.1,
                }}
                type="button"
              >
                <Plus
                  className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                  weight="bold"
                />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>New Chat</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* The actual sidebar panel - NO LONGER FIXED or TRANSLATING */}
      <motion.aside
        animate={{
          width: isOpen ? 256 : 0,
        }}
        className="flex h-dvh flex-col overflow-hidden border-muted-foreground/10 border-r bg-background shadow-lg"
        initial={{
          width: isOpen ? 256 : 0,
        }}
        transition={TRANSITION_LAYOUT}
      >
        <div className="flex h-[60px] shrink-0 items-center justify-center pt-2">
          <motion.div
            animate={{
              opacity: isOpen ? 1 : 0,
            }}
            initial={{
              opacity: isOpen ? 1 : 0,
            }}
            transition={{
              duration: 0.15,
              ease: "easeInOut",
              delay: isOpen ? 0.1 : 0,
            }}
          >
            <Link
              className="flex items-center justify-center"
              href="/"
              prefetch
            >
              <Image
                alt="oschat Logo"
                className="antialiased"
                height={32}
                priority
                src={
                  theme === "dark"
                    ? "/oschat_logo_dark.svg"
                    : "/oschat_logo_light.svg"
                }
                style={{
                  filter: "none",
                  imageRendering: "auto",
                }}
                unoptimized
                width={128}
              />
            </Link>
          </motion.div>
        </div>

        {/* Fixed Action Buttons Section - New Chat, Tasks, Search */}
        <motion.div
          animate={{
            opacity: isOpen ? 1 : 0,
          }}
          className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-0"
          initial={{
            opacity: isOpen ? 1 : 0,
          }}
          transition={{
            ...TRANSITION_LAYOUT,
            delay: isOpen ? 0.15 : 0,
          }}
        >
          <Button
            className="h-9 w-full justify-center font-bold text-sm"
            onClick={handleConditionalNewChatClick}
            variant="outline"
          >
            New Chat
          </Button>

          <Button
            className="h-9 w-full justify-center font-bold text-sm"
            onClick={handleConditionalTasksClick}
            variant="outline"
          >
            Background Agents
          </Button>

          <div className="relative">
            <MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus={isOpen}
              className="h-9 w-full pl-8 text-sm"
              onChange={handleSearchChange}
              placeholder="Search chats..."
              type="search"
              value={searchQuery}
            />
          </div>
        </motion.div>

        {/* Scrollable Chat List Section */}
        <motion.div
          animate={{
            opacity: isOpen ? 1 : 0,
          }}
          className="flex flex-grow flex-col overflow-y-auto px-4 pt-4 pb-4"
          initial={{
            opacity: isOpen ? 1 : 0,
          }}
          transition={{
            ...TRANSITION_LAYOUT,
            delay: isOpen ? 0.15 : 0,
          }}
        >
          {chatsLoading && chats.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  className="h-8 animate-pulse rounded bg-muted/50"
                  // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items don't change
                  key={i}
                />
              ))}
            </div>
          ) : (
            <ChatList
              activeChatId={activeChatId}
              groupedChats={groupedChats}
              handleConfirmDelete={handleConfirmDelete}
              handleSaveEdit={handleSaveEdit}
              handleTogglePin={handleTogglePin}
              hasChatsInGroup={hasChatsInGroup}
              orderedGroupKeys={orderedGroupKeys}
              pinnedChats={pinnedChats}
            />
          )}
        </motion.div>
      </motion.aside>
    </div>
  );
});

export default ChatSidebar;
