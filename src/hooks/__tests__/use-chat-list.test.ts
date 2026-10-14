import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CHAT_LIST_PAGE_SIZE, useChatList, useLoadMoreRef } from "../use-chat-list";

type Chat = Pick<Doc<"chats">, "_id" | "title" | "isPinned" | "profileId">;
interface PaginatedResult {
  results: Chat[];
  status: string;
  loadMore: (n: number) => void;
}
interface QueryOptions {
  queryKey: [string, unknown];
  placeholderData?: (previous: Chat[] | undefined) => Chat[] | undefined;
}

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn<(query: unknown, args: unknown) => PaginatedResult>(),
  // Answers useQuery by query name: [functionName, args]
  queryData: vi.fn<(name: string, args: unknown) => Chat[] | undefined>(),
  // Every useQuery call's options, latest last
  queryOptions: [] as QueryOptions[],
}));

vi.mock("convex/react", () => ({ usePaginatedQuery: mocks.usePaginatedQuery }));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => ({
    queryKey: [getFunctionName(query), args],
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options);
    return { data: mocks.queryData(...options.queryKey) };
  },
}));

const WORK = "profiles:work" as Id<"profiles">;
const HOME = "profiles:home" as Id<"profiles">;

const chat = (id: string, isPinned = false, profileId = WORK): Chat => ({
  _id: id as Id<"chats">,
  title: id,
  isPinned,
  profileId,
});

function mockPage(results: Chat[], status = "CanLoadMore") {
  const loadMore = vi.fn<(n: number) => void>();
  mocks.usePaginatedQuery.mockReturnValue({ results, status, loadMore });
  return loadMore;
}

/** The last useQuery options for a query, by function name. */
const lastOptions = (name: string) =>
  mocks.queryOptions.filter((o) => o.queryKey[0] === name).at(-1);

afterEach(() => {
  vi.clearAllMocks();
  mocks.queryOptions.length = 0;
});

describe("useChatList", () => {
  it("lists the profile's pinned chats from their own query and pages the rest by activity", () => {
    const loadMore = mockPage([chat("recent"), chat("pinned-loaded", true), chat("older")]);
    mocks.queryData.mockImplementation((name) =>
      name === "chats:listPinnedChatsForUser"
        ? [chat("pinned-loaded", true), chat("pinned-unloaded", true)]
        : undefined,
    );

    const { result } = renderHook(() => useChatList("", WORK));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      { profileId: WORK },
      { initialNumItems: CHAT_LIST_PAGE_SIZE },
    );
    expect(lastOptions("chats:listPinnedChatsForUser")?.queryKey[1]).toEqual({ profileId: WORK });
    expect(result.current.pinnedChats.map((c) => c._id)).toEqual([
      "pinned-loaded",
      "pinned-unloaded",
    ]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["recent", "older"]);
    expect(result.current).toMatchObject({ isLoading: false, hasMore: true, canLoadMore: true });
    result.current.loadMore();
    expect(loadMore).toHaveBeenCalledWith(CHAT_LIST_PAGE_SIZE);
  });

  it("keeps pinned chats past the pinned list's cap in the paged list", () => {
    mockPage([chat("listed", true), chat("overflow", true), chat("plain")]);
    mocks.queryData.mockImplementation((name) =>
      name === "chats:listPinnedChatsForUser" ? [chat("listed", true)] : undefined,
    );

    const { result } = renderHook(() => useChatList("", WORK));

    expect(result.current.pinnedChats.map((c) => c._id)).toEqual(["listed"]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["overflow", "plain"]);
  });

  it("holds back every pinned chat while the pinned list loads", () => {
    mockPage([chat("pinned", true), chat("plain")]);
    mocks.queryData.mockReturnValue(undefined);

    const { result } = renderHook(() => useChatList("", WORK));

    expect(result.current.pinnedChats).toEqual([]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["plain"]);
  });

  it("shows the profile's server title matches while searching, with no paging", () => {
    mockPage([chat("recent")]);
    mocks.queryData.mockImplementation((name, args) =>
      name === "chats:searchChats" && (args as { query: string }).query === "paris"
        ? [chat("paris-pinned", true), chat("paris-trip")]
        : [],
    );

    const { result } = renderHook(() => useChatList("  paris ", WORK));

    expect(lastOptions("chats:searchChats")?.queryKey[1]).toEqual({
      query: "paris",
      profileId: WORK,
    });
    expect(result.current.pinnedChats.map((c) => c._id)).toEqual(["paris-pinned"]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["paris-trip"]);
    expect(result.current).toMatchObject({ isLoading: false, hasMore: false, canLoadMore: false });
  });

  it("keeps the last search results while the next loads, but not another profile's", () => {
    mockPage([]);
    mocks.queryData.mockReturnValue(undefined);

    renderHook(() => useChatList("paris", WORK));
    const placeholder = lastOptions("chats:searchChats")?.placeholderData;

    const workMatches = [chat("work-trip")];
    expect(placeholder?.(workMatches)).toBe(workMatches);
    expect(placeholder?.([chat("home-trip", false, HOME)])).toBeUndefined();
  });

  it("is loading until the first page arrives", () => {
    mockPage([], "LoadingFirstPage");
    mocks.queryData.mockReturnValue(undefined);

    const { result } = renderHook(() => useChatList("", WORK));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.pinnedChats).toEqual([]);
  });

  it("loads nothing until the profile is known", () => {
    mockPage([], "LoadingFirstPage");
    mocks.queryData.mockReturnValue(undefined);

    const { result } = renderHook(() => useChatList("paris", undefined));

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(expect.anything(), "skip", {
      initialNumItems: CHAT_LIST_PAGE_SIZE,
    });
    expect(mocks.queryOptions.map((o) => o.queryKey[1])).toEqual(["skip", "skip"]);
    expect(result.current.isLoading).toBe(true);
  });

  it("is empty, not loading, when the user has no profile yet", () => {
    mockPage([], "LoadingFirstPage");
    mocks.queryData.mockReturnValue(undefined);

    const { result } = renderHook(() => useChatList("", null));

    expect(mocks.queryOptions.map((o) => o.queryKey[1])).toEqual(["skip", "skip"]);
    expect(result.current).toMatchObject({
      pinnedChats: [],
      otherChats: [],
      isLoading: false,
      hasMore: false,
    });
  });
});

describe("useLoadMoreRef", () => {
  type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

  function stubIntersectionObserver() {
    const observers: Array<{ callback: ObserverCallback; disconnect: () => void }> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        disconnect = vi.fn<() => void>();
        constructor(callback: ObserverCallback) {
          observers.push({ callback, disconnect: this.disconnect });
        }
        observe() {
          // Observation starts via the stored callback
        }
      },
    );
    return observers;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads more when the sentinel becomes visible", () => {
    const observers = stubIntersectionObserver();
    const loadMore = vi.fn<() => void>();
    const { result } = renderHook(() => useLoadMoreRef(true, loadMore));

    const cleanup = result.current(document.createElement("div"));
    observers[0].callback([{ isIntersecting: false }]);
    expect(loadMore).not.toHaveBeenCalled();
    observers[0].callback([{ isIntersecting: true }]);
    expect(loadMore).toHaveBeenCalledTimes(1);

    cleanup?.();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("does not observe while nothing more can load", () => {
    const observers = stubIntersectionObserver();
    const { result } = renderHook(() => useLoadMoreRef(false, vi.fn<() => void>()));

    expect(result.current(document.createElement("div"))).toBeUndefined();
    expect(observers).toHaveLength(0);
  });
});
