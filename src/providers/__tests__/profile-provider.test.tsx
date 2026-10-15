import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile } from "../profile-provider";

interface MockProfile {
  _creationTime: number;
  _id: string;
  icon: string;
  isDefault: boolean;
  name: string;
  order: number;
  userId: string;
}

interface MockQueryResult {
  data: MockProfile[];
  isLoading: boolean;
}

interface MockUserResult {
  user: {
    _id: string;
    activeProfileId?: string;
    isAnonymous: boolean;
  } | null;
  isLoading?: boolean;
}

type MutationValue = boolean | null | number | string | undefined;
type MutationMock = (args?: Record<string, MutationValue>) => Promise<null>;
type FunctionReference = Parameters<typeof getFunctionName>[0];

const useTanStackQueryMock = vi.hoisted(() => vi.fn<(options: object) => MockQueryResult>());
const useMutationMock = vi.hoisted(() => vi.fn<(mutationRef: FunctionReference) => MutationMock>());
const convexQueryMock = vi.hoisted(() =>
  vi.fn<(functionRef: FunctionReference, args?: object | "skip") => object>(() => ({})),
);
const useUserMock = vi.hoisted(() => vi.fn<() => MockUserResult>());

vi.mock("@tanstack/react-query", () => ({
  useQuery: useTanStackQueryMock,
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: convexQueryMock,
}));

vi.mock("../user-provider", () => ({
  useUser: useUserMock,
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

function TestHarness() {
  const { activeProfile, profiles, setActiveProfile } = useProfile();

  const profileP2 = profiles.find((profile) => profile.name === "P2");
  const profileP3 = profiles.find((profile) => profile.name === "P3");

  if (!profileP2 || !profileP3) {
    throw new Error("missing test profiles");
  }

  return (
    <div>
      <div data-testid="active-profile-id">{activeProfile?._id ?? "none"}</div>
      <button data-testid="switch-p2" onClick={() => setActiveProfile(profileP2._id)} type="button">
        switch p2
      </button>
      <button data-testid="switch-p3" onClick={() => setActiveProfile(profileP3._id)} type="button">
        switch p3
      </button>
    </div>
  );
}

function renderWithProvider(children: ReactNode) {
  return render(<ProfileProvider>{children}</ProfileProvider>);
}

describe("ProfileProvider profile switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useUserMock.mockReturnValue({
      user: {
        _id: "users:u1",
        activeProfileId: "profiles:p1",
        isAnonymous: false,
      },
    });

    useTanStackQueryMock.mockReturnValue({
      data: [
        {
          _id: "profiles:p1",
          _creationTime: 1,
          userId: "users:u1",
          name: "P1",
          icon: "ChatCircle",
          isDefault: true,
          order: 0,
        },
        {
          _id: "profiles:p2",
          _creationTime: 2,
          userId: "users:u1",
          name: "P2",
          icon: "ChatCircle",
          isDefault: false,
          order: 1,
        },
        {
          _id: "profiles:p3",
          _creationTime: 3,
          userId: "users:u1",
          name: "P3",
          icon: "ChatCircle",
          isDefault: false,
          order: 2,
        },
      ],
      isLoading: false,
    });
  });

  it("keeps latest optimistic profile after stale failure and falls back on latest failure", async () => {
    const firstSwitchDeferred = createDeferred<null>();
    const secondSwitchDeferred = createDeferred<null>();

    const ensureDefaultMutation = vi.fn<MutationMock>(async () => null);
    const setActiveMutation = vi
      .fn<MutationMock>()
      .mockReturnValueOnce(firstSwitchDeferred.promise)
      .mockReturnValueOnce(secondSwitchDeferred.promise);
    const updateProfileMutation = vi.fn<MutationMock>(async () => null);

    useMutationMock.mockImplementation((mutationRef: Parameters<typeof getFunctionName>[0]) => {
      const functionName = getFunctionName(mutationRef);
      if (functionName === "profiles:ensureDefaultProfile") {
        return ensureDefaultMutation;
      }
      if (functionName === "profiles:setActiveProfile") {
        return setActiveMutation;
      }
      if (functionName === "profiles:updateProfile") {
        return updateProfileMutation;
      }
      throw new Error(`unexpected mutation: ${functionName}`);
    });

    const { getByTestId } = renderWithProvider(<TestHarness />);

    fireEvent.click(getByTestId("switch-p2"));
    fireEvent.click(getByTestId("switch-p3"));

    expect(getByTestId("active-profile-id").textContent).toBe("profiles:p3");

    await act(async () => {
      firstSwitchDeferred.reject(new Error("first switch failed"));
      await flushMicrotasks();
    });

    expect(getByTestId("active-profile-id").textContent).toBe("profiles:p3");

    await act(async () => {
      secondSwitchDeferred.reject(new Error("second switch failed"));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(getByTestId("active-profile-id").textContent).toBe("profiles:p1");
    });
  });
});

describe("ProfileProvider chatListProfileId", () => {
  const profiles: MockProfile[] = [
    {
      _id: "profiles:default",
      _creationTime: 1,
      userId: "users:u1",
      name: "Default",
      icon: "ChatCircle",
      isDefault: true,
      order: 0,
    },
  ];

  function ChatListProfileHarness() {
    const { chatListProfileId } = useProfile();
    return <div data-testid="chat-list-profile-id">{String(chatListProfileId)}</div>;
  }

  function renderChatListProfileId(
    user: MockUserResult["user"],
    query: MockQueryResult,
    isUserLoading = false,
  ) {
    useUserMock.mockReturnValue({ user, isLoading: isUserLoading });
    useTanStackQueryMock.mockReturnValue(query);
    const { getByTestId, unmount } = renderWithProvider(<ChatListProfileHarness />);
    const value = getByTestId("chat-list-profile-id").textContent;
    unmount();
    return value;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(vi.fn<MutationMock>(async () => null));
  });

  it("uses the stored active profile until profiles load, then the resolved one", () => {
    const user = { _id: "users:u1", activeProfileId: "profiles:deleted", isAnonymous: false };

    expect(renderChatListProfileId(user, { data: [], isLoading: true })).toBe("profiles:deleted");
    // The stored profile no longer exists, so the active profile falls back to the default
    expect(renderChatListProfileId(user, { data: profiles, isLoading: false })).toBe(
      "profiles:default",
    );
  });

  it("is unknown until a signed-in user's profile is known", () => {
    expect(renderChatListProfileId(null, { data: [], isLoading: false }, true)).toBe("undefined");
    expect(
      renderChatListProfileId(
        { _id: "users:u1", isAnonymous: false },
        { data: [], isLoading: true },
      ),
    ).toBe("undefined");
  });

  it("is null for a signed-out visitor, who has no chats until their first message", () => {
    expect(renderChatListProfileId(null, { data: [], isLoading: false })).toBe("null");
  });

  it("uses an anonymous user's active profile, or null before their first chat", () => {
    const anonymous = { _id: "users:anon", isAnonymous: true };

    expect(
      renderChatListProfileId(
        { ...anonymous, activeProfileId: "profiles:anon" },
        { data: [], isLoading: false },
      ),
    ).toBe("profiles:anon");
    expect(renderChatListProfileId(anonymous, { data: [], isLoading: false })).toBe("null");
  });
});
