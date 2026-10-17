import { R2 } from "@convex-dev/r2";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeCtx, createFakeDb } from "../../__tests__/fake_db.testutil";
import type { FakeCtx, FakeDb, Row } from "../../__tests__/fake_db.testutil";
import type { Doc, Id, TableNames } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { rateLimiter } from "../../rateLimiter";
import {
  purgeChatsBatch,
  purgeUserDataBatch,
  removeBranchReferences,
} from "../cleanup_helper";

// Fake ids are `<table>:<n>`, the format the real normalizeId also checks the table of
const isIdOf = <T extends TableNames | "_scheduled_functions">(
  table: T,
  id: string
): id is Id<T> => id.startsWith(`${table}:`);

const toId = <T extends TableNames>(table: T, id: string): Id<T> => {
  if (!isIdOf(table, id)) {
    throw new Error(`${id} is not a ${table} id`);
  }
  return id;
};

const isChatDoc = (row: Row): row is Row & Doc<"chats"> =>
  isIdOf("chats", row._id);

const chatDocs = (rows: Row[]): Doc<"chats">[] => rows.filter(isChatDoc);

const isMutationCtx = (ctx: object): ctx is MutationCtx =>
  "db" in ctx && "scheduler" in ctx && "meta" in ctx;

/** The fake ctx as a MutationCtx, with the system-table id check purgeUserDataBatch uses. */
const asCtx = (fake: FakeCtx): MutationCtx => {
  const system = {
    normalizeId: (table: "_scheduled_functions", id: string) =>
      isIdOf(table, id) ? id : null,
  };
  const ctx = { ...fake, db: Object.assign(fake.db, { system }) };
  if (!isMutationCtx(ctx)) {
    throw new Error("The fake ctx lacks db, scheduler or meta");
  }
  return ctx;
};

const isFunctionReference = (
  fn: unknown
): fn is FunctionReference<"mutation", "internal"> =>
  typeof fn === "object" && fn !== null;

/** Scheduled runAt calls as [time, function name, args]. */
const scheduledAt = (ctx: FakeCtx) =>
  ctx.scheduler.runAt.mock.calls.map(([time, fn, args]) => [
    time,
    isFunctionReference(fn) ? getFunctionName(fn) : fn,
    args,
  ]);

const seedUser = (db: FakeDb) =>
  toId("users", db.seed("users", { name: "User" }));

const seedChat = (
  db: FakeDb,
  userId: Id<"users">,
  fields: Record<string, unknown> = {}
) =>
  toId(
    "chats",
    db.seed("chats", {
      userId,
      title: "Chat",
      updatedAt: 1,
      ...fields,
    })
  );

const each = async function* each<T>(rows: T[]) {
  yield* rows;
};

const seedAccountData = (db: FakeDb, userId: Id<"users">) => {
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
};

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

/** Purges a user with data in every table, next to another user's chat and message. */
const purgeSeededUser = async () => {
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
  const done = await purgeUserDataBatch(asCtx(ctx), userId);
  return { db, ctx, done, userId, otherUserId, otherChat };
};

const spyOnServices = () => ({
  r2DeleteObject: vi.spyOn(R2.prototype, "deleteObject").mockResolvedValue(),
  rateLimiterReset: vi.spyOn(rateLimiter, "reset").mockResolvedValue(),
});

describe("cleanup_helper", () => {
  let mocks: ReturnType<typeof spyOnServices>;

  beforeEach(() => {
    mocks = spyOnServices();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe(removeBranchReferences, () => {
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

  describe(purgeChatsBatch, () => {
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
      db.seed("chat_attachments", {
        chatId: parent,
        key: "uploads/legacy.png",
      });
      const deleting = new Set<string>([parent, deletedBranch]);
      const chats = db.all("chats").filter((chat) => deleting.has(chat._id));

      const done = await purgeChatsBatch(
        asCtx(createFakeCtx(db)),
        userId,
        each(chatDocs(chats)),
        true
      );

      expect(done).toBeTruthy();
      expect({
        chats: db.all("chats").map((chat) => [chat._id, chat.originalChatId]),
        messages: db.all("messages"),
        attachments: db.all("chat_attachments"),
      }).toStrictEqual({
        chats: [[survivingBranch, undefined]],
        messages: [],
        attachments: [],
      });
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
      const run = async () =>
        await purgeChatsBatch(
          asCtx(createFakeCtx(db)),
          userId,
          each(chatDocs(db.all("chats"))),
          false
        );

      await expect(run()).resolves.toBeFalsy();
      expect(db.all("chats")).toHaveLength(1);
      await expect(run()).resolves.toBeTruthy();
      expect(db.all("messages")).toStrictEqual([]);
      expect(db.all("chats")).toStrictEqual([]);
    });

    it("unlinks branches within its budget and deletes the parent only once every link is cleared", async () => {
      const db = createFakeDb();
      const userId = seedUser(db);
      const parent = seedChat(db, userId);
      for (let i = 0; i < 2101; i += 1) {
        seedChat(db, userId, { originalChatId: parent });
      }
      const [parentDoc] = chatDocs(db.all("chats"));
      const linked = () =>
        db.all("chats").filter((chat) => chat.originalChatId === parent);
      const hasParent = () =>
        db.all("chats").some((chat) => chat._id === parent);
      const run = async () =>
        await purgeChatsBatch(
          asCtx(createFakeCtx(db)),
          userId,
          each([parentDoc]),
          true
        );

      // The first run stops partway through the branches, keeping the parent
      const firstDone = await run();
      expect({ done: firstDone, parentKept: hasParent() }).toStrictEqual({
        done: false,
        parentKept: true,
      });
      expect(linked().length).toBeGreaterThan(1);
      expect(linked().length).toBeLessThan(2101);

      const secondDone = await run();
      expect({
        done: secondDone,
        parentKept: hasParent(),
        linked: linked(),
      }).toStrictEqual({ done: true, parentKept: false, linked: [] });
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
      const run = async () =>
        await purgeChatsBatch(
          asCtx(createFakeCtx(db)),
          userId,
          each(chatDocs(db.all("chats"))),
          true
        );

      await expect(run()).resolves.toBeFalsy();
      await expect(run()).resolves.toBeTruthy();
      expect(db.all("chats")).toStrictEqual([]);
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
        each(chatDocs(db.all("chats"))),
        false
      );

      expect(done).toBeTruthy();
      expect(scheduledAt(ctx)).toStrictEqual([
        [
          attachment._creationTime + 16 * 60_000,
          "files:enforceAttachmentPolicy",
          { key: "uploads/fresh.png" },
        ],
      ]);
    });
  });

  describe(purgeUserDataBatch, () => {
    it("deletes the user's data and keeps others' data and billing records", async () => {
      const { db, done, userId, otherUserId, otherChat } =
        await purgeSeededUser();

      expect(done).toBeTruthy();
      expect(
        purgedTables.map((table) =>
          db.all(table).filter((row) => row.userId === userId)
        )
      ).toStrictEqual(purgedTables.map(() => []));
      expect({
        taskHistory: db.all("task_history"),
        messageOwners: db.all("messages").map((m) => m.userId),
        chats: db.all("chats").map((c) => c._id),
        // Billing records are kept
        billingRecords: db.all("stripe_credit_resets").length,
      }).toStrictEqual({
        taskHistory: [],
        messageOwners: [otherUserId],
        chats: [otherChat],
        billingRecords: 1,
      });
    });

    it("cancels the user's runs and frees their R2 objects and rate limits", async () => {
      const { ctx, userId } = await purgeSeededUser();

      expect(ctx.scheduler.cancel).toHaveBeenCalledWith(
        "_scheduled_functions:1"
      );
      expect(mocks.r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
      // Its upload URL expired long ago, so the key needs no re-check
      expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
      expect(
        mocks.rateLimiterReset.mock.calls.map(([, name, args]) => [name, args])
      ).toStrictEqual(
        Object.keys(rateLimiter.limits ?? {}).map((name) => [
          name,
          { key: userId },
        ])
      );
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

      const firstDone = await purgeUserDataBatch(
        asCtx(createFakeCtx(db)),
        userId
      );
      expect({
        done: firstDone,
        resets: mocks.rateLimiterReset.mock.calls,
      }).toStrictEqual({ done: false, resets: [] });
      const left = db.all("messages").length;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(2100);

      const secondDone = await purgeUserDataBatch(
        asCtx(createFakeCtx(db)),
        userId
      );
      expect({
        done: secondDone,
        messages: db.all("messages"),
        chats: db.all("chats"),
      }).toStrictEqual({ done: true, messages: [], chats: [] });
    });

    it("caps R2 deletes per run", async () => {
      const db = createFakeDb();
      const userId = seedUser(db);
      for (let i = 0; i < 150; i += 1) {
        db.seed("chat_attachments", { userId, key: `uploads/${i}.png` });
      }

      await expect(
        purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
      ).resolves.toBeFalsy();
      expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(100);
      await expect(
        purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
      ).resolves.toBeTruthy();
      expect(mocks.r2DeleteObject).toHaveBeenCalledTimes(150);
      expect(db.all("chat_attachments")).toStrictEqual([]);
    });

    it("logs a failed R2 delete and still removes the record", async () => {
      const db = createFakeDb();
      const userId = seedUser(db);
      db.seed("chat_attachments", { userId, key: "uploads/broken.png" });
      mocks.r2DeleteObject.mockRejectedValueOnce(
        new Error("R2 config missing")
      );
      const consoleError = vi.spyOn(console, "error").mockReturnValue();

      await expect(
        purgeUserDataBatch(asCtx(createFakeCtx(db)), userId)
      ).resolves.toBeTruthy();

      expect(db.all("chat_attachments")).toStrictEqual([]);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("uploads/broken.png"),
        expect.any(Error)
      );
      consoleError.mockRestore();
    });
  });
});
