import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  createFakeCtx,
  createFakeDb,
  type FakeCtx,
  type FakeDb,
} from "../../__tests__/fake_db.testutil";
import { deleteMultipleChats, removeBranchReferences } from "../cleanup_helper";

const mocks = vi.hoisted(() => ({
  r2DeleteObject: vi.fn<(ctx: unknown, key: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    deleteObject = mocks.r2DeleteObject;
  },
}));

const asCtx = (ctx: FakeCtx) => ctx as unknown as MutationCtx;

afterEach(() => {
  vi.clearAllMocks();
});

function seedUser(db: FakeDb) {
  return db.seed("users", { name: "User" }) as Id<"users">;
}

function seedChat(db: FakeDb, userId: Id<"users">, fields: Record<string, unknown> = {}) {
  return db.seed("chats", { userId, title: "Chat", updatedAt: 1, ...fields }) as Id<"chats">;
}

describe("removeBranchReferences", () => {
  it("unlinks only the user's branches of the given chat", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const otherUserId = seedUser(db);
    const parent = seedChat(db, userId);
    const otherParent = seedChat(db, userId);
    const branch = seedChat(db, userId, { originalChatId: parent });
    const unrelatedBranch = seedChat(db, userId, { originalChatId: otherParent });
    const otherUsersBranch = seedChat(db, otherUserId, { originalChatId: parent });

    await removeBranchReferences(asCtx(createFakeCtx(db)), parent, userId);

    const chats = new Map(db.all("chats").map((chat) => [chat._id, chat]));
    expect(chats.get(branch)?.originalChatId).toBeUndefined();
    expect(chats.get(unrelatedBranch)?.originalChatId).toBe(otherParent);
    expect(chats.get(otherUsersBranch)?.originalChatId).toBe(parent);
  });
});

describe("deleteMultipleChats", () => {
  it("deletes the chats with their messages and unlinks only surviving branches", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const parent = seedChat(db, userId);
    const deletedBranch = seedChat(db, userId, { originalChatId: parent });
    const survivingBranch = seedChat(db, userId, { originalChatId: parent });
    db.seed("messages", { chatId: parent, userId, role: "user", content: "hi", createdAt: 1 });
    db.seed("messages", {
      chatId: deletedBranch,
      userId,
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    const patch = vi.spyOn(db, "patch");
    const chats = db.all("chats").filter((chat) => chat._id !== survivingBranch);

    await deleteMultipleChats(asCtx(createFakeCtx(db)), chats as unknown as Doc<"chats">[], userId);

    expect(db.all("chats").map((chat) => chat._id)).toEqual([survivingBranch]);
    expect(db.all("chats")[0].originalChatId).toBeUndefined();
    expect(db.all("messages")).toEqual([]);
    // The deleted branch is removed outright, never patched first
    expect(patch.mock.calls.map(([id]) => id)).toEqual([survivingBranch]);
  });
});
