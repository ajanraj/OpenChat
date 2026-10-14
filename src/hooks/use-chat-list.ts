import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { usePaginatedQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Chats fetched per page of the chat list. */
export const CHAT_LIST_PAGE_SIZE = 50;

/**
 * A profile's chats for the sidebar, history palette and drawer, split into pinned and other
 * chats. Nothing loads while `profileId` is undefined (still loading); null means the user has no
 * profile yet, so no chats. Without a search term, chats are paged by recent activity (`loadMore`
 * fetches the next page) and pinned chats come from their own query so they always show; pinned
 * chats past that query's cap stay in the paged list. With a term, both lists hold the server's
 * title-search matches.
 */
export function useChatList(searchTerm: string, profileId: Id<"profiles"> | null | undefined) {
  const term = searchTerm.trim();
  const { results, status, loadMore } = usePaginatedQuery(
    api.chats.listChatsForUser,
    profileId ? { profileId } : "skip",
    { initialNumItems: CHAT_LIST_PAGE_SIZE },
  );
  const { data: pinned } = useQuery(
    convexQuery(api.chats.listPinnedChatsForUser, profileId ? { profileId } : "skip"),
  );
  const { data: matches } = useQuery({
    ...convexQuery(api.chats.searchChats, profileId && term ? { query: term, profileId } : "skip"),
    // Keep the last results on screen while the next keystroke's search loads, unless they are
    // another profile's (the profile just switched)
    placeholderData: (previous) =>
      previous?.every((chat) => chat.profileId === profileId) ? previous : undefined,
  });

  const { pinnedChats, otherChats } = useMemo(() => {
    if (term) {
      const found = matches ?? [];
      return {
        pinnedChats: found.filter((chat) => chat.isPinned),
        otherChats: found.filter((chat) => !chat.isPinned),
      };
    }
    // Drop the chats the pinned list shows; until it loads, drop every pinned chat so none
    // flashes in the other list
    const pinnedIds = pinned && new Set(pinned.map((chat) => chat._id));
    return {
      pinnedChats: pinned ?? [],
      otherChats: results.filter((chat) => (pinnedIds ? !pinnedIds.has(chat._id) : !chat.isPinned)),
    };
  }, [term, matches, pinned, results]);

  const loadNextPage = useCallback(() => loadMore(CHAT_LIST_PAGE_SIZE), [loadMore]);

  return {
    pinnedChats,
    otherChats,
    isLoading: profileId !== null && (term ? matches === undefined : status === "LoadingFirstPage"),
    // More pages exist (one may be loading right now)
    hasMore: !term && (status === "CanLoadMore" || status === "LoadingMore"),
    canLoadMore: !term && status === "CanLoadMore",
    loadMore: loadNextPage,
  };
}

/**
 * Callback ref for a sentinel element at the end of a scrolling list. Whenever another page can
 * load and the sentinel is visible, it calls `loadMore`; the ref re-attaches when `canLoadMore`
 * turns true again, so short pages (e.g. of chats the pinned list already shows) keep loading
 * until the view fills.
 */
export function useLoadMoreRef(canLoadMore: boolean, loadMore: () => void) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!(node && canLoadMore)) {
        return;
      }
      const observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) {
          loadMore();
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [canLoadMore, loadMore],
  );
}
