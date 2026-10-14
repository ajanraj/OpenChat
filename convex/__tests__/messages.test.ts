import { getAuthUserId } from "@convex-dev/auth/server";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { deleteMessageAndDescendants, patchMessageContent, searchMessages } from "../messages";
import { createFakeCtx, createFakeDb } from "./fake_db.testutil";

const mocks = vi.hoisted(() => ({
  r2DeleteObject: vi.fn<(ctx: unknown, key: string) => Promise<void>>(async () => undefined),
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
}));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    deleteObject = mocks.r2DeleteObject;
  },
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
const asHandler = (fn: unknown) => fn as Handler;

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function setup() {
  const db = createFakeDb();
  const userId = db.seed("users", { name: "User" }) as Id<"users">;
  vi.mocked(getAuthUserId).mockResolvedValue(userId);
  const profileId = seedProfile(db, userId, "Work");
  const chatId = db.seed("chats", { userId, profileId, title: "Trip planning", updatedAt: 1 });
  return { db, userId, profileId, chatId, ctx: createFakeCtx(db) };
}

function seedProfile(db: ReturnType<typeof createFakeDb>, userId: Id<"users">, name: string) {
  return db.seed("profiles", {
    userId,
    name,
    icon: "Briefcase",
    isDefault: name === "Work",
    order: 0,
  }) as Id<"profiles">;
}

describe("deleteMessageAndDescendants", () => {
  it("deletes a chat left empty, with its attachments, and unlinks its branches", async () => {
    const { db, userId, chatId, ctx } = setup();
    const first = db.seed("messages", {
      chatId,
      userId,
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    db.seed("messages", { chatId, userId, role: "assistant", content: "hey", createdAt: 2 });
    db.seed("chat_attachments", { userId, chatId, key: "uploads/a.png" });
    const branch = db.seed("chats", { userId, title: "Branch", originalChatId: chatId });

    expect(await asHandler(deleteMessageAndDescendants)(ctx, { messageId: first })).toEqual({
      chatDeleted: true,
    });

    expect(db.all("messages")).toEqual([]);
    expect(db.all("chat_attachments")).toEqual([]);
    expect(mocks.r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
    const chats = db.all("chats");
    expect(chats.map((c) => c._id)).toEqual([branch]);
    expect(chats[0].originalChatId).toBeUndefined();
  });
});

describe("patchMessageContent", () => {
  it("deletes a removed attachment and re-checks its key after its upload URL expires", async () => {
    const { db, userId, chatId, ctx } = setup();
    vi.stubEnv("R2_PUBLIC_URL_BASE", "https://files.example");
    db.seed("chat_attachments", { userId, chatId, key: "uploads/a.png" });
    const [attachment] = db.all("chat_attachments");
    const messageId = db.seed("messages", {
      chatId,
      userId,
      role: "user",
      content: "see file",
      createdAt: 1,
      parts: [{ type: "file", url: "https://files.example/uploads/a.png" }],
    });
    vi.spyOn(Date, "now").mockReturnValue(attachment._creationTime + 60_000);

    await asHandler(patchMessageContent)(ctx, { messageId, newContent: "no file", newParts: [] });

    expect(db.all("chat_attachments")).toEqual([]);
    expect(mocks.r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
    expect(
      ctx.scheduler.runAt.mock.calls.map(([time, fn, args]) => [
        time,
        getFunctionName(fn as Parameters<typeof getFunctionName>[0]),
        args,
      ]),
    ).toEqual([
      [
        attachment._creationTime + 16 * 60_000,
        "files:enforceAttachmentPolicy",
        { key: "uploads/a.png" },
      ],
    ]);
  });
});

describe("searchMessages", () => {
  it("returns the profile's matches with their chat's title, skipping other profiles and legacy chats", async () => {
    const { db, userId, profileId, chatId, ctx } = setup();
    const homeChatId = db.seed("chats", {
      userId,
      profileId: seedProfile(db, userId, "Home"),
      title: "Home",
    });
    const legacyChatId = db.seed("chats", { userId, title: "Legacy" });
    db.seed("messages", { chatId: homeChatId, userId, role: "user", content: "Lisbon at home" });
    db.seed("messages", { chatId: legacyChatId, userId, role: "user", content: "old Lisbon" });
    db.seed("messages", { chatId, userId, role: "user", content: "flights to Lisbon" });

    expect(await asHandler(searchMessages)(ctx, { query: "lisbon", profileId })).toEqual([
      expect.objectContaining({ chatId, content: "flights to Lisbon", chatTitle: "Trip planning" }),
    ]);
  });

  it("applies the limit after keeping the profile's matches, reading no further hits", async () => {
    const { db, userId, profileId, chatId, ctx } = setup();
    const homeChatId = db.seed("chats", {
      userId,
      profileId: seedProfile(db, userId, "Home"),
      title: "Home",
    });
    db.seed("messages", { chatId: homeChatId, userId, role: "user", content: "Lisbon elsewhere" });
    db.seed("messages", { chatId, userId, role: "user", content: "Lisbon one" });
    db.seed("messages", { chatId, userId, role: "user", content: "Lisbon two" });
    const unread = db.seed("messages", { chatId, userId, role: "user", content: "Lisbon three" });

    const found = await asHandler(searchMessages)(ctx, { query: "lisbon", profileId, limit: 2 });

    expect(found).toEqual([
      expect.objectContaining({ content: "Lisbon one" }),
      expect.objectContaining({ content: "Lisbon two" }),
    ]);
    expect(db.readIds).not.toContain(unread);
  });

  it("reads at most 100 hits, missing a profile's match ranked below them", async () => {
    const { db, userId, profileId, chatId, ctx } = setup();
    const homeChatId = db.seed("chats", {
      userId,
      profileId: seedProfile(db, userId, "Home"),
      title: "Home",
    });
    for (let i = 0; i < 100; i++) {
      db.seed("messages", { chatId: homeChatId, userId, role: "user", content: `Lisbon ${i}` });
    }
    const unread = db.seed("messages", { chatId, userId, role: "user", content: "Lisbon at work" });

    expect(await asHandler(searchMessages)(ctx, { query: "lisbon", profileId })).toEqual([]);
    expect(db.readIds).not.toContain(unread);
  });

  it("stops once the hits read add up to 8 MiB, so large replies can't break the search", async () => {
    const { db, userId, profileId, chatId, ctx } = setup();
    const homeChatId = db.seed("chats", {
      userId,
      profileId: seedProfile(db, userId, "Home"),
      title: "Home",
    });
    const parts = [{ type: "text", text: "x".repeat(900_000) }];
    for (let i = 0; i < 10; i++) {
      db.seed("messages", {
        chatId: homeChatId,
        userId,
        role: "assistant",
        content: "Lisbon",
        parts,
      });
    }
    const unread = db.seed("messages", { chatId, userId, role: "user", content: "Lisbon at work" });

    expect(await asHandler(searchMessages)(ctx, { query: "lisbon", profileId })).toEqual([]);
    expect(db.readIds).not.toContain(unread);
  });

  it("counts the chats it reads toward the 8 MiB", async () => {
    const { db, userId, profileId, chatId, ctx } = setup();
    const homeProfileId = seedProfile(db, userId, "Home");
    for (let i = 0; i < 10; i++) {
      const homeChatId = db.seed("chats", {
        userId,
        profileId: homeProfileId,
        title: "x".repeat(900_000),
      });
      db.seed("messages", { chatId: homeChatId, userId, role: "user", content: "Lisbon" });
    }
    const unread = db.seed("messages", { chatId, userId, role: "user", content: "Lisbon at work" });

    expect(await asHandler(searchMessages)(ctx, { query: "lisbon", profileId })).toEqual([]);
    expect(db.readIds).not.toContain(unread);
  });
});
