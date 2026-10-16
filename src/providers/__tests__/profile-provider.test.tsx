import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { useEditorStore } from "@/lib/store/editor-store";

import type { Id, TableNames } from "../../../convex/_generated/dataModel";
import { ProfileProvider, useProfile } from "../profile-provider";
import type { useUser } from "../user-provider";

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

interface MockUser {
  _id: string;
  activeProfileId?: string;
  isAnonymous: boolean;
}

type MutationValue = boolean | null | number | string | undefined;
type MutationMock = (args?: Record<string, MutationValue>) => Promise<null>;
type FunctionReference = Parameters<typeof getFunctionName>[0];
type ReactMutation = ReturnType<typeof useMutation>;

const useMutationMock = vi.hoisted(() => vi.fn<typeof useMutation>());
const useUserMock = vi.hoisted(() => vi.fn<typeof useUser>());

vi.mock(import("convex/react"), () => ({
  useMutation: useMutationMock,
}));

vi.mock(import("../user-provider"), () => ({
  useUser: useUserMock,
}));

/** A fake document id: Convex ids are branded strings, so any string can stand in for one. */
const testId = <Table extends TableNames>(id: string): Id<Table> =>
  z.custom<Id<Table>>((value) => typeof value === "string").parse(id);

const signedOutStub = async () => {
  // These tests never call the session actions
};

/** Answers useUser with `user` (null when signed out); the provider reads nothing else. */
const mockUser = (user: MockUser | null, isLoading = false) => {
  useUserMock.mockReturnValue({
    user:
      user === null
        ? null
        : {
            _id: testId<"users">(user._id),
            _creationTime: 1,
            isAnonymous: user.isAnonymous,
            ...(user.activeProfileId === undefined
              ? {}
              : { activeProfileId: testId<"profiles">(user.activeProfileId) }),
          },
    isLoading,
    ensureSession: signedOutStub,
    signInGoogle: signedOutStub,
    signOut: signedOutStub,
    updateUser: signedOutStub,
    hasPremium: false,
    rateLimitStatus: undefined,
    apiKeys: [],
    hasApiKey: new Map(),
    hasOpenAI: false,
    hasAnthropic: false,
    hasGemini: false,
    isApiKeysLoading: false,
    connectors: [],
    isConnectorsLoading: false,
  });
};

/** The mutation useMutation hands out for `fn`; it never applies optimistic updates. */
const reactMutation = (fn: MutationMock): ReactMutation => {
  const mutation: ReactMutation = Object.assign(fn, {
    withOptimisticUpdate: () => mutation,
  });
  return mutation;
};

// A real query cache. Nothing fetches: tests answer the profile list with `mockProfiles`, and
// without an answer it stays loading
let queryClient = new QueryClient();

const resetQueryClient = () => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: async () => await Promise.withResolvers().promise },
    },
  });
};

/** Answers the signed-in user's profile list, or leaves it loading. */
const mockProfiles = ({ data, isLoading }: MockQueryResult) => {
  if (!isLoading) {
    queryClient.setQueryData(
      ["convexQuery", "profiles:listProfiles", {}],
      data
    );
  }
};

const flushMicrotasks = async () => {
  const { promise, resolve } = Promise.withResolvers<null>();
  queueMicrotask(() => {
    resolve(null);
  });
  await promise;
};

const TestHarness = () => {
  const { activeProfile, profiles, setActiveProfile } = useProfile();

  const profileP2 = profiles.find((profile) => profile.name === "P2");
  const profileP3 = profiles.find((profile) => profile.name === "P3");

  if (!profileP2 || !profileP3) {
    throw new Error("missing test profiles");
  }

  return (
    <div>
      <div data-testid="active-profile-id">{activeProfile?._id ?? "none"}</div>
      <button
        data-testid="switch-p2"
        onClick={() => {
          setActiveProfile(profileP2._id);
        }}
        type="button"
      >
        switch p2
      </button>
      <button
        data-testid="switch-p3"
        onClick={() => {
          setActiveProfile(profileP3._id);
        }}
        type="button"
      >
        switch p3
      </button>
    </div>
  );
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ProfileProvider>{children}</ProfileProvider>
  </QueryClientProvider>
);

const renderWithProvider = (children: ReactNode) =>
  render(children, { wrapper: Wrapper });

const ChatListProfileHarness = () => {
  const { chatListProfileId } = useProfile();
  return (
    <div data-testid="chat-list-profile-id">{String(chatListProfileId)}</div>
  );
};

const renderChatListProfileId = (
  user: MockUser | null,
  query: MockQueryResult,
  isUserLoading = false
) => {
  resetQueryClient();
  mockUser(user, isUserLoading);
  mockProfiles(query);
  const { getByTestId, unmount } = renderWithProvider(
    <ChatListProfileHarness />
  );
  const value = getByTestId("chat-list-profile-id").textContent;
  unmount();
  return value;
};

const profile = (id: string, userId: string): MockProfile => ({
  _id: id,
  _creationTime: 1,
  userId,
  name: "Default",
  icon: "ChatCircle",
  isDefault: true,
  order: 0,
});

const signOut = () => {
  mockUser(null);
};

describe("ProfileProvider profile switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryClient();

    mockUser({
      _id: "users:u1",
      activeProfileId: "profiles:p1",
      isAnonymous: false,
    });

    mockProfiles({
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
    const firstSwitchDeferred = Promise.withResolvers<null>();
    const secondSwitchDeferred = Promise.withResolvers<null>();

    const ensureDefaultMutation = vi.fn<MutationMock>().mockResolvedValue(null);
    const setActiveMutation = vi
      .fn<MutationMock>()
      .mockReturnValueOnce(firstSwitchDeferred.promise)
      .mockReturnValueOnce(secondSwitchDeferred.promise);
    const updateProfileMutation = vi.fn<MutationMock>().mockResolvedValue(null);

    useMutationMock.mockImplementation(
      (mutationRef: Parameters<typeof getFunctionName>[0]) => {
        const functionName = getFunctionName(mutationRef);
        if (functionName === "profiles:ensureDefaultProfile") {
          return reactMutation(ensureDefaultMutation);
        }
        if (functionName === "profiles:setActiveProfile") {
          return reactMutation(setActiveMutation);
        }
        if (functionName === "profiles:updateProfile") {
          return reactMutation(updateProfileMutation);
        }
        throw new Error(`unexpected mutation: ${functionName}`);
      }
    );

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

  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(
      reactMutation(vi.fn<MutationMock>().mockResolvedValue(null))
    );
  });

  it("uses the stored active profile until profiles load, then the resolved one", () => {
    const user = {
      _id: "users:u1",
      activeProfileId: "profiles:deleted",
      isAnonymous: false,
    };

    expect(renderChatListProfileId(user, { data: [], isLoading: true })).toBe(
      "profiles:deleted"
    );
    // The stored profile no longer exists, so the active profile falls back to the default
    expect(
      renderChatListProfileId(user, { data: profiles, isLoading: false })
    ).toBe("profiles:default");
  });

  it("is unknown until a signed-in user's profile is known", () => {
    expect(
      renderChatListProfileId(null, { data: [], isLoading: false }, true)
    ).toBe("undefined");
    expect(
      renderChatListProfileId(
        { _id: "users:u1", isAnonymous: false },
        { data: [], isLoading: true }
      )
    ).toBe("undefined");
  });

  it("is null for a signed-out visitor, who has no chats until their first message", () => {
    expect(renderChatListProfileId(null, { data: [], isLoading: false })).toBe(
      "null"
    );
  });

  it("uses an anonymous user's active profile, or null before their first chat", () => {
    const anonymous = { _id: "users:anon", isAnonymous: true };

    expect(
      renderChatListProfileId(
        { ...anonymous, activeProfileId: "profiles:anon" },
        { data: [], isLoading: false }
      )
    ).toBe("profiles:anon");
    expect(
      renderChatListProfileId(anonymous, { data: [], isLoading: false })
    ).toBe("null");
  });
});

describe("ProfileProvider theme saves", () => {
  const initialThemeState = useEditorStore.getState().themeState;

  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useEditorStore.setState({ themeState: initialThemeState });
  });

  const edited = { ...initialThemeState, preset: "edited-before-sign-out" };

  /** Renders u1's profile p1 with a theme edit still inside its save's debounce. */
  const renderWithPendingEdit = (updateProfile: MutationMock) => {
    useMutationMock.mockImplementation((mutationRef: FunctionReference) =>
      reactMutation(
        getFunctionName(mutationRef) === "profiles:updateProfile"
          ? updateProfile
          : vi.fn<MutationMock>().mockResolvedValue(null)
      )
    );
    mockUser({
      _id: "users:u1",
      activeProfileId: "profiles:p1",
      isAnonymous: false,
    });
    mockProfiles({
      data: [profile("profiles:p1", "users:u1")],
      isLoading: false,
    });
    const { rerender } = renderWithProvider(null);
    act(() => {
      useEditorStore.getState().setThemeState(edited);
    });
    return () => {
      rerender(null);
    };
  };

  it("saves a theme edit still pending as its account signs out, and only to that account", () => {
    const updateProfile = vi.fn<MutationMock>().mockResolvedValue(null);
    const rerender = renderWithPendingEdit(updateProfile);

    // Signed out within the save's debounce
    signOut();
    rerender();

    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      profileId: "profiles:p1",
      updates: { themeConfig: JSON.stringify(edited) },
    });

    // The next account's profile loads with nothing left to save to the previous one
    mockUser({
      _id: "users:u2",
      activeProfileId: "profiles:p2",
      isAnonymous: false,
    });
    mockProfiles({
      data: [profile("profiles:p2", "users:u2")],
      isLoading: false,
    });
    rerender();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(updateProfile).toHaveBeenCalledOnce();
  });

  it("saves it once when the account changes while the same profile is still shown", () => {
    const updateProfile = vi.fn<MutationMock>().mockResolvedValue(null);
    const rerender = renderWithPendingEdit(updateProfile);

    // The next account's user arrives before its own profiles replace the previous ones
    mockUser({ _id: "users:u2", isAnonymous: false });
    rerender();
    // The save's debounce would have fired by now
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({
      profileId: "profiles:p1",
      updates: { themeConfig: JSON.stringify(edited) },
    });
  });

  it("keeps the save best-effort when the ended session can't make it", async () => {
    // Not a vi.fn, which handles the promises it returns: a rejection left unhandled fails the run
    let saves = 0;
    const rerender = renderWithPendingEdit(async () => {
      saves += 1;
      return await Promise.reject(new Error("NOT_AUTHENTICATED"));
    });

    signOut();
    rerender();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(saves).toBe(1);
  });
});
