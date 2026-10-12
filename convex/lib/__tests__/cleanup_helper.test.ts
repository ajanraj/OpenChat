import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  createFakeCtx,
  createFakeDb,
  type FakeCtx,
  type FakeDb,
} from "../../__tests__/fake_db.testutil";
import { deleteMultipleChats, purgeUserDataBatch, removeBranchReferences } from "../cleanup_helper";

const mocks = vi.hoisted(() => ({
  r2DeleteObject: vi.fn<(ctx: unknown, key: string) => Promise<void>>(async () => undefined),
  rateLimiterReset: vi.fn<(ctx: unknown, name: string, args: { key: string }) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    deleteObject = mocks.r2DeleteObject;
  },
}));

vi.mock("../../rateLimiter", () => ({
  rateLimiter: {
    limits: { authenticatedDaily: {}, standardMonthly: {} },
    reset: mocks.rateLimiterReset,
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
    expect(patch.mock.calls.map(([, id]) => id)).toEqual([survivingBranch]);
  });
});

describe("purgeUserDataBatch", () => {
  function seedAccountData(db: FakeDb, userId: Id<"users">) {
    const taskId = db.seed("scheduled_tasks", {
      userId,
      title: "Daily",
      scheduledFunctionId: "_scheduled_functions:1",
    });
    db.seed("task_history", { taskId, startTime: 1 });
    db.seed("task_history", { taskId, startTime: 2 });
    const chatId = seedChat(db, userId);
    db.seed("messages", { chatId, userId, role: "user", content: "hi", createdAt: 1 });
    // Legacy message without a userId, only reachable through its chat
    db.seed("messages", { chatId, role: "assistant", content: "hello", createdAt: 2 });
    db.seed("chat_attachments", { userId, chatId, key: "uploads/a.png" });
    db.seed("feedback", { userId, message: "great" });
    db.seed("usage_history", { userId });
    db.seed("profiles", { userId, isDefault: true });
    db.seed("connectors", { userId, type: "gmail", isConnected: true });
    db.seed("user_api_keys", { userId, provider: "openai" });
  }

  const purgedTables = [
    "scheduled_tasks",
    "task_history",
    "chats",
    "messages",
    "chat_attachments",
    "feedback",
    "usage_history",
    "profiles",
    "connectors",
    "user_api_keys",
  ] as const;

  it("deletes the user's data, cancels runs, frees R2 and rate limits, keeps others", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const otherUserId = seedUser(db);
    seedAccountData(db, userId);
    const otherChat = seedChat(db, otherUserId);
    db.seed("messages", { chatId: otherChat, userId: otherUserId, role: "user", content: "x" });
    db.seed("stripe_credit_resets", { userId, stripeInvoiceId: "in_1" });
    const ctx = createFakeCtx(db);

    expect(await purgeUserDataBatch(asCtx(ctx), userId)).toBe(true);

    for (const table of purgedTables) {
      expect(db.all(table).filter((row) => row.userId === userId)).toEqual([]);
    }
    expect(db.all("task_history")).toEqual([]);
    expect(db.all("messages").map((m) => m.userId)).toEqual([otherUserId]);
    expect(db.all("chats").map((c) => c._id)).toEqual([otherChat]);
    // Billing records are kept
    expect(db.all("stripe_credit_resets")).toHaveLength(1);
    expect(ctx.scheduler.cancel).toHaveBeenCalledWith("_scheduled_functions:1");
    expect(mocks.r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
    expect(mocks.rateLimiterReset.mock.calls.map(([, name, args]) => [name, args])).toEqual([
      ["authenticatedDaily", { key: userId }],
      ["standardMonthly", { key: userId }],
    ]);
  });

  it("stops at its write budget and finishes on a later run", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const chatId = seedChat(db, userId);
    for (let i = 0; i < 2100; i += 1) {
      db.seed("messages", { chatId, userId, role: "user", content: `m${i}`, createdAt: i });
    }

    expect(await purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)).toBe(false);
    const left = db.all("messages").length;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(2100);
    expect(mocks.rateLimiterReset).not.toHaveBeenCalled();

    expect(await purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)).toBe(true);
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chats")).toEqual([]);
  });

  it("caps R2 deletes per run", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    for (let i = 0; i < 150; i += 1) {
      db.seed("chat_attachments", { userId, key: `uploads/${i}.png` });
    }

    expect(await purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)).toBe(false);
    expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(100);
    expect(await purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)).toBe(true);
    expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(150);
    expect(db.all("chat_attachments")).toEqual([]);
  });

  it("logs a failed R2 delete and still removes the record", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    db.seed("chat_attachments", { userId, key: "uploads/broken.png" });
    mocks.r2DeleteObject.mockRejectedValueOnce(new Error("R2 config missing"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)).toBe(true);

    expect(db.all("chat_attachments")).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("uploads/broken.png"),
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
