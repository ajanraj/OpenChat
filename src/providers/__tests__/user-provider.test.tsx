import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "../user-provider";

type FunctionReference = Parameters<typeof getFunctionName>[0];
interface MockUser {
  _id: string;
  isAnonymous: boolean;
}

const mocks = vi.hoisted(() => ({
  auth: { current: { isLoading: false, isAuthenticated: false } },
  // getCurrentUser's cached answer; isLoading stays false once it has answered once
  user: { current: null as MockUser | null },
  signOut: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth.current,
  useMutation: () => async () => null,
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => undefined, signOut: mocks.signOut }),
}));
vi.mock("@/hooks/use-ensure-session", () => ({ useEnsureSession: () => async () => undefined }));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (query: FunctionReference) => ({ queryKey: [getFunctionName(query)] }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "users:getCurrentUser"
      ? { data: mocks.user.current, isLoading: false }
      : { data: undefined, isLoading: false },
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
    mocks.signOut.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { state: "a signed-out visitor", isAuthenticated: false, user: null, isLoading: false },
    {
      state: "a guest whose session and user agree",
      isAuthenticated: true,
      user: { _id: "users:1", isAnonymous: true },
      isLoading: false,
    },
    {
      // getCurrentUser still holds the null it answered before the stored session was confirmed;
      // /settings and /tasks would otherwise send a returning user to /auth
      state: "a confirmed session whose user hasn't arrived",
      isAuthenticated: true,
      user: null,
      isLoading: true,
    },
    {
      state: "a signed-out session whose cached user hasn't cleared",
      isAuthenticated: false,
      user: { _id: "users:1", isAnonymous: false },
      isLoading: true,
    },
  ])("is $isLoading for $state", ({ isAuthenticated, user, isLoading }) => {
    mocks.auth.current = { isLoading: false, isAuthenticated };
    mocks.user.current = user;

    expect(renderUser().result.current.isLoading).toBe(isLoading);
  });

  it("waits on a confirmed session's user however long it takes, and never signs it out", () => {
    vi.useFakeTimers();
    // e.g. a reconnect confirmed the session and the connection dropped before the user's answer
    mocks.auth.current = { isLoading: false, isAuthenticated: true };
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
});
