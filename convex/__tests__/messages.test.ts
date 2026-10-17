import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import {
  deleteMessageAndDescendants,
  getPublicChatMessages,
  patchMessageContent,
  searchMessages,
} from "../messages";
import { createFakeCtx, createFakeDb } from "./fake_db.testutil";

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

// Scheduled function references are api proxies, which getFunctionName reads
const isFunctionReference = (
  fn: unknown
): fn is FunctionReference<"mutation", "internal"> =>
  typeof fn === "object" && fn !== null;
const functionNameOf = (fn: unknown): string => {
  if (!isFunctionReference(fn)) {
    throw new TypeError("Expected a function reference");
  }
  return getFunctionName(fn);
};

const seedProfile = (
  db: ReturnType<typeof createFakeDb>,
  userId: Id<"users">,
  name: string
) =>
  db.seed("profiles", {
    userId,
    name,
    icon: "Briefcase",
    isDefault: name === "Work",
    order: 0,
  });

const setup = () => {
  const db = createFakeDb();
  const userId = toUserId(db.seed("users", { name: "User" }));
  vi.mocked(getAuthUserId).mockResolvedValue(userId);
  const r2DeleteObject = vi
    .spyOn(R2.prototype, "deleteObject")
    .mockResolvedValue();
  const profileId = seedProfile(db, userId, "Work");
  const chatId = db.seed("chats", {
    userId,
    profileId,
    title: "Trip planning",
    updatedAt: 1,
  });
  return {
    db,
    userId,
    profileId,
    chatId,
    ctx: createFakeCtx(db),
    r2DeleteObject,
  };
};

describe("messages module", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("deleteMessageAndDescendants mutation", () => {
    it("deletes a chat left empty, with its attachments, and unlinks its branches", async () => {
      const { db, userId, chatId, ctx, r2DeleteObject } = setup();
      const first = db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "hi",
        createdAt: 1,
      });
      db.seed("messages", {
        chatId,
        userId,
        role: "assistant",
        content: "hey",
        createdAt: 2,
      });
      db.seed("chat_attachments", { userId, chatId, key: "uploads/a.png" });
      const branch = db.seed("chats", {
        userId,
        title: "Branch",
        originalChatId: chatId,
      });

      await expect(
        asHandler(deleteMessageAndDescendants)(ctx, { messageId: first })
      ).resolves.toStrictEqual({
        chatDeleted: true,
      });

      expect({
        messages: db.all("messages"),
        attachments: db.all("chat_attachments"),
      }).toStrictEqual({ messages: [], attachments: [] });
      expect(r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
      const chats = db.all("chats");
      expect(chats.map((c) => c._id)).toStrictEqual([branch]);
      expect(chats[0].originalChatId).toBeUndefined();
    });

    it("rejects a malformed (never persisted) message id without deleting anything", async () => {
      const { db, chatId, ctx } = setup();
      db.seed("messages", {
        chatId,
        role: "user",
        content: "hi",
        createdAt: 1,
      });

      await expect(
        asHandler(deleteMessageAndDescendants)(ctx, { messageId: "client-1" })
      ).rejects.toThrow(ConvexError);
      expect(db.all("messages")).toHaveLength(1);
    });
  });

  describe("getPublicChatMessages query", () => {
    it("returns a public chat's messages", async () => {
      const { db, chatId, ctx } = setup();
      await db.patch("chats", chatId, { public: true });
      const messageId = db.seed("messages", {
        chatId,
        role: "user",
        content: "hi",
        createdAt: 1,
        metadata: {},
      });

      await expect(
        asHandler(getPublicChatMessages)(ctx, { chatId })
      ).resolves.toStrictEqual([
        { _id: messageId, role: "user", parts: [], metadata: {} },
      ]);
    });

    it("treats a malformed chat id like a missing chat", async () => {
      const { ctx } = setup();

      await expect(
        asHandler(getPublicChatMessages)(ctx, { chatId: "not-an-id" })
      ).resolves.toStrictEqual([]);
    });
  });

  describe("patchMessageContent mutation", () => {
    it("deletes a removed attachment and re-checks its key after its upload URL expires", async () => {
      const { db, userId, chatId, ctx, r2DeleteObject } = setup();
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

      await asHandler(patchMessageContent)(ctx, {
        messageId,
        newContent: "no file",
        newParts: [],
      });

      expect(db.all("chat_attachments")).toStrictEqual([]);
      expect(r2DeleteObject).toHaveBeenCalledWith(ctx, "uploads/a.png");
      expect(
        ctx.scheduler.runAt.mock.calls.map(([time, fn, args]) => [
          time,
          functionNameOf(fn),
          args,
        ])
      ).toStrictEqual([
        [
          attachment._creationTime + 16 * 60_000,
          "files:enforceAttachmentPolicy",
          { key: "uploads/a.png" },
        ],
      ]);
    });
  });

  describe("searchMessages query", () => {
    it("returns the profile's matches with their chat's title, skipping other profiles and legacy chats", async () => {
      const { db, userId, profileId, chatId, ctx } = setup();
      const homeChatId = db.seed("chats", {
        userId,
        profileId: seedProfile(db, userId, "Home"),
        title: "Home",
      });
      const legacyChatId = db.seed("chats", { userId, title: "Legacy" });
      db.seed("messages", {
        chatId: homeChatId,
        userId,
        role: "user",
        content: "Lisbon at home",
      });
      db.seed("messages", {
        chatId: legacyChatId,
        userId,
        role: "user",
        content: "old Lisbon",
      });
      db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "flights to Lisbon",
      });

      await expect(
        asHandler(searchMessages)(ctx, { query: "lisbon", profileId })
      ).resolves.toStrictEqual([
        expect.objectContaining({
          chatId,
          content: "flights to Lisbon",
          chatTitle: "Trip planning",
        }),
      ]);
    });

    it("applies the limit after keeping the profile's matches, reading no further hits", async () => {
      const { db, userId, profileId, chatId, ctx } = setup();
      const homeChatId = db.seed("chats", {
        userId,
        profileId: seedProfile(db, userId, "Home"),
        title: "Home",
      });
      db.seed("messages", {
        chatId: homeChatId,
        userId,
        role: "user",
        content: "Lisbon elsewhere",
      });
      db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon one",
      });
      db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon two",
      });
      const unread = db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon three",
      });

      const found = await asHandler(searchMessages)(ctx, {
        query: "lisbon",
        profileId,
        limit: 2,
      });

      expect(found).toStrictEqual([
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
      for (let i = 0; i < 100; i += 1) {
        db.seed("messages", {
          chatId: homeChatId,
          userId,
          role: "user",
          content: `Lisbon ${i}`,
        });
      }
      const unread = db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon at work",
      });

      await expect(
        asHandler(searchMessages)(ctx, { query: "lisbon", profileId })
      ).resolves.toStrictEqual([]);
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
      for (let i = 0; i < 10; i += 1) {
        db.seed("messages", {
          chatId: homeChatId,
          userId,
          role: "assistant",
          content: "Lisbon",
          parts,
        });
      }
      const unread = db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon at work",
      });

      await expect(
        asHandler(searchMessages)(ctx, { query: "lisbon", profileId })
      ).resolves.toStrictEqual([]);
      expect(db.readIds).not.toContain(unread);
    });

    it("counts the chats it reads toward the 8 MiB", async () => {
      const { db, userId, profileId, chatId, ctx } = setup();
      const homeProfileId = seedProfile(db, userId, "Home");
      for (let i = 0; i < 10; i += 1) {
        const homeChatId = db.seed("chats", {
          userId,
          profileId: homeProfileId,
          title: "x".repeat(900_000),
        });
        db.seed("messages", {
          chatId: homeChatId,
          userId,
          role: "user",
          content: "Lisbon",
        });
      }
      const unread = db.seed("messages", {
        chatId,
        userId,
        role: "user",
        content: "Lisbon at work",
      });

      await expect(
        asHandler(searchMessages)(ctx, { query: "lisbon", profileId })
      ).resolves.toStrictEqual([]);
      expect(db.readIds).not.toContain(unread);
    });
  });
});
