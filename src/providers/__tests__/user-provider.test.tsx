import type { useAuthActions } from "@convex-dev/auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { useMutation } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitState } from "@/lib/rate-limit-status";

import { UserProvider, useUser } from "../user-provider";

interface MockUser {
  _id: string;
  isAnonymous: boolean;
}
type CachedAnswer =
  | MockUser
  | null
  | RateLimitState
  | boolean
  | { _id: string; provider: string }[];

const mocks = vi.hoisted(() => ({
  auth: { current: { isLoading: false, isAuthenticated: false } },
  // The account the session's Convex Auth token was issued to
  tokenUserId: { current: null as string | null },
  signOut: vi.fn<() => Promise<void>>().mockResolvedValue(),
  ensureSession: vi.fn<() => Promise<void>>().mockResolvedValue(),
}));

vi.mock(import("convex/react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useConvexAuth: () => ({ ...mocks.auth.current, isRefreshing: false }),
  // Mutations are never called in these tests
  useMutation: vi.fn<typeof useMutation>(),
}));
vi.mock(import("@convex-dev/auth/react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthActions: () => ({
    signIn: vi.fn<ReturnType<typeof useAuthActions>["signIn"]>(),
    signOut: mocks.signOut,
  }),
  useAuthToken: () =>
    mocks.tokenUserId.current === null
      ? null
      : `header.${btoa(JSON.stringify({ sub: `${mocks.tokenUserId.current}|sessions:1` }))}.signature`,
}));
vi.mock(import("@/hooks/use-ensure-session"), () => ({
  useEnsureSession: () => mocks.ensureSession,
}));

// A real query cache. Nothing fetches: tests seed each query's answer with `answer`, and like
// TanStack, a disabled query still returns what its key has cached ("skip" args are a key of
// their own, with nothing cached)
let queryClient = new QueryClient();

/** Caches `data` as the answer to the Convex query `name` called with `{}`. */
const answer = (name: string, data: CachedAnswer) => {
  queryClient.setQueryData(["convexQuery", name, {}], data);
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>{children}</UserProvider>
  </QueryClientProvider>
);

const renderUser = () => renderHook(() => useUser(), { wrapper: Wrapper });

describe("UserProvider loading", () => {
  beforeEach(() => {
    mocks.auth.current = { isLoading: false, isAuthenticated: false };
    mocks.tokenUserId.current = null;
    mocks.signOut.mockClear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // getCurrentUser has answered: no user
    answer("users:getCurrentUser", null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const guest = { _id: "users:1", isAnonymous: true };

  it.each([
    {
      state: "a signed-out visitor",
      isAuthenticated: false,
      token: null,
      cached: null,
      user: null,
      isLoading: false,
    },
    {
      state: "a guest's session",
      isAuthenticated: true,
      token: "users:1",
      cached: guest,
      user: guest,
      isLoading: false,
    },
    {
      // getCurrentUser still holds the null it answered before the stored session was confirmed;
      // /settings and /tasks would otherwise send a returning user to /auth
      state: "a confirmed session whose user hasn't arrived",
      isAuthenticated: true,
      token: "users:1",
      cached: null,
      user: null,
      isLoading: true,
    },
    {
      // Signed out here or in another tab; a stalled connection can keep the old answer cached
      state: "a session that ended while its user is still cached",
      isAuthenticated: false,
      token: null,
      cached: guest,
      user: null,
      isLoading: false,
    },
    {
      // e.g. a guest's session confirmed on a reconnect, before the cache catches up
      state: "a new session while the previous account's user is still cached",
      isAuthenticated: true,
      token: "users:2",
      cached: guest,
      user: null,
      isLoading: true,
    },
  ])(
    "reports $state",
    ({ isAuthenticated, token, cached, user, isLoading }) => {
      mocks.auth.current = { isLoading: false, isAuthenticated };
      mocks.tokenUserId.current = token;
      answer("users:getCurrentUser", cached);

      const { result } = renderUser();

      expect(result.current.user).toStrictEqual(user);
      expect(result.current.isLoading).toBe(isLoading);
    }
  );

  it("waits on a confirmed session's user however long it takes, and never signs it out", () => {
    vi.useFakeTimers();
    // e.g. a reconnect confirmed the session and the connection dropped before the user's answer
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    const { result } = renderUser();

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    // Signing out a guest would lose the account
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBeTruthy();

    act(() => {
      answer("users:getCurrentUser", { _id: "users:1", isAnonymous: true });
      // TanStack notifies observers on a timer
      vi.advanceTimersByTime(0);
    });

    expect(result.current.isLoading).toBeFalsy();
    expect(result.current.user).toStrictEqual({
      _id: "users:1",
      isAnonymous: true,
    });
  });

  it("drops an account's rate limit, plan and keys the moment its session ends", () => {
    const day = 24 * 60 * 60 * 1000;
    const exhausted: RateLimitState = {
      isPremium: false,
      daily: { value: 0, ts: Date.now(), rate: 5, capacity: 5, period: day },
      monthly: {
        value: 1400,
        ts: Date.now(),
        rate: 1500,
        capacity: 1500,
        period: 30 * day,
      },
      premium: null,
    };
    answer("users:getRateLimitStatus", exhausted);
    answer("users:userHasPremium", true);
    answer("api_keys:getApiKeys", [
      { _id: "user_api_keys:1", provider: "openai" },
    ]);
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    answer("users:getCurrentUser", { _id: "users:1", isAnonymous: false });
    const { result, rerender } = renderUser();
    /** The account data the session ending must drop. */
    const accountData = () => ({
      remaining: result.current.rateLimitStatus?.effectiveRemaining,
      hasPremium: result.current.hasPremium,
      hasOpenAI: result.current.hasOpenAI,
    });
    expect(accountData()).toStrictEqual({
      remaining: 0,
      hasPremium: true,
      hasOpenAI: true,
    });

    // Still cached, but not the signed-out visitor's: the exhausted limit would send them to
    // sign-in instead of starting a guest
    mocks.auth.current = { isLoading: false, isAuthenticated: false };
    mocks.tokenUserId.current = null;
    rerender();

    expect(result.current.rateLimitStatus).toBeUndefined();
    expect(accountData()).toStrictEqual({
      remaining: undefined,
      hasPremium: false,
      hasOpenAI: false,
    });
  });

  it("refills exhausted credits once the window resets, even when the timer wakes early", () => {
    vi.useFakeTimers();
    const day = 24 * 60 * 60 * 1000;
    // Half a millisecond ahead: the first timer's delay (999.5 ms) is truncated and wakes early
    queryClient.setQueryData(["serverClockOffset"], 0.5);
    answer("users:getRateLimitStatus", {
      isPremium: false,
      daily: {
        value: 0,
        ts: Date.now() + 1000 - day,
        rate: 5,
        capacity: 5,
        period: day,
      },
      monthly: {
        value: 1400,
        ts: Date.now(),
        rate: 1500,
        capacity: 1500,
        period: 30 * day,
      },
      premium: null,
    });
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    answer("users:getCurrentUser", guest);
    const { result } = renderUser();
    expect(result.current.rateLimitStatus?.effectiveRemaining).toBe(0);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.rateLimitStatus?.effectiveRemaining).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.rateLimitStatus?.effectiveRemaining).toBe(5);
  });

  it("reloads instead of waiting when another tab's sign-in swaps the token's account", () => {
    const reload = vi.fn<() => void>();
    vi.stubGlobal("location", { reload });
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    const { rerender } = renderUser();

    // A sign-out, then a new guest: Convex Auth reconnects as each, so nothing reloads
    mocks.tokenUserId.current = null;
    rerender();
    mocks.tokenUserId.current = "users:2";
    rerender();
    expect(reload).not.toHaveBeenCalled();

    // Straight to another account: this tab's connection would stay on the previous one
    mocks.tokenUserId.current = "users:3";
    rerender();
    expect(reload).toHaveBeenCalledOnce();
  });
});
