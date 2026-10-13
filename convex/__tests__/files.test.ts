import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_MAX_BYTES } from "../../src/lib/config/upload";
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

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn<() => Promise<string | null>>(),
  generateUploadUrl: vi.fn<() => Promise<{ key: string; url: string }>>(async () => ({
    key: "new-key",
    url: "https://r2.example/new-key?signed",
  })),
  getMetadata: vi.fn<() => Promise<{ contentType?: string; size?: number } | null>>(),
  deleteObject: vi.fn<(ctx: unknown, key: string) => Promise<void>>(async () => undefined),
  syncMetadata: vi.fn<(ctx: unknown, key: string) => Promise<void>>(async () => undefined),
  rateLimit: vi.fn<(ctx: unknown, name: string, opts: { key: string }) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: mocks.getAuthUserId }));

vi.mock("@convex-dev/r2", () => ({
  R2: class {
    generateUploadUrl = mocks.generateUploadUrl;
    getMetadata = mocks.getMetadata;
    deleteObject = mocks.deleteObject;
    syncMetadata = mocks.syncMetadata;
  },
}));

vi.mock("../rateLimiter", () => ({ rateLimiter: { limit: mocks.rateLimit } }));

vi.mock("../schema", async () => {
  const { v } = await import("convex/values");
  return { default: { doc: () => v.object({}) } };
});

vi.mock("../_generated/api", () => ({
  components: { r2: {} },
  internal: {
    files: {
      checkAttachable: "files:checkAttachable",
      internalSave: "files:internalSave",
      cleanupPendingUploads: "files:cleanupPendingUploads",
      recheckAttachment: "files:recheckAttachment",
      enforceAttachmentPolicy: "files:enforceAttachmentPolicy",
    },
  },
}));

vi.mock("../_generated/server", () => {
  const handlerOf = (def: { handler: unknown }) => def.handler;
  return {
    action: handlerOf,
    internalAction: handlerOf,
    internalMutation: handlerOf,
    internalQuery: handlerOf,
    mutation: handlerOf,
    query: handlerOf,
  };
});

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
const run = (fn: unknown) => fn as Handler;

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
// Rows created at NOW are re-checked a minute after their 15-minute upload URL expires
const RECHECK_AT = NOW + 16 * 60 * 1000;
const USER = "users:1";
const CHAT = "chats:1";

/** In-memory ctx.db covering the index lookups files.ts uses (table encoded in the id prefix). */
function fakeDb(seed: Row[]) {
  const rows = new Map(seed.map((row) => [row._id, { ...row }]));
  const inTable = (table: string) =>
    [...rows.values()].filter((r) => r._id.startsWith(`${table}:`));
  return {
    rows,
    get: vi.fn<(table: string, id: string) => Promise<Row | null>>(
      async (_table, id) => rows.get(id) ?? null,
    ),
    query: (table: string) => ({
      withIndex: (_index: string, build: (q: object) => void) => {
        const conditions: Array<(row: Row) => boolean> = [];
        const range = {
          eq: (field: string, value: unknown) => {
            conditions.push((row) => row[field] === value);
            return range;
          },
          lt: (field: string, value: number) => {
            conditions.push((row) => (row[field] as number) < value);
            return range;
          },
        };
        build(range);
        const matches = () => inTable(table).filter((row) => conditions.every((c) => c(row)));
        // Supports the one filter the code uses: q.neq(q.field(name), value)
        const filterBuilder = {
          field: (name: string) => name,
          neq: (name: string, value: unknown) => (row: Row) => row[name] !== value,
        };
        const result = {
          order: () => result,
          filter: (build: (q: typeof filterBuilder) => (row: Row) => boolean) => {
            conditions.push(build(filterBuilder));
            return result;
          },
          first: async () => matches()[0] ?? null,
          take: async (n: number) => matches().slice(0, n),
          paginate: async () => ({ page: matches(), isDone: false, continueCursor: "next" }),
        };
        return result;
      },
    }),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${rows.size + 1}`;
      rows.set(_id, { ...doc, _id, _creationTime: NOW });
      return _id;
    },
    patch: async (_table: string, id: string, fields: Record<string, unknown>) => {
      Object.assign(rows.get(id) ?? {}, fields);
    },
    delete: async (_table: string, id: string) => {
      rows.delete(id);
    },
  };
}

function fakeCtx(seed: Row[]) {
  const db = fakeDb([
    { _id: USER, _creationTime: 0, isAnonymous: false },
    { _id: CHAT, _creationTime: 0, userId: USER, model: "gpt-4o" },
    ...seed,
  ]);
  const runAfter = vi.fn<(delay: number, ref: string, args: object) => Promise<void>>(
    async () => undefined,
  );
  const runAt = vi.fn<(timestamp: number, ref: string, args: object) => Promise<void>>(
    async () => undefined,
  );
  return { db, scheduler: { runAfter, runAt } };
}

const pending = (key: string, extra: Partial<Row> = {}): Row => ({
  _id: `chat_attachments:${key}`,
  _creationTime: NOW,
  userId: USER,
  key,
  ...extra,
});

async function expectConvexError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<string>).data).toBe(code);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.getAuthUserId.mockResolvedValue(USER);
  process.env.R2_PUBLIC_URL_BASE = "https://files.example/";
});

describe("generateUploadUrl", () => {
  it("rate-limits, records a pending row, and returns the presigned URL", async () => {
    const ctx = fakeCtx([]);
    const result = await run(generateUploadUrl)(ctx, { contentType: "image/png", size: 1024 });

    expect(result).toEqual({ key: "new-key", url: "https://r2.example/new-key?signed" });
    expect(mocks.rateLimit).toHaveBeenCalledWith(ctx, "fileUpload", { key: USER, throws: true });
    const inserted = [...ctx.db.rows.values()].find((r) => r.key === "new-key");
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

    expect(result).toEqual({ key: "new-key", url: "https://r2.example/new-key?signed" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("rejects a wrong server secret without issuing a URL", async () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "route-secret");
    const ctx = fakeCtx([]);
    await expectConvexError(
      run(generateUploadUrl)(ctx, { contentType: "image/png", size: 1024, serverSecret: "guess" }),
      "UNAUTHORIZED",
    );
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects anonymous users before issuing anything", async () => {
    const ctx = fakeCtx([{ _id: USER, _creationTime: 0, isAnonymous: true }]);
    await expectConvexError(
      run(generateUploadUrl)(ctx, { contentType: "image/png", size: 1024 }),
      "NOT_AUTHENTICATED",
    );
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["text/html", 10, "UNSUPPORTED_FILE_TYPE"],
    ["image/png", UPLOAD_MAX_BYTES + 1, "FILE_TOO_LARGE"],
  ])("rejects declared %s of %d bytes without consuming quota", async (contentType, size, code) => {
    const ctx = fakeCtx([]);
    await expectConvexError(run(generateUploadUrl)(ctx, { contentType, size }), code);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
  });
});

describe("internalSave", () => {
  const args = { chatId: CHAT, key: "k1", fileName: "photo.png", isGenerated: false };

  it("re-checks the object once its upload URL has expired", async () => {
    const ctx = fakeCtx([pending("k1")]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 2048 });

    await run(internalSave)(ctx, args);

    expect(ctx.scheduler.runAt).toHaveBeenCalledWith(RECHECK_AT, "files:recheckAttachment", {
      key: "k1",
    });
  });

  it("skips the re-check when the upload URL had already expired", async () => {
    const ctx = fakeCtx([pending("k1", { _creationTime: NOW - 20 * 60 * 1000 })]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 2048 });

    await run(internalSave)(ctx, args);

    expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
  });

  it("attaches the upload using the real R2 metadata and a URL built from the key", async () => {
    const ctx = fakeCtx([pending("k1")]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 2048 });

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
    expect(ctx.db.rows.get("chat_attachments:k1")).toMatchObject({ chatId: CHAT, fileSize: 2048 });
  });

  it("deletes an object whose real size breaks the limit and reports it without throwing", async () => {
    const ctx = fakeCtx([pending("k1")]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: UPLOAD_MAX_BYTES + 1 });

    const result = await run(internalSave)(ctx, args);

    expect(result).toEqual({ status: "rejected", error: "FILE_TOO_LARGE" });
    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "k1");
    expect(ctx.db.rows.has("chat_attachments:k1")).toBe(false);
    // The live upload URL could re-create the object, so its key is checked again after expiry
    expect(ctx.scheduler.runAt).toHaveBeenCalledWith(RECHECK_AT, "files:enforceAttachmentPolicy", {
      key: "k1",
    });
  });

  it("rejects generated files that are not images", async () => {
    const ctx = fakeCtx([pending("k1")]);
    mocks.getMetadata.mockResolvedValue({ contentType: "application/pdf", size: 10 });

    const result = await run(internalSave)(ctx, { ...args, isGenerated: true });

    expect(result).toEqual({ status: "rejected", error: "UNSUPPORTED_FILE_TYPE" });
  });

  it("refuses keys owned by another user and leaves their object alone", async () => {
    const ctx = fakeCtx([pending("k1", { userId: "users:2" })]);
    await expectConvexError(run(internalSave)(ctx, args), "UNAUTHORIZED");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("never creates a row for an unknown key", async () => {
    const ctx = fakeCtx([]);
    await expectConvexError(run(internalSave)(ctx, args), "UNAUTHORIZED");
    expect([...ctx.db.rows.keys()].some((id) => id.startsWith("chat_attachments:"))).toBe(false);
  });

  it("requires a file-capable model for user uploads but not for generated images", async () => {
    const seed = () => [
      pending("k1"),
      { _id: CHAT, _creationTime: 0, userId: USER, model: "not-a-file-model" },
    ];
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 10 });

    await expectConvexError(run(internalSave)(fakeCtx(seed()), args), "UNSUPPORTED_MODEL");
    await expect(
      run(internalSave)(fakeCtx(seed()), { ...args, isGenerated: true }),
    ).resolves.toMatchObject({ status: "saved", attachment: { isGenerated: true } });
  });
});

describe("saveFileAttachment", () => {
  it("authorizes before syncing R2 metadata and throws the rejection code", async () => {
    const ctx = {
      runQuery: vi.fn<() => Promise<null>>(async () => null),
      runMutation: vi.fn<() => Promise<object>>(async () => ({
        status: "rejected",
        error: "UNSUPPORTED_FILE_TYPE",
      })),
    };

    await expectConvexError(
      run(saveFileAttachment)(ctx, { chatId: CHAT, key: "k1", fileName: "a.png" }),
      "UNSUPPORTED_FILE_TYPE",
    );
    expect(ctx.runQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncMetadata.mock.invocationCallOrder[0],
    );
    expect(ctx.runMutation).toHaveBeenCalledWith("files:internalSave", {
      chatId: CHAT,
      key: "k1",
      fileName: "a.png",
      isGenerated: false,
    });
  });
});

describe("getAttachmentsForUser", () => {
  it("omits pending uploads and keeps the pagination cursor", async () => {
    const ctx = fakeCtx([pending("pending"), pending("done", { chatId: CHAT })]);
    const result = await run(getAttachmentsForUser)(ctx, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(result).toMatchObject({ isDone: false, continueCursor: "next" });
    expect((result as { page: Row[] }).page.map((r) => r.key)).toEqual(["done"]);
  });
});

describe("deleteAttachments", () => {
  it("deletes only the caller's attachments, looked up by id", async () => {
    const ctx = fakeCtx([
      pending("mine", { chatId: CHAT }),
      pending("theirs", { chatId: CHAT, userId: "users:2" }),
    ]);

    await run(deleteAttachments)(ctx, {
      attachmentIds: ["chat_attachments:mine", "chat_attachments:theirs", "chat_attachments:gone"],
    });

    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "mine");
    expect(ctx.db.rows.has("chat_attachments:mine")).toBe(false);
    expect(ctx.db.rows.has("chat_attachments:theirs")).toBe(true);
  });

  it("deletes an object re-created through a deleted row's live upload URL once it expires", async () => {
    const ctx = fakeCtx([pending("mine", { chatId: CHAT })]);

    await run(deleteAttachments)(ctx, { attachmentIds: ["chat_attachments:mine"] });

    expect(ctx.scheduler.runAt.mock.calls).toEqual([
      [RECHECK_AT, "files:enforceAttachmentPolicy", { key: "mine" }],
    ]);
    mocks.deleteObject.mockClear();
    // The scheduled check, after the client PUT the key again
    await run(enforceAttachmentPolicy)(ctx, { key: "mine" });
    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "mine");
  });

  it("schedules no check for rows older than the upload URL lifetime", async () => {
    const ctx = fakeCtx([pending("old", { chatId: CHAT, _creationTime: NOW - 20 * 60 * 1000 })]);

    await run(deleteAttachments)(ctx, { attachmentIds: ["chat_attachments:old"] });

    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "old");
    expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
  });

  it("rejects batches above the cap", async () => {
    const attachmentIds = Array.from({ length: 101 }, (_, i) => `chat_attachments:${i}`);
    await expectConvexError(
      run(deleteAttachments)(fakeCtx([]), { attachmentIds }),
      "INVALID_INPUT",
    );
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});

describe("cleanupPendingUploads", () => {
  it("deletes only pending rows past the TTL, with their objects", async () => {
    const ctx = fakeCtx([
      pending("expired", { _creationTime: NOW - HOUR - 1 }),
      pending("fresh", { _creationTime: NOW - HOUR + 1000 }),
      pending("attached", { _creationTime: NOW - 2 * HOUR, chatId: CHAT }),
    ]);

    await run(cleanupPendingUploads)(ctx, {});

    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "expired");
    expect(ctx.db.rows.has("chat_attachments:fresh")).toBe(true);
    expect(ctx.db.rows.has("chat_attachments:attached")).toBe(true);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("schedules a continuation when a full batch was deleted", async () => {
    const expired = Array.from({ length: 50 }, (_, i) =>
      pending(`old-${i}`, { _creationTime: NOW - 2 * HOUR }),
    );
    const ctx = fakeCtx(expired);

    await run(cleanupPendingUploads)(ctx, {});

    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, "files:cleanupPendingUploads", {});
  });
});

describe("enforceAttachmentPolicy", () => {
  const saved = (extra: Partial<Row> = {}) =>
    pending("k1", { chatId: CHAT, fileType: "image/png", fileSize: 2048, ...extra });
  const args = { key: "k1" };

  it("deletes an attachment whose object was replaced with a disallowed file", async () => {
    const ctx = fakeCtx([saved()]);
    mocks.getMetadata.mockResolvedValue({ contentType: "text/html", size: 100 });

    await run(enforceAttachmentPolicy)(ctx, args);

    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "k1");
    expect(ctx.db.rows.has("chat_attachments:k1")).toBe(false);
  });

  it("keeps an attachment whose object still passes the policy", async () => {
    const ctx = fakeCtx([saved()]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 2048 });

    await run(enforceAttachmentPolicy)(ctx, args);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(ctx.db.rows.has("chat_attachments:k1")).toBe(true);
  });

  it("holds generated images to image types", async () => {
    const ctx = fakeCtx([saved({ isGenerated: true })]);
    mocks.getMetadata.mockResolvedValue({ contentType: "application/pdf", size: 2048 });

    await run(enforceAttachmentPolicy)(ctx, args);

    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "k1");
  });

  it("deletes the object at a key no row references, whatever its metadata", async () => {
    const ctx = fakeCtx([]);
    mocks.getMetadata.mockResolvedValue({ contentType: "image/png", size: 2048 });

    await run(enforceAttachmentPolicy)(ctx, args);

    expect(mocks.deleteObject).toHaveBeenCalledWith(ctx, "k1");
  });
});

describe("recheckAttachment", () => {
  const args = { key: "k1" };

  it("re-syncs the object's metadata, then enforces the policy", async () => {
    const runMutation = vi.fn<(fn: string, args: unknown) => Promise<null>>(async () => null);
    const ctx = { runMutation };

    await run(recheckAttachment)(ctx, args);

    expect(mocks.syncMetadata).toHaveBeenCalledWith(ctx, "k1");
    expect(runMutation).toHaveBeenCalledWith("files:enforceAttachmentPolicy", args);
  });

  const failingSync = () => {
    mocks.syncMetadata.mockRejectedValueOnce(new Error("R2 unavailable"));
    return {
      runMutation: vi.fn<(fn: string, args: unknown) => Promise<null>>(async () => null),
      scheduler: { runAfter: vi.fn<(delay: number, fn: string, args: unknown) => Promise<void>>() },
    };
  };

  it("retries a failed metadata sync later instead of enforcing stale metadata", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = failingSync();

    await run(recheckAttachment)(ctx, args);

    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(60_000, "files:recheckAttachment", {
      key: "k1",
      attempt: 1,
    });
    consoleWarn.mockRestore();
  });

  it("gives up after the last retry and leaves the attachment as saved", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = failingSync();

    await run(recheckAttachment)(ctx, { key: "k1", attempt: 3 });

    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "R2 metadata re-check failed; giving up",
      expect.anything(),
    );
    consoleError.mockRestore();
  });
});
