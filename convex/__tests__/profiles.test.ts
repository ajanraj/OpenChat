import { getAuthUserId } from "@convex-dev/auth/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import { deleteProfile, ensureDefaultProfile } from "../profiles";
import { createFakeCtx, createFakeDb } from "./fake_db.testutil";
import type { FakeDb } from "./fake_db.testutil";

// Keep the real authTables, which the schema (and so the fake db) needs
vi.mock(import("@convex-dev/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

type Handler = (
  ctx: unknown,
  args: Record<string, unknown>
) => Promise<unknown>;
const isHandler = (fn: unknown): fn is Handler => typeof fn === "function";
// Convex keeps each registered function's handler on `_handler`; tests call it directly
const asHandler = (fn: object): Handler => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return handler;
};

// Fake db ids are `${table}:n` strings
const isUserId = (id: string): id is Id<"users"> => id.startsWith("users:");
const toUserId = (id: string): Id<"users"> => {
  if (!isUserId(id)) {
    throw new TypeError(`Not a users id: ${id}`);
  }
  return id;
};

const setup = () => {
  const db = createFakeDb();
  const userId = toUserId(
    db.seed("users", {
      name: "User",
      preferredModel: "model-a",
    })
  );
  vi.mocked(getAuthUserId).mockResolvedValue(userId);
  return { db, userId };
};

const seedProfile = (
  db: FakeDb,
  userId: Id<"users">,
  fields: Record<string, unknown> = {}
) =>
  db.seed("profiles", {
    userId,
    name: "Work",
    icon: "Briefcase",
    isDefault: false,
    order: 1,
    ...fields,
  });

const byId = (
  db: FakeDb,
  table: "chats" | "scheduled_tasks" | "users",
  id: string
) => db.all(table).find((row) => row._id === id);
const defaultProfiles = (db: FakeDb) =>
  db.all("profiles").filter((p) => p.isDefault === true);

describe("profiles module", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteProfile mutation", () => {
    it("reassigns the profile's chats and scheduled tasks to the default profile", async () => {
      const { db, userId } = setup();
      const defaultId = seedProfile(db, userId, { isDefault: true, order: 0 });
      const workId = seedProfile(db, userId);
      await db.patch("users", userId, { activeProfileId: workId });
      const chatId = db.seed("chats", {
        userId,
        profileId: workId,
        updatedAt: 1,
      });
      const keptChatId = db.seed("chats", {
        userId,
        profileId: defaultId,
        updatedAt: 2,
      });
      const taskId = db.seed("scheduled_tasks", { userId, profileId: workId });

      await asHandler(deleteProfile)(createFakeCtx(db), { profileId: workId });

      expect(byId(db, "chats", chatId)?.profileId).toBe(defaultId);
      expect(byId(db, "chats", keptChatId)?.profileId).toBe(defaultId);
      expect(byId(db, "scheduled_tasks", taskId)?.profileId).toBe(defaultId);
      expect(db.all("profiles").map((p) => p._id)).toStrictEqual([defaultId]);
      expect(byId(db, "users", userId)?.activeProfileId).toBe(defaultId);
    });

    it("creates the default profile to reassign to when the user has none", async () => {
      const { db, userId } = setup();
      const workId = seedProfile(db, userId);
      const chatId = db.seed("chats", {
        userId,
        profileId: workId,
        updatedAt: 1,
      });

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

  describe("ensureDefaultProfile mutation", () => {
    it("creates the default profile from the user's settings and the client's theme", async () => {
      const { db, userId } = setup();

      const profileId = await asHandler(ensureDefaultProfile)(
        createFakeCtx(db),
        {
          themeConfig: "{}",
        }
      );

      expect(defaultProfiles(db)).toStrictEqual([
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

      await expect(
        asHandler(ensureDefaultProfile)(createFakeCtx(db), {})
      ).resolves.toBe(defaultId);
      expect(defaultProfiles(db)).toHaveLength(1);
    });
  });
});
