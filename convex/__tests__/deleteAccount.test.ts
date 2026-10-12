import { getAuthUserId } from "@convex-dev/auth/server";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import { cancelDeletedUserSubscriptions, deleteAccount, purgeDeletedUserData } from "../users";
import { createFakeCtx, createFakeDb, type FakeCtx, type FakeDb } from "./fake_db.testutil";

const mocks = vi.hoisted(() => ({
  cancelBillableSubscriptions: vi.fn<(ctx: unknown, userId: string) => Promise<void>>(
    async () => undefined,
  ),
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
  return userId;
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

  it("deletes sign-in data and the user now, then schedules the purge and cancellation", async () => {
    const db = createFakeDb();
    const userId = seedSignedInUser(db);
    const otherUserId = seedSignedInUser(db);
    const chatId = db.seed("chats", { userId, title: "Kept until the purge" });
    authUser.mockResolvedValue(userId);
    const ctx = createFakeCtx(db);

    expect(await asHandler(deleteAccount)(ctx, {})).toBeNull();

    expect(db.all("users").map((u) => u._id)).toEqual([otherUserId]);
    expect(db.all("authAccounts").map((a) => a.userId)).toEqual([otherUserId]);
    expect(db.all("authSessions").map((s) => s.userId)).toEqual([otherUserId]);
    expect(db.all("authVerificationCodes")).toHaveLength(1);
    expect(db.all("authRefreshTokens")).toHaveLength(2);
    expect(db.all("chats").map((c) => c._id)).toEqual([chatId]);
    expect(scheduled(ctx)).toEqual([
      [0, "users:purgeDeletedUserData", { userId }],
      [0, "users:cancelDeletedUserSubscriptions", { userId }],
    ]);
  });
});

describe("purgeDeletedUserData", () => {
  it("reschedules itself until everything is deleted", async () => {
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
    expect(secondRun.scheduler.runAfter).not.toHaveBeenCalled();
    expect(db.all("messages")).toEqual([]);
    expect(db.all("chats")).toEqual([]);
  });
});

describe("cancelDeletedUserSubscriptions", () => {
  const userId = "users:deleted" as Id<"users">;

  it("retries a failed cancellation with backoff", async () => {
    mocks.cancelBillableSubscriptions.mockRejectedValueOnce(new Error("Stripe down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = createFakeCtx(createFakeDb());

    await asHandler(cancelDeletedUserSubscriptions)(ctx, { userId, attempt: 2 });

    expect(scheduled(ctx)).toEqual([
      [60_000, "users:cancelDeletedUserSubscriptions", { userId, attempt: 3 }],
    ]);
  });

  it("gives up loudly after the last attempt", async () => {
    mocks.cancelBillableSubscriptions.mockRejectedValueOnce(new Error("Stripe down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = createFakeCtx(createFakeDb());

    await expect(
      asHandler(cancelDeletedUserSubscriptions)(ctx, { userId, attempt: 5 }),
    ).rejects.toThrow("Stripe down");
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(userId), expect.any(Error));
  });

  it("does not reschedule after a successful cancellation", async () => {
    const ctx = createFakeCtx(createFakeDb());

    await asHandler(cancelDeletedUserSubscriptions)(ctx, { userId });

    expect(mocks.cancelBillableSubscriptions).toHaveBeenCalledWith(ctx, userId);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });
});
