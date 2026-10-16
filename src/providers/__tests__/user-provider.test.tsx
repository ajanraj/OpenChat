import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitState } from "@/lib/rate-limit-status";

import { UserProvider, useUser } from "../user-provider";

type FunctionReference = Parameters<typeof getFunctionName>[0];
interface MockUser {
  _id: string;
  isAnonymous: boolean;
}
type CachedAnswer =
  | RateLimitState
  | boolean
  | { _id: string; provider: string }[];

const mocks = vi.hoisted(() => ({
  auth: { current: { isLoading: false, isAuthenticated: false } },
  // getCurrentUser's cached answer; isLoading stays false once it has answered once
  user: { current: null as MockUser | null },
  // The account the session's Convex Auth token was issued to
  tokenUserId: { current: null as string | null },
  // Other answers cached per query name; "skip" args are a key of their own, with none cached
  cached: { current: new Map<string, CachedAnswer>() },
  signOut: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth.current,
  useMutation: () => async () => null,
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: async () => undefined,
    signOut: mocks.signOut,
  }),
  useAuthToken: () =>
    mocks.tokenUserId.current &&
    `header.${btoa(JSON.stringify({ sub: `${mocks.tokenUserId.current}|sessions:1` }))}.signature`,
}));
vi.mock("@/hooks/use-ensure-session", () => ({
  useEnsureSession: () => async () => undefined,
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (query: FunctionReference, args: object | "skip") => ({
    queryKey: [getFunctionName(query), args],
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  // Like TanStack, a disabled query still returns what its key has cached
  useQuery: ({
    queryKey,
  }: {
    queryKey: [string, object | "skip" | undefined];
  }) =>
    queryKey[0] === "users:getCurrentUser"
      ? { data: mocks.user.current, isLoading: false }
      : {
          data:
            queryKey[1] === "skip"
              ? undefined
              : mocks.cached.current.get(queryKey[0]),
          isLoading: false,
        },
}));

function renderUser() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UserProvider>{children}</UserProvider>
  );
  return renderHook(() => useUser(), { wrapper });
}

describe("UserProvider loading", () => {
  beforeEach(() => {
    mocks.auth.current = { isLoading: false, isAuthenticated: false };
    mocks.user.current = null;
    mocks.tokenUserId.current = null;
    mocks.cached.current = new Map();
    mocks.signOut.mockClear();
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
      mocks.user.current = cached;

      const { result } = renderUser();

      expect(result.current.user).toEqual(user);
      expect(result.current.isLoading).toBe(isLoading);
    }
  );

  it("waits on a confirmed session's user however long it takes, and never signs it out", () => {
    vi.useFakeTimers();
    // e.g. a reconnect confirmed the session and the connection dropped before the user's answer
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    const { result, rerender } = renderUser();

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    // Signing out a guest would lose the account
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    mocks.user.current = { _id: "users:1", isAnonymous: true };
    rerender();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toEqual({ _id: "users:1", isAnonymous: true });
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
    mocks.cached.current = new Map<string, CachedAnswer>([
      ["users:getRateLimitStatus", exhausted],
      ["users:userHasPremium", true],
      ["api_keys:getApiKeys", [{ _id: "user_api_keys:1", provider: "openai" }]],
    ]);
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
    mocks.tokenUserId.current = "users:1";
    mocks.user.current = { _id: "users:1", isAnonymous: false };
    const { result, rerender } = renderUser();
    expect(result.current.rateLimitStatus?.effectiveRemaining).toBe(0);
    expect(result.current.hasPremium).toBe(true);
    expect(result.current.hasOpenAI).toBe(true);

    // Still cached, but not the signed-out visitor's: the exhausted limit would send them to
    // sign-in instead of starting a guest
    mocks.auth.current = { isLoading: false, isAuthenticated: false };
    mocks.tokenUserId.current = null;
    rerender();

    expect(result.current.rateLimitStatus).toBeUndefined();
    expect(result.current.hasPremium).toBe(false);
    expect(result.current.hasOpenAI).toBe(false);
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
