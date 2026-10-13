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
  const chatId = db.seed("chats", { userId, title: "Trip planning", updatedAt: 1 });
  return { db, userId, chatId, ctx: createFakeCtx(db) };
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
  it("returns each match with its chat's title", async () => {
    const { db, userId, chatId, ctx } = setup();
    db.seed("messages", { chatId, userId, role: "user", content: "flights to Lisbon" });

    expect(await asHandler(searchMessages)(ctx, { query: "lisbon" })).toEqual([
      expect.objectContaining({ chatId, content: "flights to Lisbon", chatTitle: "Trip planning" }),
    ]);
  });
});
