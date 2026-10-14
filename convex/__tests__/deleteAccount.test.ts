import { getAuthUserId } from "@convex-dev/auth/server";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import { revokeDeletedUserAccess } from "../account_deletion";
import { deleteAccount, purgeDeletedUserData } from "../users";
import { createFakeCtx, createFakeDb, type FakeCtx, type FakeDb } from "./fake_db.testutil";

const mocks = vi.hoisted(() => ({
  cancelBillableSubscriptions: vi.fn<(ctx: unknown, userId: string) => Promise<void>>(
    async () => undefined,
  ),
  revokeUserConnections: vi.fn<(userId: string) => Promise<void>>(async () => undefined),
}));

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
  internalAction: (def: { handler: unknown }) => def.handler,
}));

vi.mock("../stripe", () => ({
  cancelBillableSubscriptions: mocks.cancelBillableSubscriptions,
  hasActivePremium: vi.fn<() => Promise<boolean>>(async () => false),
}));

vi.mock("../../src/lib/composio-server", () => ({
  revokeUserConnections: mocks.revokeUserConnections,
}));

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    limits: {},
    reset: vi.fn<() => Promise<void>>(async () => undefined),
    hookAPI: () => ({ getRateLimit: undefined, getServerTime: undefined }),
  },
}));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    deleteObject = vi.fn<() => Promise<void>>(async () => undefined);
  },
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
const asHandler = (fn: unknown) => fn as Handler;
const authUser = vi.mocked(getAuthUserId);

afterEach(() => {
  vi.clearAllMocks();
});

/** Scheduled calls as [delay, function name, args]. */
function scheduled(ctx: FakeCtx) {
  return ctx.scheduler.runAfter.mock.calls.map(([delay, fn, args]) => [
    delay,
    getFunctionName(fn as Parameters<typeof getFunctionName>[0]),
    args,
  ]);
}

function seedSignedInUser(db: FakeDb) {
  const userId = db.seed("users", { name: "User" }) as Id<"users">;
  const accountId = db.seed("authAccounts", { userId, provider: "google" });
  db.seed("authVerificationCodes", { accountId, provider: "google", code: "c" });
  const sessionId = db.seed("authSessions", { userId, expirationTime: 1 });
  db.seed("authRefreshTokens", { sessionId, expirationTime: 1 });
  db.seed("authRefreshTokens", { sessionId, expirationTime: 2 });
  return { userId, sessionId };
}

function seedRefreshTokens(db: FakeDb, sessionId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    db.seed("authRefreshTokens", { sessionId, expirationTime: i });
  }
}

describe("deleteAccount", () => {
  it("requires a signed-in user", async () => {
    authUser.mockResolvedValue(null);
    const ctx = createFakeCtx(createFakeDb());

    await expect(asHandler(deleteAccount)(ctx, {})).rejects.toEqual(
      new ConvexError(ERROR_CODES.NOT_AUTHENTICATED),
    );
  });

  it("is a no-op once the user is gone", async () => {
    authUser.mockResolvedValue("users:gone" as Id<"users">);
    const db = createFakeDb();
    const ctx = createFakeCtx(db);

    expect(await asHandler(deleteAccount)(ctx, {})).toBeNull();
    expect(db.stats.writes).toBe(0);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("deletes auth accounts and the user now, then schedules the purge and revocation", async () => {
    const db = createFakeDb();
    const { userId } = seedSignedInUser(db);
    const other = seedSignedInUser(db);
    const chatId = db.seed("chats", { userId, title: "Kept until the purge" });
    authUser.mockResolvedValue(userId);
    const ctx = createFakeCtx(db);

    expect(await asHandler(deleteAccount)(ctx, {})).toBeNull();

    expect(db.all("users").map((u) => u._id)).toEqual([other.userId]);
    expect(db.all("authAccounts").map((a) => a.userId)).toEqual([other.userId]);
    expect(db.all("authVerificationCodes")).toHaveLength(1);
    // Sessions and their refresh tokens go in the purge's first batch
    expect(db.all("authSessions")).toHaveLength(2);
    expect(db.all("chats").map((c) => c._id)).toEqual([chatId]);
    expect(scheduled(ctx)).toEqual([
      [0, "users:purgeDeletedUserData", { userId }],
      [0, "account_deletion:revokeDeletedUserAccess", { userId }],
    ]);

    // The first run deletes only the sessions, so a later step can't roll them back
    const sessionsRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(sessionsRun, { userId });
    expect(db.all("authSessions").map((s) => s.userId)).toEqual([other.userId]);
    expect(db.all("authRefreshTokens").map((t) => t.sessionId)).toEqual([
      other.sessionId,
      other.sessionId,
    ]);
    expect(db.all("chats").map((c) => c._id)).toEqual([chatId]);
    expect(scheduled(sessionsRun)).toEqual([[0, "users:purgeDeletedUserData", { userId }]]);

    await asHandler(purgeDeletedUserData)(createFakeCtx(db), { userId });
    expect(db.all("chats")).toEqual([]);
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

    expect(db.all("users")).toEqual([]);
    expect(db.stats.writes).toBeLessThan(10);
  });
});

describe("purgeDeletedUserData", () => {
  it("reschedules itself until everything is deleted, then once more after tokens expire", async () => {
    const db = createFakeDb();
    const userId = "users:deleted" as Id<"users">;
    const chatId = db.seed("chats", { userId, title: "Big chat" });
    for (let i = 0; i < 2100; i += 1) {
      db.seed("messages", { chatId, userId, role: "user", content: `m${i}`, createdAt: i });
    }

    const firstRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(firstRun, { userId });
    expect(scheduled(firstRun)).toEqual([[0, "users:purgeDeletedUserData", { userId }]]);

    const secondRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(secondRun, { userId });
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chats")).toEqual([]);
    expect(scheduled(secondRun)).toEqual([
      [65 * 60 * 1000, "users:purgeDeletedUserData", { userId, final: true }],
    ]);

    // A chat written afterwards with a still-valid token goes in the final run
    db.seed("chats", { userId, title: "Late chat" });
    const finalRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(finalRun, { userId, final: true });
    expect(db.all("chats")).toEqual([]);
    expect(finalRun.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("deletes the sessions and their refresh tokens in budgeted batches first", async () => {
    const db = createFakeDb();
    const userId = "users:deleted" as Id<"users">;
    const big = db.seed("authSessions", { userId, expirationTime: 1 });
    const small = db.seed("authSessions", { userId, expirationTime: 2 });
    const someoneElse = db.seed("authSessions", { userId: "users:other", expirationTime: 3 });
    seedRefreshTokens(db, big, 2100);
    seedRefreshTokens(db, small, 3);
    seedRefreshTokens(db, someoneElse, 1);
    db.seed("chats", { userId, title: "Chat" });

    const firstRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(firstRun, { userId });
    expect(scheduled(firstRun)).toEqual([[0, "users:purgeDeletedUserData", { userId }]]);
    // The session outlives the run that ran out of budget on its tokens
    expect(db.all("authSessions").map((s) => s._id)).toEqual([big, small, someoneElse]);
    expect(db.all("chats")).toHaveLength(1);

    const secondRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(secondRun, { userId });
    expect(db.all("authSessions").map((s) => s._id)).toEqual([someoneElse]);
    expect(db.all("authRefreshTokens").map((t) => t.sessionId)).toEqual([someoneElse]);
    // That run stopped after the sessions, committing them on their own
    expect(db.all("chats")).toHaveLength(1);

    const thirdRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(thirdRun, { userId });
    expect(db.all("chats")).toEqual([]);
    expect(scheduled(thirdRun)).toEqual([
      [65 * 60 * 1000, "users:purgeDeletedUserData", { userId, final: true }],
    ]);
  });

  it("deletes more sessions than one run's query budget across runs", async () => {
    const db = createFakeDb();
    const userId = "users:deleted" as Id<"users">;
    // Tokens already deleted by Convex Auth when a device failed to refresh: one query each
    for (let i = 0; i < 1500; i += 1) {
      db.seed("authSessions", { userId, expirationTime: i });
    }

    const firstRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(firstRun, { userId });
    expect(scheduled(firstRun)).toEqual([[0, "users:purgeDeletedUserData", { userId }]]);
    const left = db.all("authSessions").length;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(1500);

    const secondRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(secondRun, { userId });
    expect(db.all("authSessions")).toEqual([]);
    expect(scheduled(secondRun)).toEqual([[0, "users:purgeDeletedUserData", { userId }]]);

    const thirdRun = createFakeCtx(db);
    await asHandler(purgeDeletedUserData)(thirdRun, { userId });
    expect(scheduled(thirdRun)).toEqual([
      [65 * 60 * 1000, "users:purgeDeletedUserData", { userId, final: true }],
    ]);
  });
});

describe("revokeDeletedUserAccess", () => {
  const userId = "users:deleted" as Id<"users">;

  it("cancels subscriptions and deletes every Composio account of the user", async () => {
    const ctx = createFakeCtx(createFakeDb());

    await asHandler(revokeDeletedUserAccess)(ctx, { userId });

    expect(mocks.cancelBillableSubscriptions).toHaveBeenCalledWith(ctx, userId);
    expect(mocks.revokeUserConnections).toHaveBeenCalledWith(userId);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("still revokes Composio when Stripe fails, then retries with backoff", async () => {
    mocks.cancelBillableSubscriptions.mockRejectedValueOnce(new Error("Stripe down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = createFakeCtx(createFakeDb());

    await asHandler(revokeDeletedUserAccess)(ctx, { userId, attempt: 2 });

    expect(mocks.revokeUserConnections).toHaveBeenCalledWith(userId);
    expect(scheduled(ctx)).toEqual([
      [60_000, "account_deletion:revokeDeletedUserAccess", { userId, attempt: 3 }],
    ]);
  });

  it("retries when only Composio fails", async () => {
    mocks.revokeUserConnections.mockRejectedValueOnce(new Error("Composio down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = createFakeCtx(createFakeDb());

    await asHandler(revokeDeletedUserAccess)(ctx, { userId });

    expect(scheduled(ctx)).toEqual([
      [30_000, "account_deletion:revokeDeletedUserAccess", { userId, attempt: 2 }],
    ]);
  });

  it("gives up loudly after the last attempt", async () => {
    mocks.cancelBillableSubscriptions.mockRejectedValueOnce(new Error("Stripe down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = createFakeCtx(createFakeDb());

    await expect(asHandler(revokeDeletedUserAccess)(ctx, { userId, attempt: 5 })).rejects.toThrow(
      "Stripe down",
    );
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(userId), expect.any(Error));
  });
});
