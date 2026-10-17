import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { getFunctionName } from "convex/server";
import type {
  FunctionReference,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
} from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { revokeUserConnections } from "../../src/lib/composio-server";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import { revokeDeletedUserAccess } from "../account_deletion";
import { rateLimiter } from "../rateLimiter";
import type { cancelBillableSubscriptions, hasActivePremium } from "../stripe";
import { deleteAccount, purgeDeletedUserData } from "../users";
import { createFakeCtx, createFakeDb } from "./fake_db.testutil";
import type { FakeCtx, FakeDb } from "./fake_db.testutil";

const mocks = vi.hoisted(() => ({
  cancelBillableSubscriptions: vi
    .fn<typeof cancelBillableSubscriptions>()
    .mockResolvedValue(),
  revokeUserConnections: vi
    .fn<typeof revokeUserConnections>()
    .mockResolvedValue(),
}));

// Keep the real authTables, which the schema (and so the fake db) needs
vi.mock(import("@convex-dev/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

vi.mock(import("../stripe"), () => ({
  cancelBillableSubscriptions: mocks.cancelBillableSubscriptions,
  hasActivePremium: vi.fn<typeof hasActivePremium>().mockResolvedValue(false),
}));

vi.mock(import("../../src/lib/composio-server"), () => ({
  revokeUserConnections: mocks.revokeUserConnections,
}));

// The raw handler type of a registered mutation or action
type HandlerOf<Fn> =
  Fn extends RegisteredMutation<FunctionVisibility, infer Args, infer Returns>
    ? (ctx: unknown, args: Args) => Returns
    : Fn extends RegisteredAction<FunctionVisibility, infer Args, infer Returns>
      ? (ctx: unknown, args: Args) => Returns
      : never;
const isHandler = <Fn>(handler: unknown): handler is HandlerOf<Fn> =>
  typeof handler === "function";
// Convex keeps each registered function's handler on `_handler`; tests call it with a fake ctx
const asHandler = <Fn extends object>(fn: Fn): HandlerOf<Fn> => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler<Fn>(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return handler;
};

// Fake db ids are `users:n` strings
const isUserId = (id: string): id is Id<"users"> => id.startsWith("users:");
const toUserId = (id: string): Id<"users"> => {
  if (!isUserId(id)) {
    throw new TypeError(`Not a users id: ${id}`);
  }
  return id;
};

// Scheduled function references are api proxies, which getFunctionName reads
const isFunctionReference = (
  fn: unknown
): fn is FunctionReference<"mutation" | "action", "internal"> =>
  typeof fn === "object" && fn !== null;
const functionNameOf = (fn: unknown): string => {
  if (!isFunctionReference(fn)) {
    throw new TypeError("Expected a function reference");
  }
  return getFunctionName(fn);
};

const authUser = vi.mocked(getAuthUserId);

/** Scheduled calls as [delay, function name, args]. */
const scheduled = (ctx: FakeCtx) =>
  ctx.scheduler.runAfter.mock.calls.map(([delay, fn, args]) => [
    delay,
    functionNameOf(fn),
    args,
  ]);

const seedSignedInUser = (db: FakeDb) => {
  const userId = toUserId(db.seed("users", { name: "User" }));
  const accountId = db.seed("authAccounts", { userId, provider: "google" });
  db.seed("authVerificationCodes", {
    accountId,
    provider: "google",
    code: "c",
  });
  const sessionId = db.seed("authSessions", { userId, expirationTime: 1 });
  db.seed("authRefreshTokens", { sessionId, expirationTime: 1 });
  db.seed("authRefreshTokens", { sessionId, expirationTime: 2 });
  return { userId, sessionId };
};

const seedRefreshTokens = (db: FakeDb, sessionId: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    db.seed("authRefreshTokens", { sessionId, expirationTime: i });
  }
};

describe("account deletion", () => {
  beforeEach(() => {
    // Attachment objects and rate limit buckets live in components the fake ctx doesn't run
    vi.spyOn(R2.prototype, "deleteObject").mockResolvedValue();
    vi.spyOn(rateLimiter, "reset").mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteAccount mutation", () => {
    it("requires a signed-in user", async () => {
      authUser.mockResolvedValue(null);
      const ctx = createFakeCtx(createFakeDb());

      await expect(asHandler(deleteAccount)(ctx, {})).rejects.toStrictEqual(
        new ConvexError(ERROR_CODES.NOT_AUTHENTICATED)
      );
    });

    it("is a no-op once the user is gone", async () => {
      authUser.mockResolvedValue(toUserId("users:gone"));
      const db = createFakeDb();
      const ctx = createFakeCtx(db);

      await expect(asHandler(deleteAccount)(ctx, {})).resolves.toBeNull();
      expect(db.stats.writes).toBe(0);
      expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("deletes auth accounts and the user now, then schedules the purge and revocation", async () => {
      const db = createFakeDb();
      const { userId } = seedSignedInUser(db);
      const other = seedSignedInUser(db);
      const chatId = db.seed("chats", {
        userId,
        title: "Kept until the purge",
      });
      authUser.mockResolvedValue(userId);
      const ctx = createFakeCtx(db);

      await expect(asHandler(deleteAccount)(ctx, {})).resolves.toBeNull();

      expect({
        users: db.all("users").map((u) => u._id),
        authAccountUsers: db.all("authAccounts").map((a) => a.userId),
        authVerificationCodes: db.all("authVerificationCodes").length,
        // Sessions and their refresh tokens go in the purge's first batch
        authSessions: db.all("authSessions").length,
        chats: db.all("chats").map((c) => c._id),
        scheduled: scheduled(ctx),
      }).toStrictEqual({
        users: [other.userId],
        authAccountUsers: [other.userId],
        authVerificationCodes: 1,
        authSessions: 2,
        chats: [chatId],
        scheduled: [
          [0, "users:purgeDeletedUserData", { userId }],
          [0, "account_deletion:revokeDeletedUserAccess", { userId }],
        ],
      });

      // The first run deletes only the sessions, so a later step can't roll them back
      const sessionsRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(sessionsRun, { userId });
      expect({
        sessionUsers: db.all("authSessions").map((s) => s.userId),
        refreshTokenSessions: db
          .all("authRefreshTokens")
          .map((t) => t.sessionId),
        chats: db.all("chats").map((c) => c._id),
        scheduled: scheduled(sessionsRun),
      }).toStrictEqual({
        sessionUsers: [other.userId],
        refreshTokenSessions: [other.sessionId, other.sessionId],
        chats: [chatId],
        scheduled: [
          [0, "users:purgeDeletedUserData", { userId, final: undefined }],
        ],
      });

      await asHandler(purgeDeletedUserData)(createFakeCtx(db), { userId });
      expect(db.all("chats")).toStrictEqual([]);
    });

    it("stays within one transaction's limits for a user with many sessions", async () => {
      const db = createFakeDb();
      const { userId, sessionId } = seedSignedInUser(db);
      seedRefreshTokens(db, sessionId, 10_000);
      for (let i = 0; i < 10_000; i += 1) {
        db.seed("authSessions", { userId, expirationTime: i });
      }
      authUser.mockResolvedValue(userId);
      const ctx = createFakeCtx(db);

      await asHandler(deleteAccount)(ctx, {});

      expect(db.all("users")).toStrictEqual([]);
      expect(db.stats.writes).toBeLessThan(10);
    });
  });

  describe("purgeDeletedUserData internal mutation", () => {
    it("reschedules itself until everything is deleted, then once more after tokens expire", async () => {
      const db = createFakeDb();
      const userId = toUserId("users:deleted");
      const chatId = db.seed("chats", { userId, title: "Big chat" });
      for (let i = 0; i < 2100; i += 1) {
        db.seed("messages", {
          chatId,
          userId,
          role: "user",
          content: `m${i}`,
          createdAt: i,
        });
      }

      const firstRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(firstRun, { userId });
      expect(scheduled(firstRun)).toStrictEqual([
        [0, "users:purgeDeletedUserData", { userId, final: undefined }],
      ]);

      const secondRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(secondRun, { userId });
      expect({
        messages: db.all("messages"),
        chats: db.all("chats"),
        scheduled: scheduled(secondRun),
      }).toStrictEqual({
        messages: [],
        chats: [],
        scheduled: [
          [
            65 * 60 * 1000,
            "users:purgeDeletedUserData",
            { userId, final: true },
          ],
        ],
      });

      // A chat written afterwards with a still-valid token goes in the final run
      db.seed("chats", { userId, title: "Late chat" });
      const finalRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(finalRun, { userId, final: true });
      expect(db.all("chats")).toStrictEqual([]);
      expect(finalRun.scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("deletes the sessions and their refresh tokens in budgeted batches first", async () => {
      const db = createFakeDb();
      const userId = toUserId("users:deleted");
      const big = db.seed("authSessions", { userId, expirationTime: 1 });
      const small = db.seed("authSessions", { userId, expirationTime: 2 });
      const someoneElse = db.seed("authSessions", {
        userId: "users:other",
        expirationTime: 3,
      });
      seedRefreshTokens(db, big, 2100);
      seedRefreshTokens(db, small, 3);
      seedRefreshTokens(db, someoneElse, 1);
      db.seed("chats", { userId, title: "Chat" });

      const firstRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(firstRun, { userId });
      expect({
        scheduled: scheduled(firstRun),
        // The session outlives the run that ran out of budget on its tokens
        sessions: db.all("authSessions").map((s) => s._id),
        chats: db.all("chats").length,
      }).toStrictEqual({
        scheduled: [
          [0, "users:purgeDeletedUserData", { userId, final: undefined }],
        ],
        sessions: [big, small, someoneElse],
        chats: 1,
      });

      const secondRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(secondRun, { userId });
      expect({
        sessions: db.all("authSessions").map((s) => s._id),
        refreshTokenSessions: db
          .all("authRefreshTokens")
          .map((t) => t.sessionId),
        // That run stopped after the sessions, committing them on their own
        chats: db.all("chats").length,
      }).toStrictEqual({
        sessions: [someoneElse],
        refreshTokenSessions: [someoneElse],
        chats: 1,
      });

      const thirdRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(thirdRun, { userId });
      expect({
        chats: db.all("chats"),
        scheduled: scheduled(thirdRun),
      }).toStrictEqual({
        chats: [],
        scheduled: [
          [
            65 * 60 * 1000,
            "users:purgeDeletedUserData",
            { userId, final: true },
          ],
        ],
      });
    });

    it("deletes more sessions than one run's query budget across runs", async () => {
      const db = createFakeDb();
      const userId = toUserId("users:deleted");
      // Tokens already deleted by Convex Auth when a device failed to refresh: one query each
      for (let i = 0; i < 1500; i += 1) {
        db.seed("authSessions", { userId, expirationTime: i });
      }

      const firstRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(firstRun, { userId });
      expect(scheduled(firstRun)).toStrictEqual([
        [0, "users:purgeDeletedUserData", { userId, final: undefined }],
      ]);
      const left = db.all("authSessions").length;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(1500);

      const secondRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(secondRun, { userId });
      expect({
        sessions: db.all("authSessions"),
        scheduled: scheduled(secondRun),
      }).toStrictEqual({
        sessions: [],
        scheduled: [
          [0, "users:purgeDeletedUserData", { userId, final: undefined }],
        ],
      });

      const thirdRun = createFakeCtx(db);
      await asHandler(purgeDeletedUserData)(thirdRun, { userId });
      expect(scheduled(thirdRun)).toStrictEqual([
        [65 * 60 * 1000, "users:purgeDeletedUserData", { userId, final: true }],
      ]);
    });
  });

  describe("revokeDeletedUserAccess internal action", () => {
    const userId = toUserId("users:deleted");

    it("cancels subscriptions and deletes every Composio account of the user", async () => {
      const ctx = createFakeCtx(createFakeDb());

      await asHandler(revokeDeletedUserAccess)(ctx, { userId });

      expect(mocks.cancelBillableSubscriptions).toHaveBeenCalledWith(
        ctx,
        userId
      );
      expect(mocks.revokeUserConnections).toHaveBeenCalledWith(userId);
      expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("still revokes Composio when Stripe fails, then retries with backoff", async () => {
      mocks.cancelBillableSubscriptions.mockRejectedValueOnce(
        new Error("Stripe down")
      );
      vi.spyOn(console, "warn").mockReturnValue();
      const ctx = createFakeCtx(createFakeDb());

      await asHandler(revokeDeletedUserAccess)(ctx, { userId, attempt: 2 });

      expect(mocks.revokeUserConnections).toHaveBeenCalledWith(userId);
      expect(scheduled(ctx)).toStrictEqual([
        [
          60_000,
          "account_deletion:revokeDeletedUserAccess",
          { userId, attempt: 3 },
        ],
      ]);
    });

    it("retries when only Composio fails", async () => {
      mocks.revokeUserConnections.mockRejectedValueOnce(
        new Error("Composio down")
      );
      vi.spyOn(console, "warn").mockReturnValue();
      const ctx = createFakeCtx(createFakeDb());

      await asHandler(revokeDeletedUserAccess)(ctx, { userId });

      expect(scheduled(ctx)).toStrictEqual([
        [
          30_000,
          "account_deletion:revokeDeletedUserAccess",
          { userId, attempt: 2 },
        ],
      ]);
    });

    it("gives up loudly after the last attempt", async () => {
      mocks.cancelBillableSubscriptions.mockRejectedValueOnce(
        new Error("Stripe down")
      );
      const consoleError = vi.spyOn(console, "error").mockReturnValue();
      const ctx = createFakeCtx(createFakeDb());

      await expect(
        asHandler(revokeDeletedUserAccess)(ctx, { userId, attempt: 5 })
      ).rejects.toThrow("Stripe down");
      expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(userId),
        expect.any(Error)
      );
    });
  });
});
