import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeCtx, createFakeDb } from "../../__tests__/fake_db.testutil";
import type { FakeCtx, FakeDb } from "../../__tests__/fake_db.testutil";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  purgeChatsBatch,
  purgeUserDataBatch,
  removeBranchReferences,
} from "../cleanup_helper";

const mocks = vi.hoisted(() => ({
  r2DeleteObject: vi.fn<(ctx: unknown, key: string) => Promise<void>>(
    async () => undefined
  ),
  rateLimiterReset: vi.fn<
    (ctx: unknown, name: string, args: { key: string }) => Promise<void>
  >(async () => undefined),
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
  vi.restoreAllMocks();
});

/** Scheduled runAt calls as [time, function name, args]. */
function scheduledAt(ctx: FakeCtx) {
  return ctx.scheduler.runAt.mock.calls.map(([time, fn, args]) => [
    time,
    getFunctionName(fn as Parameters<typeof getFunctionName>[0]),
    args,
  ]);
}

function seedUser(db: FakeDb) {
  return db.seed("users", { name: "User" }) as Id<"users">;
}

function seedChat(
  db: FakeDb,
  userId: Id<"users">,
  fields: Record<string, unknown> = {}
) {
  return db.seed("chats", {
    userId,
    title: "Chat",
    updatedAt: 1,
    ...fields,
  }) as Id<"chats">;
}

describe("removeBranchReferences", () => {
  it("unlinks only the user's branches of the given chat", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const otherUserId = seedUser(db);
    const parent = seedChat(db, userId);
    const otherParent = seedChat(db, userId);
    const branch = seedChat(db, userId, { originalChatId: parent });
    const unrelatedBranch = seedChat(db, userId, {
      originalChatId: otherParent,
    });
    const otherUsersBranch = seedChat(db, otherUserId, {
      originalChatId: parent,
    });

    await removeBranchReferences(asCtx(createFakeCtx(db)), parent, userId);

    const chats = new Map(db.all("chats").map((chat) => [chat._id, chat]));
    expect(chats.get(branch)?.originalChatId).toBeUndefined();
    expect(chats.get(unrelatedBranch)?.originalChatId).toBe(otherParent);
    expect(chats.get(otherUsersBranch)?.originalChatId).toBe(parent);
  });
});

async function* each<T>(rows: T[]) {
  yield* rows;
}

describe("purgeChatsBatch", () => {
  it("deletes the chats with their messages and attachments, unlinking their branches", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const parent = seedChat(db, userId);
    const deletedBranch = seedChat(db, userId, { originalChatId: parent });
    const survivingBranch = seedChat(db, userId, { originalChatId: parent });
    db.seed("messages", {
      chatId: parent,
      userId,
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    db.seed("messages", {
      chatId: deletedBranch,
      userId,
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    // Legacy attachment without a userId, only reachable through its chat
    db.seed("chat_attachments", { chatId: parent, key: "uploads/legacy.png" });
    const deleting = new Set<string>([parent, deletedBranch]);
    const chats = db.all("chats").filter((chat) => deleting.has(chat._id));

    const done = await purgeChatsBatch(
      asCtx(createFakeCtx(db)),
      userId,
      each(chats as unknown as Doc<"chats">[]),
      true
    );

    expect(done).toBe(true);
    expect(db.all("chats").map((chat) => chat._id)).toEqual([survivingBranch]);
    expect(db.all("chats")[0].originalChatId).toBeUndefined();
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chat_attachments")).toEqual([]);
    expect(mocks.r2DeleteObject).toHaveBeenCalledWith(
      expect.anything(),
      "uploads/legacy.png"
    );
  });

  it("stops at its budget and resumes a partly deleted chat on the next run", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const chatId = seedChat(db, userId);
    for (let i = 0; i < 2100; i += 1) {
      db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: `m${i}`,
        createdAt: i,
      });
    }
    const run = () =>
      purgeChatsBatch(
        asCtx(createFakeCtx(db)),
        userId,
        each(db.all("chats") as unknown as Doc<"chats">[]),
        false
      );

    await expect(run()).resolves.toBe(false);
    expect(db.all("chats")).toHaveLength(1);
    await expect(run()).resolves.toBe(true);
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chats")).toEqual([]);
  });

  it("unlinks branches within its budget and deletes the parent only once every link is cleared", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const parent = seedChat(db, userId);
    for (let i = 0; i < 2101; i += 1) {
      seedChat(db, userId, { originalChatId: parent });
    }
    const parentDoc = db.all("chats")[0] as unknown as Doc<"chats">;
    const linked = () =>
      db.all("chats").filter((chat) => chat.originalChatId === parent);
    const run = () =>
      purgeChatsBatch(
        asCtx(createFakeCtx(db)),
        userId,
        each([parentDoc]),
        true
      );

    // The first run stops partway through the branches, keeping the parent
    await expect(run()).resolves.toBe(false);
    expect(db.all("chats").some((chat) => chat._id === parent)).toBe(true);
    expect(linked().length).toBeGreaterThan(1);
    expect(linked().length).toBeLessThan(2101);

    await expect(run()).resolves.toBe(true);
    expect(db.all("chats").some((chat) => chat._id === parent)).toBe(false);
    expect(linked()).toEqual([]);
  });

  it("keeps making progress when the branches being deleted too overrun the read budget", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const parent = seedChat(db, userId);
    // Reading every branch takes more than one batch's read budget
    const title = "x".repeat(900 * 1024);
    for (let i = 0; i < 16; i += 1) {
      seedChat(db, userId, { originalChatId: parent, title });
    }
    // Deletes every chat, as a bulk delete selecting the parent and all its branches does
    const run = () =>
      purgeChatsBatch(
        asCtx(createFakeCtx(db)),
        userId,
        each(db.all("chats") as unknown as Doc<"chats">[]),
        true
      );

    await expect(run()).resolves.toBe(false);
    await expect(run()).resolves.toBe(true);
    expect(db.all("chats")).toEqual([]);
  });

  it("re-checks the key of an attachment deleted while its upload URL may still be live", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const chatId = seedChat(db, userId);
    db.seed("chat_attachments", { userId, chatId, key: "uploads/fresh.png" });
    const [attachment] = db.all("chat_attachments");
    vi.spyOn(Date, "now").mockReturnValue(attachment._creationTime + 60_000);
    const ctx = createFakeCtx(db);

    const done = await purgeChatsBatch(
      asCtx(ctx),
      userId,
      each(db.all("chats") as unknown as Doc<"chats">[]),
      false
    );

    expect(done).toBe(true);
    expect(scheduledAt(ctx)).toEqual([
      [
        attachment._creationTime + 16 * 60_000,
        "files:enforceAttachmentPolicy",
        { key: "uploads/fresh.png" },
      ],
    ]);
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
    db.seed("messages", {
      chatId,
      userId,
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    // Legacy message without a userId, only reachable through its chat
    db.seed("messages", {
      chatId,
      role: "assistant",
      content: "hello",
      createdAt: 2,
    });
    db.seed("chat_attachments", { userId, chatId, key: "uploads/a.png" });
    db.seed("feedback", { userId, message: "great" });
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
    db.seed("messages", {
      chatId: otherChat,
      userId: otherUserId,
      role: "user",
      content: "x",
    });
    db.seed("stripe_credit_resets", { userId, stripeInvoiceId: "in_1" });
    const ctx = createFakeCtx(db);

    await expect(purgeUserDataBatch(asCtx(ctx), userId)).resolves.toBe(true);

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
    // Its upload URL expired long ago, so the key needs no re-check
    expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
    expect(
      mocks.rateLimiterReset.mock.calls.map(([, name, args]) => [name, args])
    ).toEqual([
      ["authenticatedDaily", { key: userId }],
      ["standardMonthly", { key: userId }],
    ]);
  });

  it("stops at its write budget and finishes on a later run", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    const chatId = seedChat(db, userId);
    for (let i = 0; i < 2100; i += 1) {
      db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: `m${i}`,
        createdAt: i,
      });
    }

    await expect(
      purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
    ).resolves.toBe(false);
    const left = db.all("messages").length;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(2100);
    expect(mocks.rateLimiterReset).not.toHaveBeenCalled();

    await expect(
      purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
    ).resolves.toBe(true);
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chats")).toEqual([]);
  });

  it("caps R2 deletes per run", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    for (let i = 0; i < 150; i += 1) {
      db.seed("chat_attachments", { userId, key: `uploads/${i}.png` });
    }

    await expect(
      purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
    ).resolves.toBe(false);
    expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(100);
    await expect(
      purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
    ).resolves.toBe(true);
    expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(150);
    expect(db.all("chat_attachments")).toEqual([]);
  });

  it("logs a failed R2 delete and still removes the record", async () => {
    const db = createFakeDb();
    const userId = seedUser(db);
    db.seed("chat_attachments", { userId, key: "uploads/broken.png" });
    mocks.r2DeleteObject.mockRejectedValueOnce(new Error("R2 config missing"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
    ).resolves.toBe(true);

    expect(db.all("chat_attachments")).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("uploads/broken.png"),
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
