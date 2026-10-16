import { getAuthUserId } from "@convex-dev/auth/server";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  backfillChatProfiles,
  branchChat,
  createChat,
  createChatInternal,
  deleteAllChatsForUser,
  deleteBulkChats,
  forkFromShared,
  listChatsForUser,
  listPinnedChatsForUser,
  purgeChats,
  searchChats,
} from "../chats";
import { bulkImportChat } from "../import_export";
import { createFakeCtx, createFakeDb } from './fake_db.testutil';
import type { FakeCtx, FakeDb } from './fake_db.testutil';

// Keep the real authTables, which the schema (and so the fake db) needs
vi.mock(import("@convex-dev/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

// Registered functions become their bare handlers
vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
}));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    deleteObject = vi.fn<() => Promise<void>>(async () => undefined);
  },
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
interface Page {
  page: Array<{ _id: string }>;
  isDone: boolean;
  continueCursor: string;
}
const asHandler = (fn: unknown) => fn as Handler;
const authUser = vi.mocked(getAuthUserId);

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  const db = createFakeDb();
  const userId = db.seed("users", { name: "User" }) as Id<"users">;
  const otherUserId = db.seed("users", { name: "Other" }) as Id<"users">;
  authUser.mockResolvedValue(userId);
  return { db, userId, otherUserId, ctx: createFakeCtx(db) };
}

function seedChat(db: FakeDb, userId: Id<"users">, fields: Record<string, unknown>) {
  return db.seed("chats", { userId, title: "Chat", ...fields });
}

function seedProfile(db: FakeDb, userId: Id<"users">, fields: Record<string, unknown> = {}) {
  return db.seed("profiles", {
    userId,
    name: "Work",
    icon: "Briefcase",
    isDefault: false,
    order: 1,
    ...fields,
  }) as Id<"profiles">;
}

const chatById = (db: FakeDb, chatId: string) => db.all("chats").find((c) => c._id === chatId);
const userById = (db: FakeDb, userId: string) => db.all("users").find((u) => u._id === userId);
const defaultProfiles = (db: FakeDb, userId: string) =>
  db.all("profiles").filter((p) => p.userId === userId && p.isDefault === true);

describe("listChatsForUser", () => {
  it("pages through a profile's chats by recent activity, legacy chats last", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const profileId = seedProfile(db, userId);
    const otherProfileId = seedProfile(db, userId, { name: "Home" });
    const older = seedChat(db, userId, { profileId, updatedAt: 10 });
    const newest = seedChat(db, userId, { profileId, updatedAt: 30, isPinned: true });
    const middle = seedChat(db, userId, { profileId, updatedAt: 20 });
    const legacy = seedChat(db, userId, { profileId });
    seedChat(db, userId, { profileId: otherProfileId, updatedAt: 50 });
    seedChat(db, userId, { updatedAt: 60 });
    // Another user's chat filed under this profile id is never listed
    seedChat(db, otherUserId, { profileId, updatedAt: 40 });

    const first = (await asHandler(listChatsForUser)(ctx, {
      profileId,
      paginationOpts: { numItems: 2, cursor: null },
    })) as Page;
    expect(first.page.map((c) => c._id)).toEqual([newest, middle]);
    expect(first.isDone).toBe(false);

    const second = (await asHandler(listChatsForUser)(ctx, {
      profileId,
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    })) as Page;
    expect(second.page.map((c) => c._id)).toEqual([older, legacy]);
    expect(second.isDone).toBe(true);
  });

  it("lists every profile's chats of the user when profileId is null", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const work = seedChat(db, userId, { profileId: seedProfile(db, userId), updatedAt: 2 });
    const unfiled = seedChat(db, userId, { updatedAt: 1 });
    seedChat(db, otherUserId, { updatedAt: 3 });

    const all = (await asHandler(listChatsForUser)(ctx, {
      profileId: null,
      paginationOpts: { numItems: 10, cursor: null },
    })) as Page;
    expect(all.page.map((c) => c._id)).toEqual([work, unfiled]);
  });

  it("returns nothing for another user's profile", async () => {
    const { db, otherUserId, ctx } = setup();
    const foreignProfile = seedProfile(db, otherUserId);
    seedChat(db, otherUserId, { profileId: foreignProfile, updatedAt: 1 });

    const page = (await asHandler(listChatsForUser)(ctx, {
      profileId: foreignProfile,
      paginationOpts: { numItems: 10, cursor: null },
    })) as Page;
    expect(page.page).toEqual([]);
  });

  it("returns an empty, finished page when signed out", async () => {
    const { ctx } = setup();
    authUser.mockResolvedValue(null);

    await expect(asHandler(listChatsForUser)(ctx, {
        profileId: null,
        paginationOpts: { numItems: 10, cursor: null },
      })).resolves.toEqual({ page: [], isDone: true, continueCursor: "" });
  });
});

describe("listPinnedChatsForUser", () => {
  it("returns only the user's pinned chats in the profile", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const profileId = seedProfile(db, userId);
    const pinned = seedChat(db, userId, { profileId, isPinned: true, updatedAt: 1 });
    seedChat(db, userId, { profileId, isPinned: false, updatedAt: 2 });
    seedChat(db, userId, { profileId, updatedAt: 3 });
    seedChat(db, userId, { profileId: seedProfile(db, userId), isPinned: true, updatedAt: 4 });
    seedChat(db, otherUserId, { profileId, isPinned: true, updatedAt: 5 });

    const chats = (await asHandler(listPinnedChatsForUser)(ctx, { profileId })) as Array<{
      _id: string;
    }>;
    expect(chats.map((c) => c._id)).toEqual([pinned]);
  });
});

describe("searchChats", () => {
  it("matches the titles of the user's chats in the profile", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const profileId = seedProfile(db, userId);
    const trip = seedChat(db, userId, { profileId, title: "Trip to Paris" });
    const budget = seedChat(db, userId, { profileId, title: "Paris budget" });
    seedChat(db, userId, { profileId, title: "Groceries" });
    seedChat(db, userId, { profileId: seedProfile(db, userId), title: "Paris at home" });
    seedChat(db, otherUserId, { profileId, title: "Paris" });

    const found = (await asHandler(searchChats)(ctx, { query: " paris ", profileId })) as Array<{
      _id: string;
    }>;
    // Order is by relevance; convex/tsconfig targets ES2022, so no toSorted here
    expect(found.map((c) => c._id)).toHaveLength(2);
    expect(found.map((c) => c._id)).toEqual(expect.arrayContaining([trip, budget]));
    await expect(asHandler(searchChats)(ctx, { query: "   ", profileId })).resolves.toEqual([]);
  });
});

describe("chat writers", () => {
  it("files a new chat under the requested profile when the user owns it", async () => {
    const { db, userId, ctx } = setup();
    const profileId = seedProfile(db, userId);

    const { chatId } = (await asHandler(createChat)(ctx, { profileId })) as { chatId: string };

    expect(chatById(db, chatId)?.profileId).toBe(profileId);
  });

  it("falls back to the active profile for another user's profile", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const activeProfileId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId });

    const { chatId } = (await asHandler(createChat)(ctx, {
      profileId: seedProfile(db, otherUserId),
    })) as { chatId: string };

    expect(chatById(db, chatId)?.profileId).toBe(activeProfileId);
  });

  it("creates and activates the default profile when the user has none", async () => {
    const { db, userId, ctx } = setup();
    await db.patch("users", userId, { preferredModel: "model-a", favoriteModels: ["model-a"] });

    const { chatId } = (await asHandler(createChat)(ctx, {})) as { chatId: string };
    const { chatId: secondChatId } = (await asHandler(createChat)(createFakeCtx(db), {})) as {
      chatId: string;
    };

    const [created] = defaultProfiles(db, userId);
    expect(defaultProfiles(db, userId)).toHaveLength(1);
    expect(created).toMatchObject({
      name: "Default",
      preferredModel: "model-a",
      favoriteModels: ["model-a"],
    });
    expect(chatById(db, chatId)?.profileId).toBe(created._id);
    expect(chatById(db, secondChatId)?.profileId).toBe(created._id);
    expect(userById(db, userId)?.activeProfileId).toBe(created._id);
  });

  it("uses the existing default profile when the active profile was deleted", async () => {
    const { db, userId, ctx } = setup();
    const defaultId = seedProfile(db, userId, { isDefault: true, order: 0 });
    await db.patch("users", userId, { activeProfileId: "profiles:deleted" });

    const { chatId } = (await asHandler(createChat)(ctx, {})) as { chatId: string };

    expect(chatById(db, chatId)?.profileId).toBe(defaultId);
    expect(defaultProfiles(db, userId)).toHaveLength(1);
  });

  it("files a fork of a shared chat under the forking user's active profile", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const activeProfileId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId });
    const sourceChatId = seedChat(db, otherUserId, {
      profileId: seedProfile(db, otherUserId),
      public: true,
    });
    db.seed("messages", {
      chatId: sourceChatId,
      userId: otherUserId,
      role: "user",
      content: "hi",
      parts: [{ type: "text", text: "hi" }],
      createdAt: 1,
    });

    const { chatId } = (await asHandler(forkFromShared)(ctx, { sourceChatId })) as {
      chatId: string;
    };

    expect(chatById(db, chatId)).toMatchObject({ userId, profileId: activeProfileId });
  });

  it("files an imported chat under the active profile", async () => {
    const { db, userId, ctx } = setup();
    const activeProfileId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId });

    const { chatId } = (await asHandler(bulkImportChat)(ctx, {
      chat: { title: "Imported" },
      messages: [{ role: "user", content: "hi" }],
    })) as { chatId: string };

    expect(chatById(db, chatId)?.profileId).toBe(activeProfileId);
  });

  it("files a scheduled run's chat under the task's profile, if the user owns it", async () => {
    const { db, userId, otherUserId } = setup();
    const taskProfileId = seedProfile(db, userId);

    const { chatId } = (await asHandler(createChatInternal)(createFakeCtx(db), {
      userId,
      profileId: taskProfileId,
    })) as { chatId: string };
    const { chatId: foreignChatId } = (await asHandler(createChatInternal)(createFakeCtx(db), {
      userId,
      profileId: seedProfile(db, otherUserId),
    })) as { chatId: string };

    expect(chatById(db, chatId)?.profileId).toBe(taskProfileId);
    const [created] = defaultProfiles(db, userId);
    expect(chatById(db, foreignChatId)?.profileId).toBe(created._id);
  });
});

describe("backfillChatProfiles", () => {
  interface BackfillResult {
    scanned: number;
    updated: number;
    skipped: number;
    isDone: boolean;
  }
  const runBackfill = async (ctx: FakeCtx, cursor?: string) =>
    (await asHandler(backfillChatProfiles)(ctx, cursor ? { cursor } : {})) as BackfillResult;

  it("moves chats without a valid profile to the owner's default profile", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const defaultId = seedProfile(db, userId, { isDefault: true, order: 0 });
    const workId = seedProfile(db, userId);
    const missing = seedChat(db, userId, {});
    const deleted = seedChat(db, userId, { profileId: "profiles:deleted" });
    const foreign = seedChat(db, userId, { profileId: seedProfile(db, otherUserId) });
    const filed = seedChat(db, userId, { profileId: workId, updatedAt: 5 });
    const orphan = seedChat(db, "users:gone" as Id<"users">, {});

    const result = await runBackfill(ctx);

    expect(result).toEqual({ scanned: 5, updated: 3, skipped: 1, isDone: true });
    for (const chatId of [missing, deleted, foreign]) {
      expect(chatById(db, chatId)?.profileId).toBe(defaultId);
    }
    expect(chatById(db, filed)).toMatchObject({ profileId: workId, updatedAt: 5 });
    expect(chatById(db, orphan)?.profileId).toBeUndefined();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("creates the default profile for owners without one, once", async () => {
    const { db, userId, ctx } = setup();
    const first = seedChat(db, userId, {});
    const second = seedChat(db, userId, {});

    await runBackfill(ctx);

    const [created] = defaultProfiles(db, userId);
    expect(defaultProfiles(db, userId)).toHaveLength(1);
    expect(chatById(db, first)?.profileId).toBe(created._id);
    expect(chatById(db, second)?.profileId).toBe(created._id);
    expect(userById(db, userId)?.activeProfileId).toBe(created._id);
  });

  it("resumes across batches until the table is exhausted", async () => {
    const { db, userId, ctx } = setup();
    for (let i = 0; i < 101; i += 1) {
      seedChat(db, userId, {});
    }

    const first = await runBackfill(ctx);
    expect(first).toMatchObject({ scanned: 100, updated: 100, isDone: false });
    const [[, fn, args]] = ctx.scheduler.runAfter.mock.calls;
    expect(getFunctionName(fn as Parameters<typeof getFunctionName>[0])).toBe(
      "chats:backfillChatProfiles",
    );

    const next = createFakeCtx(db);
    const second = await runBackfill(next, (args as { cursor: string }).cursor);
    expect(second).toMatchObject({ scanned: 1, updated: 1, isDone: true });
    expect(next.scheduler.runAfter).not.toHaveBeenCalled();
    expect(db.all("chats").every((chat) => chat.profileId !== undefined)).toBe(true);
  });
});

describe("branchChat", () => {
  it("copies up to the branch message, remaps parents, and stops reading there", async () => {
    const { db, userId, ctx } = setup();
    const chatId = seedChat(db, userId, { title: "Original", updatedAt: 1 }) as Id<"chats">;
    const message = (role: string, createdAt: number, parentMessageId?: string) =>
      db.seed("messages", {
        chatId,
        userId,
        role,
        content: `${role}${createdAt}`,
        createdAt,
        parentMessageId,
      });
    const u1 = message("user", 1);
    message("assistant", 2, u1);
    const u2 = message("user", 3);
    const branchPoint = message("assistant", 4, u2);
    const u3 = message("user", 5);
    const a3 = message("assistant", 6, u3);

    const { chatId: newChatId } = (await asHandler(branchChat)(ctx, {
      originalChatId: chatId,
      branchFromMessageId: branchPoint,
    })) as { chatId: string };

    const copies = db.all("messages").filter((m) => m.chatId === newChatId);
    expect(copies.map((m) => m.content)).toEqual(["user1", "assistant2", "user3", "assistant4"]);
    const copyIdByContent = new Map(copies.map((m) => [m.content, m._id]));
    expect(copies.map((m) => m.parentMessageId)).toEqual([
      undefined,
      copyIdByContent.get("user1"),
      undefined,
      copyIdByContent.get("user3"),
    ]);
    expect(chatById(db, newChatId)?.originalChatId).toBe(chatId);
    // A legacy original without a profile gives the branch the user's (new) default profile
    expect(chatById(db, newChatId)?.profileId).toBe(defaultProfiles(db, userId)[0]._id);
    // Messages after the branch point are never read
    expect(db.readIds).not.toContain(u3);
    expect(db.readIds).not.toContain(a3);
  });

  it("files the branch under the original chat's profile", async () => {
    const { db, userId, ctx } = setup();
    const profileId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId: seedProfile(db, userId) });
    const chatId = seedChat(db, userId, { profileId }) as Id<"chats">;
    const branchPoint = db.seed("messages", {
      chatId,
      userId,
      role: "assistant",
      content: "a",
      createdAt: 1,
    });

    const { chatId: newChatId } = (await asHandler(branchChat)(ctx, {
      originalChatId: chatId,
      branchFromMessageId: branchPoint,
    })) as { chatId: string };

    expect(chatById(db, newChatId)?.profileId).toBe(profileId);
  });
});

describe("bulk chat deletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Seeds a chat with more messages than one purge run deletes. */
  function seedLargeChat(db: FakeDb, userId: Id<"users">) {
    const chatId = seedChat(db, userId, {});
    for (let i = 0; i < 2100; i += 1) {
      db.seed("messages", { chatId, userId, role: "user", content: `m${i}`, createdAt: i });
    }
    return chatId;
  }

  /** The purgeChats continuation a run scheduled, if any. */
  const continuation = (ctx: FakeCtx) =>
    ctx.scheduler.runAfter.mock.calls.map(([, , args]) => args)[0] as
      | Record<string, unknown>
      | undefined;

  it("deletes all of the user's chats and their messages in one call when small", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const chatId = seedChat(db, userId, {});
    db.seed("messages", { chatId, userId, role: "user", content: "hi", createdAt: 1 });
    const othersChat = seedChat(db, otherUserId, {});

    await asHandler(deleteAllChatsForUser)(ctx, {});

    expect(db.all("chats").map((chat) => chat._id)).toEqual([othersChat]);
    expect(db.all("messages")).toEqual([]);
    expect(continuation(ctx)).toBeUndefined();
  });

  it("finishes a large delete-all in the background, keeping chats created since", async () => {
    const { db, userId, ctx } = setup();
    seedLargeChat(db, userId);
    const requestedAt = Math.max(...db.all("messages").map((m) => m._creationTime));
    vi.spyOn(Date, "now").mockReturnValue(requestedAt);

    await asHandler(deleteAllChatsForUser)(ctx, {});
    const args = continuation(ctx);
    expect(args).toEqual({ userId, scope: { createdBefore: requestedAt } });

    const newChat = seedChat(db, userId, {});
    await asHandler(purgeChats)(createFakeCtx(db), args ?? {});

    expect(db.all("chats").map((chat) => chat._id)).toEqual([newChat]);
    expect(db.all("messages")).toEqual([]);
  });

  it("passes the chats not yet deleted on to the next run, ignoring other users' chats", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const small = seedChat(db, userId, {});
    const large = seedLargeChat(db, userId);
    const othersChat = seedChat(db, otherUserId, {});

    await asHandler(deleteBulkChats)(ctx, { chatIds: [small, large, othersChat] });
    const args = continuation(ctx);
    expect(args).toEqual({ userId, scope: { chatIds: [large, othersChat] } });

    const next = createFakeCtx(db);
    await asHandler(purgeChats)(next, args ?? {});

    expect(continuation(next)).toBeUndefined();
    expect(db.all("chats").map((chat) => chat._id)).toEqual([othersChat]);
    expect(db.all("messages")).toEqual([]);
  });
});
