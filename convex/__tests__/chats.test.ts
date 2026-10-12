import { getAuthUserId } from "@convex-dev/auth/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { branchChat, listChatsForUser, listPinnedChatsForUser, searchChats } from "../chats";
import { createFakeCtx, createFakeDb, type FakeDb } from "./fake_db.testutil";

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

describe("listChatsForUser", () => {
  it("pages through the user's chats by recent activity, legacy chats last", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const older = seedChat(db, userId, { updatedAt: 10 });
    const newest = seedChat(db, userId, { updatedAt: 30, isPinned: true });
    const middle = seedChat(db, userId, { updatedAt: 20 });
    const legacy = seedChat(db, userId, {});
    seedChat(db, otherUserId, { updatedAt: 40 });

    const first = (await asHandler(listChatsForUser)(ctx, {
      paginationOpts: { numItems: 2, cursor: null },
    })) as Page;
    expect(first.page.map((c) => c._id)).toEqual([newest, middle]);
    expect(first.isDone).toBe(false);

    const second = (await asHandler(listChatsForUser)(ctx, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    })) as Page;
    expect(second.page.map((c) => c._id)).toEqual([older, legacy]);
    expect(second.isDone).toBe(true);
  });

  it("returns an empty, finished page when signed out", async () => {
    const { ctx } = setup();
    authUser.mockResolvedValue(null);

    expect(
      await asHandler(listChatsForUser)(ctx, { paginationOpts: { numItems: 10, cursor: null } }),
    ).toEqual({ page: [], isDone: true, continueCursor: "" });
  });
});

describe("listPinnedChatsForUser", () => {
  it("returns only the user's pinned chats", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const pinned = seedChat(db, userId, { isPinned: true, updatedAt: 1 });
    seedChat(db, userId, { isPinned: false, updatedAt: 2 });
    seedChat(db, userId, { updatedAt: 3 });
    seedChat(db, otherUserId, { isPinned: true, updatedAt: 4 });

    const chats = (await asHandler(listPinnedChatsForUser)(ctx, {})) as Array<{ _id: string }>;
    expect(chats.map((c) => c._id)).toEqual([pinned]);
  });
});

describe("searchChats", () => {
  it("matches the user's chat titles", async () => {
    const { db, userId, otherUserId, ctx } = setup();
    const trip = seedChat(db, userId, { title: "Trip to Paris" });
    const budget = seedChat(db, userId, { title: "Paris budget" });
    seedChat(db, userId, { title: "Groceries" });
    seedChat(db, otherUserId, { title: "Paris" });

    const found = (await asHandler(searchChats)(ctx, { query: " paris " })) as Array<{
      _id: string;
    }>;
    // Order is by relevance; convex/tsconfig targets ES2022, so no toSorted here
    expect(found.map((c) => c._id)).toHaveLength(2);
    expect(found.map((c) => c._id)).toEqual(expect.arrayContaining([trip, budget]));
    expect(await asHandler(searchChats)(ctx, { query: "   " })).toEqual([]);
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
    expect(db.all("chats").find((c) => c._id === newChatId)?.originalChatId).toBe(chatId);
    // Messages after the branch point are never read
    expect(db.readIds).not.toContain(u3);
    expect(db.readIds).not.toContain(a3);
  });
});
