import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  CHAT_LIST_PAGE_SIZE,
  isChatInProfile,
  useChatList,
  useLoadMoreRef,
} from "../use-chat-list";

type Chat = Pick<Doc<"chats">, "_id" | "title" | "isPinned">;
interface PaginatedResult {
  results: Chat[];
  status: string;
  loadMore: (n: number) => void;
}

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn<() => PaginatedResult>(),
  // Answers useQuery by query name: [functionName, args]
  queryData: vi.fn<(name: string, args: unknown) => Chat[] | undefined>(),
}));

vi.mock("convex/react", () => ({ usePaginatedQuery: mocks.usePaginatedQuery }));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => ({
    queryKey: [getFunctionName(query), args],
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: undefined,
  useQuery: (options: { queryKey: [string, unknown] }) => ({
    data: mocks.queryData(...options.queryKey),
  }),
}));

const chat = (id: string, isPinned = false): Chat => ({
  _id: id as Id<"chats">,
  title: id,
  isPinned,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useChatList", () => {
  it("lists pinned chats from their own query and pages the rest by activity", () => {
    const loadMore = vi.fn<(n: number) => void>();
    mocks.usePaginatedQuery.mockReturnValue({
      results: [chat("recent"), chat("pinned-loaded", true), chat("older")],
      status: "CanLoadMore",
      loadMore,
    });
    mocks.queryData.mockImplementation((name) =>
      name === "chats:listPinnedChatsForUser"
        ? [chat("pinned-loaded", true), chat("pinned-unloaded", true)]
        : undefined,
    );

    const { result } = renderHook(() => useChatList(""));

    expect(result.current.pinnedChats.map((c) => c._id)).toEqual([
      "pinned-loaded",
      "pinned-unloaded",
    ]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["recent", "older"]);
    expect(result.current).toMatchObject({ isLoading: false, hasMore: true, canLoadMore: true });
    result.current.loadMore();
    expect(loadMore).toHaveBeenCalledWith(CHAT_LIST_PAGE_SIZE);
  });

  it("shows server title matches while searching, with no paging", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [chat("recent")],
      status: "CanLoadMore",
      loadMore: vi.fn<(n: number) => void>(),
    });
    mocks.queryData.mockImplementation((name, args) =>
      name === "chats:searchChats" && (args as { query: string }).query === "paris"
        ? [chat("paris-pinned", true), chat("paris-trip")]
        : [],
    );

    const { result } = renderHook(() => useChatList("  paris "));

    expect(result.current.pinnedChats.map((c) => c._id)).toEqual(["paris-pinned"]);
    expect(result.current.otherChats.map((c) => c._id)).toEqual(["paris-trip"]);
    expect(result.current).toMatchObject({ isLoading: false, hasMore: false, canLoadMore: false });
  });

  it("is loading until the first page arrives", () => {
    mocks.usePaginatedQuery.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn<(n: number) => void>(),
    });
    mocks.queryData.mockReturnValue(undefined);

    const { result } = renderHook(() => useChatList(""));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.pinnedChats).toEqual([]);
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

describe("isChatInProfile", () => {
  const defaultProfile = { _id: "profiles:default" as Id<"profiles">, isDefault: true };
  const workProfile = { _id: "profiles:work" as Id<"profiles">, isDefault: false };

  it("gives the default profile its own chats and chats without a profile", () => {
    expect(isChatInProfile({ profileId: undefined }, defaultProfile)).toBe(true);
    expect(isChatInProfile({ profileId: defaultProfile._id }, defaultProfile)).toBe(true);
    expect(isChatInProfile({ profileId: workProfile._id }, defaultProfile)).toBe(false);
  });

  it("gives other profiles only their own chats", () => {
    expect(isChatInProfile({ profileId: workProfile._id }, workProfile)).toBe(true);
    expect(isChatInProfile({ profileId: undefined }, workProfile)).toBe(false);
  });
});
