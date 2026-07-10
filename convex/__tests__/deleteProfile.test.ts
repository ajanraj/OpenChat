import { describe, expect, it, vi } from "vitest";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import { deleteProfile } from "../profiles";

/**
 * Unit test for deleteProfile mutation handler logic.
 * Verifies that orphaned chats AND scheduled tasks are
 * reassigned to the default profile on deletion.
 *
 * Uses mock ctx.db since convex-test is not available.
 */

// Mock getAuthUserId
vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

// Mock convex server — return handler directly via mutation stub
vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
}));

type AnyFn = (...args: unknown[]) => unknown;

const MOCK_USER_ID = "users:user1" as unknown as Id<"users">;
const MOCK_DEFAULT_PROFILE_ID = "profiles:default1" as const;
const MOCK_PROFILE_ID = "profiles:custom1" as const;
const MOCK_CHAT_ID = "chats:chat1" as const;
const MOCK_TASK_ID = "scheduled_tasks:task1" as const;

function createMockCtx({
  profile,
  defaultProfile,
  orphanedChats,
  orphanedTasks,
  user,
}: {
  profile: Record<string, unknown> | null;
  defaultProfile: Record<string, unknown> | null;
  orphanedChats: Array<Record<string, unknown>>;
  orphanedTasks: Array<Record<string, unknown>>;
  user: Record<string, unknown> | null;
}) {
  const patchCalls: Array<[string, Record<string, unknown>]> = [];
  const deleteCalls: string[] = [];

  // Track which table is being queried
  let currentQueryTable = "";

  const queryBuilder = {
    withIndex: (_name: string, _fn: AnyFn) => queryBuilder,
    filter: (_fn: AnyFn) => queryBuilder,
    first: () => {
      if (currentQueryTable === "profiles") return Promise.resolve(defaultProfile);
      return Promise.resolve(null);
    },
    collect: () => {
      if (currentQueryTable === "chats") return Promise.resolve(orphanedChats);
      if (currentQueryTable === "scheduled_tasks") return Promise.resolve(orphanedTasks);
      return Promise.resolve([]);
    },
  };

  const ctx = {
    db: {
      get: (id: string) => {
        if (id === MOCK_PROFILE_ID) return Promise.resolve(profile);
        if (id === MOCK_USER_ID) return Promise.resolve(user);
        return Promise.resolve(null);
      },
      query: (table: string) => {
        currentQueryTable = table;
        return queryBuilder;
      },
      patch: (id: string, data: Record<string, unknown>) => {
        patchCalls.push([id, data]);
        return Promise.resolve();
      },
      delete: (id: string) => {
        deleteCalls.push(id);
        return Promise.resolve();
      },
    },
  };

  return { ctx, patchCalls, deleteCalls };
}

describe("deleteProfile", () => {
  it("reassigns orphaned chats AND scheduled tasks to default profile", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(MOCK_USER_ID);

    const { ctx, patchCalls, deleteCalls } = createMockCtx({
      profile: { _id: MOCK_PROFILE_ID, userId: MOCK_USER_ID, isDefault: false },
      defaultProfile: { _id: MOCK_DEFAULT_PROFILE_ID, userId: MOCK_USER_ID, isDefault: true },
      orphanedChats: [{ _id: MOCK_CHAT_ID, profileId: MOCK_PROFILE_ID }],
      orphanedTasks: [{ _id: MOCK_TASK_ID, profileId: MOCK_PROFILE_ID }],
      user: { _id: MOCK_USER_ID, activeProfileId: "profiles:other" },
    });

    // deleteProfile is the raw handler due to our mutation mock
    await (deleteProfile as unknown as AnyFn)(ctx, { profileId: MOCK_PROFILE_ID });

    // Chat reassigned
    expect(patchCalls).toContainEqual([MOCK_CHAT_ID, { profileId: MOCK_DEFAULT_PROFILE_ID }]);

    // Scheduled task reassigned
    expect(patchCalls).toContainEqual([MOCK_TASK_ID, { profileId: MOCK_DEFAULT_PROFILE_ID }]);

    // Profile deleted
    expect(deleteCalls).toContain(MOCK_PROFILE_ID);
  });

  it("handles no orphaned tasks gracefully", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(MOCK_USER_ID);

    const { ctx, patchCalls, deleteCalls } = createMockCtx({
      profile: { _id: MOCK_PROFILE_ID, userId: MOCK_USER_ID, isDefault: false },
      defaultProfile: { _id: MOCK_DEFAULT_PROFILE_ID, userId: MOCK_USER_ID, isDefault: true },
      orphanedChats: [],
      orphanedTasks: [],
      user: { _id: MOCK_USER_ID, activeProfileId: "profiles:other" },
    });

    await (deleteProfile as unknown as AnyFn)(ctx, { profileId: MOCK_PROFILE_ID });

    // No patches for chats/tasks, only profile deleted
    expect(patchCalls).toHaveLength(0);
    expect(deleteCalls).toContain(MOCK_PROFILE_ID);
  });
});
