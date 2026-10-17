import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { usePaginatedQuery } from "convex/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Doc, Id, TableNames } from "../../../convex/_generated/dataModel";
import {
  CHAT_LIST_PAGE_SIZE,
  useChatList,
  useLoadMoreRef,
} from "../use-chat-list";

type Chat = Pick<Doc<"chats">, "_id" | "title" | "isPinned" | "profileId">;

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn<typeof usePaginatedQuery>(),
}));

vi.mock(import("convex/react"), () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
}));

// A real query cache. Nothing fetches: tests seed each query's answer with `answer`, and a query
// without one stays loading
let queryClient = new QueryClient();

/** Caches `chats` as the answer to the Convex query `name` called with `args`. */
const answer = (name: string, args: object, chats: Chat[]) => {
  queryClient.setQueryData(["convexQuery", name, args], chats);
};

const Wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** Renders useChatList; rerender with new `{ term, profileId }` props. */
const renderChatList = (
  term: string,
  profileId: Id<"profiles"> | null | undefined
) =>
  renderHook(
    (props: { term: string; profileId: Id<"profiles"> | null | undefined }) =>
      useChatList(props.term, props.profileId),
    { initialProps: { term, profileId }, wrapper: Wrapper }
  );

/** A fake document id: Convex ids are branded strings, so any string can stand in for one. */
const testId = <Table extends TableNames>(id: string): Id<Table> =>
  z.custom<Id<Table>>((value) => typeof value === "string").parse(id);

const WORK = testId<"profiles">("profiles:work");
const HOME = testId<"profiles">("profiles:home");
// useChatList's profileId while the active profile is still loading
const PROFILE_LOADING = undefined;

const chat = (id: string, isPinned = false, profileId = WORK): Chat => ({
  _id: testId<"chats">(id),
  title: id,
  isPinned,
  profileId,
});

/** Answers the paged query with `results`; with `firstPageLoading`, it is still loading instead. */
const mockPage = (results: Chat[], firstPageLoading = false) => {
  const loadMore = vi.fn<(n: number) => void>();
  mocks.usePaginatedQuery.mockReturnValue(
    firstPageLoading
      ? { results, loadMore, status: "LoadingFirstPage", isLoading: true }
      : { results, loadMore, status: "CanLoadMore", isLoading: false }
  );
  return loadMore;
};

/** The args of every cached query, in the order the hook first asked for them. */
const queriedArgs = () =>
  queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey[2]);

describe(useChatList, () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      // A query nobody answered stays loading
      defaultOptions: {
        queries: { queryFn: async () => await Promise.withResolvers().promise },
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    queryClient.clear();
  });

  it("lists the profile's pinned chats from their own query and pages the rest by activity", () => {
    const loadMore = mockPage([
      chat("recent"),
      chat("pinned-loaded", true),
      chat("older"),
    ]);
    answer("chats:listPinnedChatsForUser", { profileId: WORK }, [
      chat("pinned-loaded", true),
      chat("pinned-unloaded", true),
    ]);

    const { result } = renderChatList("", WORK);

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      { profileId: WORK },
      { initialNumItems: CHAT_LIST_PAGE_SIZE }
    );
    expect({
      pinned: result.current.pinnedChats.map((c) => c._id),
      other: result.current.otherChats.map((c) => c._id),
    }).toStrictEqual({
      pinned: ["pinned-loaded", "pinned-unloaded"],
      other: ["recent", "older"],
    });
    expect(result.current).toMatchObject({
      isLoading: false,
      hasMore: true,
      canLoadMore: true,
    });
    result.current.loadMore();
    expect(loadMore).toHaveBeenCalledWith(CHAT_LIST_PAGE_SIZE);
  });

  it("keeps pinned chats past the pinned list's cap in the paged list", () => {
    mockPage([chat("listed", true), chat("overflow", true), chat("plain")]);
    answer("chats:listPinnedChatsForUser", { profileId: WORK }, [
      chat("listed", true),
    ]);

    const { result } = renderChatList("", WORK);

    expect(result.current.pinnedChats.map((c) => c._id)).toStrictEqual([
      "listed",
    ]);
    expect(result.current.otherChats.map((c) => c._id)).toStrictEqual([
      "overflow",
      "plain",
    ]);
  });

  it("holds back every pinned chat while the pinned list loads", () => {
    mockPage([chat("pinned", true), chat("plain")]);

    const { result } = renderChatList("", WORK);

    expect(result.current.pinnedChats).toStrictEqual([]);
    expect(result.current.otherChats.map((c) => c._id)).toStrictEqual([
      "plain",
    ]);
  });

  it("shows the profile's server title matches while searching, with no paging", () => {
    mockPage([chat("recent")]);
    answer("chats:searchChats", { query: "paris", profileId: WORK }, [
      chat("paris-pinned", true),
      chat("paris-trip"),
    ]);

    const { result } = renderChatList("  paris ", WORK);

    expect(result.current.pinnedChats.map((c) => c._id)).toStrictEqual([
      "paris-pinned",
    ]);
    expect(result.current.otherChats.map((c) => c._id)).toStrictEqual([
      "paris-trip",
    ]);
    expect(result.current).toMatchObject({
      isLoading: false,
      hasMore: false,
      canLoadMore: false,
    });
  });

  it("keeps the last search results while the next loads, but not another profile's", () => {
    mockPage([]);
    answer("chats:searchChats", { query: "paris", profileId: WORK }, [
      chat("work-trip"),
    ]);
    answer("chats:searchChats", { query: "paris", profileId: HOME }, [
      chat("home-trip", false, HOME),
    ]);

    const work = renderChatList("paris", WORK);
    // The next keystroke's search is still loading
    work.rerender({ term: "pari", profileId: WORK });
    expect(work.result.current.otherChats.map((c) => c._id)).toStrictEqual([
      "work-trip",
    ]);

    const home = renderChatList("paris", HOME);
    // The profile switched while the search was on screen
    home.rerender({ term: "pari", profileId: WORK });
    expect(home.result.current.otherChats).toStrictEqual([]);
    expect(home.result.current.isLoading).toBeTruthy();
  });

  it("is loading until the first page arrives", () => {
    mockPage([], true);

    const { result } = renderChatList("", WORK);

    expect(result.current.isLoading).toBeTruthy();
    expect(result.current.pinnedChats).toStrictEqual([]);
  });

  it("loads nothing until the profile is known", () => {
    mockPage([], true);

    const { result } = renderChatList("paris", PROFILE_LOADING);

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      "skip",
      {
        initialNumItems: CHAT_LIST_PAGE_SIZE,
      }
    );
    expect(queriedArgs()).toStrictEqual(["skip", "skip"]);
    expect(result.current.isLoading).toBeTruthy();
  });

  it("is empty, not loading, when the user has no profile yet", () => {
    mockPage([], true);

    const { result } = renderChatList("", null);

    expect(queriedArgs()).toStrictEqual(["skip", "skip"]);
    expect(result.current).toMatchObject({
      pinnedChats: [],
      otherChats: [],
      isLoading: false,
      hasMore: false,
    });
  });
});

describe(useLoadMoreRef, () => {
  type ObserverNotify = (entries: { isIntersecting: boolean }[]) => void;

  const stubIntersectionObserver = () => {
    const observers: {
      notify: ObserverNotify;
      disconnect: () => void;
    }[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        disconnect = vi.fn<() => void>();
        // Tests trigger intersections through the stored notify function
        observe = vi.fn<() => void>();
        constructor(notify: ObserverNotify) {
          observers.push({ notify, disconnect: this.disconnect });
        }
      }
    );
    return observers;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads more when the sentinel becomes visible", () => {
    const observers = stubIntersectionObserver();
    const loadMore = vi.fn<() => void>();
    const { result } = renderHook(() => useLoadMoreRef(true, loadMore));

    const cleanup = result.current(document.createElement("div"));
    observers[0].notify([{ isIntersecting: false }]);
    expect(loadMore).not.toHaveBeenCalled();
    observers[0].notify([{ isIntersecting: true }]);
    expect(loadMore).toHaveBeenCalledOnce();

    cleanup?.();
    expect(observers[0].disconnect).toHaveBeenCalledWith();
  });

  it("does not observe while nothing more can load", () => {
    const observers = stubIntersectionObserver();
    const { result } = renderHook(() =>
      useLoadMoreRef(false, vi.fn<() => void>())
    );

    expect(result.current(document.createElement("div"))).toBeUndefined();
    expect(observers).toHaveLength(0);
  });
});
