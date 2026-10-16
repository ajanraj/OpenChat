import type { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { UPLOAD_MAX_BYTES } from "../../src/lib/config/upload";
import type { Id } from "../_generated/dataModel";
import {
  cleanupPendingUploads,
  deleteAttachments,
  enforceAttachmentPolicy,
  generateUploadUrl,
  getAttachmentsForUser,
  internalSave,
  recheckAttachment,
  saveFileAttachment,
} from "../files";
import { rateLimiter } from "../rateLimiter";

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

// Keep the real authTables, which the schema needs
vi.mock(import("@convex-dev/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuthUserId: mocks.getAuthUserId,
}));

// The R2 calls files.ts makes, answered without a bucket
const r2 = {
  generateUploadUrl: vi
    .spyOn(R2.prototype, "generateUploadUrl")
    .mockResolvedValue({
      key: "new-key",
      url: "https://r2.example/new-key?signed",
    }),
  getMetadata: vi.spyOn(R2.prototype, "getMetadata"),
  deleteObject: vi.spyOn(R2.prototype, "deleteObject").mockResolvedValue(),
  syncMetadata: vi.spyOn(R2.prototype, "syncMetadata").mockResolvedValue(),
};
const rateLimit = vi
  .spyOn(rateLimiter, "limit")
  .mockResolvedValue({ ok: true, retryAfter: undefined });

/** R2 metadata for the object at "k1" with the given type and size. */
const r2Object = (meta: { contentType: string; size: number }) => ({
  bucket: "uploads",
  bucketLink: "https://r2.example/uploads",
  key: "k1",
  lastModified: "2023-11-14T22:13:20.000Z",
  link: "https://r2.example/uploads/k1",
  url: "https://r2.example/k1",
  ...meta,
});

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Handler = (
  ctx: unknown,
  args: Record<string, unknown>
) => Promise<unknown>;
const handlerSchema = z.custom<Handler>((value) => typeof value === "function");
// Convex keeps each registered function's handler on `_handler`; tests call it with fake ctxs
const run = (fn: object): Handler =>
  handlerSchema.parse("_handler" in fn ? fn._handler : undefined);

type FunctionRef = Parameters<typeof getFunctionName>[0];
// Function references are api proxies; the fakes record them by name, e.g. "files:internalSave"
const byName =
  <Rest extends unknown[], Result>(
    record: (name: string, ...rest: Rest) => Result
  ) =>
  (ref: FunctionRef, ...rest: Rest) =>
    record(getFunctionName(ref), ...rest);
const scheduledByName =
  (record: (time: number, name: string, args: object) => Promise<void>) =>
  async (time: number, ref: FunctionRef, args: object) => {
    await record(time, getFunctionName(ref), args);
  };

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
// Rows created at NOW are re-checked a minute after their 15-minute upload URL expires
const RECHECK_AT = NOW + 16 * 60 * 1000;
// Convex ids are branded strings, so the parse only checks for a string
const USER = z
  .custom<Id<"users">>((value) => typeof value === "string")
  .parse("users:1");
const CHAT = "chats:1";

/** In-memory ctx.db covering the index lookups files.ts uses (table encoded in the id prefix). */
const fakeDb = (seed: Row[]) => {
  const rows = new Map(seed.map((row) => [row._id, { ...row }]));
  const inTable = (table: string) =>
    [...rows.values()].filter((r) => r._id.startsWith(`${table}:`));
  return {
    rows,
    // The fake's methods answer synchronously; files.ts awaits them all the same
    get: vi.fn<(table: string, id: string) => Row | null>(
      (_table, id) => rows.get(id) ?? null
    ),
    query: (table: string) => ({
      withIndex: (_index: string, build: (q: object) => void) => {
        const conditions: ((row: Row) => boolean)[] = [];
        const range = {
          eq: (field: string, value: unknown) => {
            conditions.push((row) => row[field] === value);
            return range;
          },
          lt: (field: string, value: number) => {
            conditions.push((row) => {
              const fieldValue = row[field];
              return typeof fieldValue === "number" && fieldValue < value;
            });
            return range;
          },
        };
        build(range);
        const matches = () =>
          inTable(table).filter((row) => conditions.every((c) => c(row)));
        // Supports the one filter the code uses: q.neq(q.field(name), value)
        const filterBuilder = {
          field: (name: string) => name,
          neq: (name: string, value: unknown) => (row: Row) =>
            row[name] !== value,
        };
        const result = {
          order: () => result,
          filter: (
            buildFilter: (q: typeof filterBuilder) => (row: Row) => boolean
          ) => {
            conditions.push(buildFilter(filterBuilder));
            return result;
          },
          first: () => matches()[0] ?? null,
          take: (n: number) => matches().slice(0, n),
          paginate: () => ({
            page: matches(),
            isDone: false,
            continueCursor: "next",
          }),
        };
        return result;
      },
    }),
    insert: (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${rows.size + 1}`;
      rows.set(_id, { ...doc, _id, _creationTime: NOW });
      return _id;
    },
    patch: (_table: string, id: string, fields: Record<string, unknown>) => {
      Object.assign(rows.get(id) ?? {}, fields);
    },
    delete: (_table: string, id: string) => {
      rows.delete(id);
    },
  };
};

const fakeCtx = (seed: Row[]) => {
  const db = fakeDb([
    { _id: USER, _creationTime: 0, isAnonymous: false },
    { _id: CHAT, _creationTime: 0, userId: USER, model: "gpt-4o" },
    ...seed,
  ]);
  const runAfter = vi
    .fn<(delay: number, name: string, args: object) => Promise<void>>()
    .mockResolvedValue();
  const runAt = vi
    .fn<(timestamp: number, name: string, args: object) => Promise<void>>()
    .mockResolvedValue();
  return {
    db,
    scheduler: {
      runAfter: scheduledByName(runAfter),
      runAt: scheduledByName(runAt),
    },
    // What the scheduler was asked to run, by function name
    scheduled: { runAfter, runAt },
  };
};

const pending = (key: string, extra: Partial<Row> = {}): Row => ({
  _id: `chat_attachments:${key}`,
  _creationTime: NOW,
  userId: USER,
  key,
  ...extra,
});

// Seeds the chat with a model that cannot take file uploads, plus a pending upload "k1"
const seedNonFileModelChat = () => [
  pending("k1"),
  { _id: CHAT, _creationTime: 0, userId: USER, model: "not-a-file-model" },
];

// An attachment "k1" saved to the chat
const savedAttachmentRow = (extra: Partial<Row> = {}) =>
  pending("k1", {
    chatId: CHAT,
    fileType: "image/png",
    fileSize: 2048,
    ...extra,
  });

// recheckAttachment ctx whose next metadata sync fails; rowExists answers hasAttachmentWithKey
const failingSync = (rowExists = true) => {
  r2.syncMetadata.mockRejectedValueOnce(new Error("R2 unavailable"));
  const runMutation = vi
    .fn<(name: string, args: unknown) => Promise<null>>()
    .mockResolvedValue(null);
  const runQuery = vi
    .fn<(name: string, args: unknown) => Promise<boolean>>()
    .mockResolvedValue(rowExists);
  const runAfter = vi
    .fn<(delay: number, name: string, args: object) => Promise<void>>()
    .mockResolvedValue();
  const ctx = {
    runMutation: byName(runMutation),
    runQuery: byName(runQuery),
    scheduler: { runAfter: scheduledByName(runAfter) },
  };
  return { ctx, runMutation, runQuery, runAfter };
};

const expectConvexError = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await expect(promise).rejects.toMatchObject({ data: code });
};

describe("convex/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    mocks.getAuthUserId.mockResolvedValue(USER);
    process.env.R2_PUBLIC_URL_BASE = "https://files.example/";
  });

  describe("generateUploadUrl mutation", () => {
    it("rate-limits, records a pending row, and returns the presigned URL", async () => {
      const ctx = fakeCtx([]);
      const result = await run(generateUploadUrl)(ctx, {
        contentType: "image/png",
        size: 1024,
      });

      expect(result).toStrictEqual({
        key: "new-key",
        url: "https://r2.example/new-key?signed",
      });
      expect(rateLimit).toHaveBeenCalledWith(ctx, "fileUpload", {
        key: USER,
        throws: true,
      });
      const inserted = [...ctx.db.rows.values()].find(
        (r) => r.key === "new-key"
      );
      expect(inserted).toMatchObject({ userId: USER });
      expect(inserted?.chatId).toBeUndefined();
    });

    it("skips the upload rate limit for server routes holding the secret", async () => {
      vi.stubEnv("SERVER_ROUTE_SECRET", "route-secret");
      const ctx = fakeCtx([]);
      const result = await run(generateUploadUrl)(ctx, {
        contentType: "image/png",
        size: 1024,
        serverSecret: "route-secret",
      });

      expect(result).toStrictEqual({
        key: "new-key",
        url: "https://r2.example/new-key?signed",
      });
      expect(rateLimit).not.toHaveBeenCalled();
    });

    it("rejects a wrong server secret without issuing a URL", async () => {
      vi.stubEnv("SERVER_ROUTE_SECRET", "route-secret");
      const ctx = fakeCtx([]);
      await expectConvexError(
        run(generateUploadUrl)(ctx, {
          contentType: "image/png",
          size: 1024,
          serverSecret: "guess",
        }),
        "UNAUTHORIZED"
      );
      expect(r2.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects anonymous users before issuing anything", async () => {
      const ctx = fakeCtx([{ _id: USER, _creationTime: 0, isAnonymous: true }]);
      await expectConvexError(
        run(generateUploadUrl)(ctx, { contentType: "image/png", size: 1024 }),
        "NOT_AUTHENTICATED"
      );
      expect(r2.generateUploadUrl).not.toHaveBeenCalled();
    });

    it.each([
      ["text/html", 10, "UNSUPPORTED_FILE_TYPE"],
      ["image/png", UPLOAD_MAX_BYTES + 1, "FILE_TOO_LARGE"],
    ])(
      "rejects declared %s of %d bytes without consuming quota",
      async (contentType, size, code) => {
        const ctx = fakeCtx([]);
        await expectConvexError(
          run(generateUploadUrl)(ctx, { contentType, size }),
          code
        );
        expect(rateLimit).not.toHaveBeenCalled();
        expect(r2.generateUploadUrl).not.toHaveBeenCalled();
      }
    );
  });

  describe("internalSave internal mutation", () => {
    const args = {
      chatId: CHAT,
      key: "k1",
      fileName: "photo.png",
      isGenerated: false,
    };

    it("re-checks the object once its upload URL has expired", async () => {
      const ctx = fakeCtx([pending("k1")]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 2048,
        })
      );

      await run(internalSave)(ctx, args);

      expect(ctx.scheduled.runAt).toHaveBeenCalledWith(
        RECHECK_AT,
        "files:recheckAttachment",
        {
          key: "k1",
        }
      );
    });

    it("skips the re-check when the upload URL had already expired", async () => {
      const ctx = fakeCtx([
        pending("k1", { _creationTime: NOW - 20 * 60 * 1000 }),
      ]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 2048,
        })
      );

      await run(internalSave)(ctx, args);

      expect(ctx.scheduled.runAt).not.toHaveBeenCalled();
    });

    it("attaches the upload using the real R2 metadata and a URL built from the key", async () => {
      const ctx = fakeCtx([pending("k1")]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 2048,
        })
      );

      const result = await run(internalSave)(ctx, args);

      expect(result).toMatchObject({
        status: "saved",
        attachment: {
          chatId: CHAT,
          fileName: "photo.png",
          fileType: "image/png",
          fileSize: 2048,
          url: "https://files.example/k1",
        },
      });
      expect(ctx.db.rows.get("chat_attachments:k1")).toMatchObject({
        chatId: CHAT,
        fileSize: 2048,
      });
    });

    it("deletes an object whose real size breaks the limit and reports it without throwing", async () => {
      const ctx = fakeCtx([pending("k1")]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: UPLOAD_MAX_BYTES + 1,
        })
      );

      const result = await run(internalSave)(ctx, args);

      expect(result).toStrictEqual({
        status: "rejected",
        error: "FILE_TOO_LARGE",
      });
      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "k1");
      expect(ctx.db.rows.has("chat_attachments:k1")).toBeFalsy();
      // The live upload URL could re-create the object, so its key is checked again after expiry
      expect(ctx.scheduled.runAt).toHaveBeenCalledWith(
        RECHECK_AT,
        "files:enforceAttachmentPolicy",
        {
          key: "k1",
        }
      );
    });

    it("rejects generated files that are not images", async () => {
      const ctx = fakeCtx([pending("k1")]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "application/pdf",
          size: 10,
        })
      );

      const result = await run(internalSave)(ctx, {
        ...args,
        isGenerated: true,
      });

      expect(result).toStrictEqual({
        status: "rejected",
        error: "UNSUPPORTED_FILE_TYPE",
      });
    });

    it("refuses keys owned by another user and leaves their object alone", async () => {
      const ctx = fakeCtx([pending("k1", { userId: "users:2" })]);
      await expectConvexError(run(internalSave)(ctx, args), "UNAUTHORIZED");
      expect(r2.deleteObject).not.toHaveBeenCalled();
    });

    it("never creates a row for an unknown key", async () => {
      const ctx = fakeCtx([]);
      await expectConvexError(run(internalSave)(ctx, args), "UNAUTHORIZED");
      expect(
        [...ctx.db.rows.keys()].some((id) => id.startsWith("chat_attachments:"))
      ).toBeFalsy();
    });

    it("requires a file-capable model for user uploads but not for generated images", async () => {
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 10,
        })
      );

      await expectConvexError(
        run(internalSave)(fakeCtx(seedNonFileModelChat()), args),
        "UNSUPPORTED_MODEL"
      );
      await expect(
        run(internalSave)(fakeCtx(seedNonFileModelChat()), {
          ...args,
          isGenerated: true,
        })
      ).resolves.toMatchObject({
        status: "saved",
        attachment: { isGenerated: true },
      });
    });
  });

  describe("saveFileAttachment action", () => {
    it("authorizes before syncing R2 metadata and throws the rejection code", async () => {
      const runQuery = vi
        .fn<(name: string, args: unknown) => Promise<null>>()
        .mockResolvedValue(null);
      const runMutation = vi
        .fn<(name: string, args: unknown) => Promise<object>>()
        .mockResolvedValue({
          status: "rejected",
          error: "UNSUPPORTED_FILE_TYPE",
        });
      const ctx = {
        runQuery: byName(runQuery),
        runMutation: byName(runMutation),
      };

      await expectConvexError(
        run(saveFileAttachment)(ctx, {
          chatId: CHAT,
          key: "k1",
          fileName: "a.png",
        }),
        "UNSUPPORTED_FILE_TYPE"
      );
      expect(runQuery.mock.invocationCallOrder[0]).toBeLessThan(
        r2.syncMetadata.mock.invocationCallOrder[0]
      );
      expect(runMutation).toHaveBeenCalledWith("files:internalSave", {
        chatId: CHAT,
        key: "k1",
        fileName: "a.png",
        isGenerated: false,
      });
    });
  });

  describe("getAttachmentsForUser query", () => {
    it("omits pending uploads and keeps the pagination cursor", async () => {
      const ctx = fakeCtx([
        pending("pending"),
        pending("done", { chatId: CHAT }),
      ]);
      const result = await run(getAttachmentsForUser)(ctx, {
        paginationOpts: { numItems: 50, cursor: null },
      });
      expect(result).toMatchObject({
        isDone: false,
        continueCursor: "next",
        page: [{ key: "done" }],
      });
    });
  });

  describe("deleteAttachments mutation", () => {
    it("deletes only the caller's attachments, looked up by id", async () => {
      const ctx = fakeCtx([
        pending("mine", { chatId: CHAT }),
        pending("theirs", { chatId: CHAT, userId: "users:2" }),
      ]);

      await run(deleteAttachments)(ctx, {
        attachmentIds: [
          "chat_attachments:mine",
          "chat_attachments:theirs",
          "chat_attachments:gone",
        ],
      });

      expect(r2.deleteObject).toHaveBeenCalledExactlyOnceWith(ctx, "mine");
      expect(ctx.db.rows.has("chat_attachments:mine")).toBeFalsy();
      expect(ctx.db.rows.has("chat_attachments:theirs")).toBeTruthy();
    });

    it("deletes an object re-created through a deleted row's live upload URL once it expires", async () => {
      const ctx = fakeCtx([pending("mine", { chatId: CHAT })]);

      await run(deleteAttachments)(ctx, {
        attachmentIds: ["chat_attachments:mine"],
      });

      expect(ctx.scheduled.runAt.mock.calls).toStrictEqual([
        [RECHECK_AT, "files:enforceAttachmentPolicy", { key: "mine" }],
      ]);
      r2.deleteObject.mockClear();
      // The scheduled check, after the client PUT the key again
      await run(enforceAttachmentPolicy)(ctx, { key: "mine" });
      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "mine");
    });

    it("schedules no check for rows older than the upload URL lifetime", async () => {
      const ctx = fakeCtx([
        pending("old", { chatId: CHAT, _creationTime: NOW - 20 * 60 * 1000 }),
      ]);

      await run(deleteAttachments)(ctx, {
        attachmentIds: ["chat_attachments:old"],
      });

      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "old");
      expect(ctx.scheduled.runAt).not.toHaveBeenCalled();
    });

    it("rejects batches above the cap", async () => {
      const attachmentIds = Array.from(
        { length: 101 },
        (_, i) => `chat_attachments:${i}`
      );
      await expectConvexError(
        run(deleteAttachments)(fakeCtx([]), { attachmentIds }),
        "INVALID_INPUT"
      );
      expect(r2.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe("cleanupPendingUploads internal mutation", () => {
    it("deletes only pending rows past the TTL, with their objects", async () => {
      const ctx = fakeCtx([
        pending("expired", { _creationTime: NOW - HOUR - 1 }),
        pending("fresh", { _creationTime: NOW - HOUR + 1000 }),
        pending("attached", { _creationTime: NOW - 2 * HOUR, chatId: CHAT }),
      ]);

      await run(cleanupPendingUploads)(ctx, {});

      expect(r2.deleteObject).toHaveBeenCalledExactlyOnceWith(ctx, "expired");
      expect(ctx.db.rows.has("chat_attachments:fresh")).toBeTruthy();
      expect(ctx.db.rows.has("chat_attachments:attached")).toBeTruthy();
      expect(ctx.scheduled.runAfter).not.toHaveBeenCalled();
    });

    it("schedules a continuation when a full batch was deleted", async () => {
      const expired = Array.from({ length: 50 }, (_, i) =>
        pending(`old-${i}`, { _creationTime: NOW - 2 * HOUR })
      );
      const ctx = fakeCtx(expired);

      await run(cleanupPendingUploads)(ctx, {});

      expect(ctx.scheduled.runAfter).toHaveBeenCalledWith(
        0,
        "files:cleanupPendingUploads",
        {}
      );
    });
  });

  describe("enforceAttachmentPolicy internal mutation", () => {
    const args = { key: "k1" };

    it("deletes an attachment whose object was replaced with a disallowed file", async () => {
      const ctx = fakeCtx([savedAttachmentRow()]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "text/html",
          size: 100,
        })
      );

      await run(enforceAttachmentPolicy)(ctx, args);

      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "k1");
      expect(ctx.db.rows.has("chat_attachments:k1")).toBeFalsy();
    });

    it("keeps an attachment whose object still passes the policy", async () => {
      const ctx = fakeCtx([savedAttachmentRow()]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 2048,
        })
      );

      await run(enforceAttachmentPolicy)(ctx, args);

      expect(r2.deleteObject).not.toHaveBeenCalled();
      expect(ctx.db.rows.has("chat_attachments:k1")).toBeTruthy();
    });

    it("holds generated images to image types", async () => {
      const ctx = fakeCtx([savedAttachmentRow({ isGenerated: true })]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "application/pdf",
          size: 2048,
        })
      );

      await run(enforceAttachmentPolicy)(ctx, args);

      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "k1");
    });

    it("deletes the object at a key no row references, whatever its metadata", async () => {
      const ctx = fakeCtx([]);
      r2.getMetadata.mockResolvedValue(
        r2Object({
          contentType: "image/png",
          size: 2048,
        })
      );

      await run(enforceAttachmentPolicy)(ctx, args);

      expect(r2.deleteObject).toHaveBeenCalledWith(ctx, "k1");
    });
  });

  describe("recheckAttachment internal action", () => {
    const args = { key: "k1" };

    it("re-syncs the object's metadata, then enforces the policy", async () => {
      const runMutation = vi
        .fn<(name: string, args: unknown) => Promise<null>>()
        .mockResolvedValue(null);
      const ctx = { runMutation: byName(runMutation) };

      await run(recheckAttachment)(ctx, args);

      expect(r2.syncMetadata).toHaveBeenCalledWith(ctx, "k1");
      expect(runMutation).toHaveBeenCalledWith(
        "files:enforceAttachmentPolicy",
        args
      );
    });

    it("stops quietly when the row was deleted meanwhile, taking its object with it", async () => {
      const consoleError = vi.spyOn(console, "error").mockReturnValue();
      const { ctx, runMutation, runQuery, runAfter } = failingSync(false);

      await run(recheckAttachment)(ctx, args);

      expect(runQuery).toHaveBeenCalledWith("files:hasAttachmentWithKey", {
        key: "k1",
      });
      expect(runAfter).not.toHaveBeenCalled();
      expect(runMutation).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("retries a failed metadata sync later instead of enforcing stale metadata", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockReturnValue();
      const { ctx, runMutation, runAfter } = failingSync();

      await run(recheckAttachment)(ctx, args);

      expect(runMutation).not.toHaveBeenCalled();
      expect(runAfter).toHaveBeenCalledWith(60_000, "files:recheckAttachment", {
        key: "k1",
        attempt: 1,
      });
      consoleWarn.mockRestore();
    });

    it("gives up after the last retry and leaves the attachment as saved", async () => {
      const consoleError = vi.spyOn(console, "error").mockReturnValue();
      const { ctx, runMutation, runAfter } = failingSync();

      await run(recheckAttachment)(ctx, { key: "k1", attempt: 3 });

      expect(runMutation).not.toHaveBeenCalled();
      expect(runAfter).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "R2 metadata re-check failed; giving up",
        expect.anything()
      );
      consoleError.mockRestore();
    });
  });
});
