import { getAuthUserId } from "@convex-dev/auth/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { deleteProfile, ensureDefaultProfile } from "../profiles";
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
  internalQuery: (def: { handler: unknown }) => def.handler,
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
const asHandler = (fn: unknown) => fn as Handler;

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  const db = createFakeDb();
  const userId = db.seed("users", { name: "User", preferredModel: "model-a" }) as Id<"users">;
  vi.mocked(getAuthUserId).mockResolvedValue(userId);
  return { db, userId };
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

const byId = (db: FakeDb, table: "chats" | "scheduled_tasks" | "users", id: string) =>
  db.all(table).find((row) => row._id === id);
const defaultProfiles = (db: FakeDb) => db.all("profiles").filter((p) => p.isDefault === true);

describe("deleteProfile", () => {
  it("reassigns the profile's chats and scheduled tasks to the default profile", async () => {
    const { db, userId } = setup();
    const defaultId = seedProfile(db, userId, { isDefault: true, order: 0 });
    const workId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId: workId });
    const chatId = db.seed("chats", { userId, profileId: workId, updatedAt: 1 });
    const keptChatId = db.seed("chats", { userId, profileId: defaultId, updatedAt: 2 });
    const taskId = db.seed("scheduled_tasks", { userId, profileId: workId });

    await asHandler(deleteProfile)(createFakeCtx(db), { profileId: workId });

    expect(byId(db, "chats", chatId)?.profileId).toBe(defaultId);
    expect(byId(db, "chats", keptChatId)?.profileId).toBe(defaultId);
    expect(byId(db, "scheduled_tasks", taskId)?.profileId).toBe(defaultId);
    expect(db.all("profiles").map((p) => p._id)).toEqual([defaultId]);
    expect(byId(db, "users", userId)?.activeProfileId).toBe(defaultId);
  });

  it("creates the default profile to reassign to when the user has none", async () => {
    const { db, userId } = setup();
    const workId = seedProfile(db, userId);
    const chatId = db.seed("chats", { userId, profileId: workId, updatedAt: 1 });

    await asHandler(deleteProfile)(createFakeCtx(db), { profileId: workId });

    const [created] = defaultProfiles(db);
    expect(created).toMatchObject({ userId, preferredModel: "model-a" });
    expect(byId(db, "chats", chatId)?.profileId).toBe(created._id);
    expect(byId(db, "users", userId)?.activeProfileId).toBe(created._id);
  });

  it("keeps the active profile when another profile is deleted", async () => {
    const { db, userId } = setup();
    seedProfile(db, userId, { isDefault: true, order: 0 });
    const homeId = seedProfile(db, userId, { name: "Home" });
    const workId = seedProfile(db, userId);
    await db.patch("users", userId, { activeProfileId: homeId });

    await asHandler(deleteProfile)(createFakeCtx(db), { profileId: workId });

    expect(byId(db, "users", userId)?.activeProfileId).toBe(homeId);
  });
});

describe("ensureDefaultProfile", () => {
  it("creates the default profile from the user's settings and the client's theme", async () => {
    const { db, userId } = setup();

    const profileId = await asHandler(ensureDefaultProfile)(createFakeCtx(db), {
      themeConfig: "{}",
    });

    expect(defaultProfiles(db)).toEqual([
      expect.objectContaining({
        _id: profileId,
        userId,
        isDefault: true,
        preferredModel: "model-a",
        themeConfig: "{}",
      }),
    ]);
    expect(byId(db, "users", userId)?.activeProfileId).toBe(profileId);
  });

  it("returns the existing default profile", async () => {
    const { db, userId } = setup();
    const defaultId = seedProfile(db, userId, { isDefault: true, order: 0 });

    expect(await asHandler(ensureDefaultProfile)(createFakeCtx(db), {})).toBe(defaultId);
    expect(defaultProfiles(db)).toHaveLength(1);
  });
});
