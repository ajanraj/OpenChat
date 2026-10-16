import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import { getDecryptedKey, saveApiKey } from "../api_keys";

const mocks = vi.hoisted(() => {
  // api_keys.ts reads its encryption secret once, at import (unstubbed after each test)
  vi.stubEnv("API_KEY_SECRET", "test-encryption-secret");
  return {
    getAuthUserId: vi.fn<(ctx: unknown) => Promise<Id<"users"> | null>>(),
  };
});

vi.mock(import("@convex-dev/auth/server"), () => ({
  getAuthUserId: mocks.getAuthUserId,
}));

// Ids are plain strings at runtime; the fake ones here carry their table as a prefix
const isUserId = (id: string): id is Id<"users"> => id.startsWith("users:");
const toUserId = (id: string): Id<"users"> => {
  if (!isUserId(id)) {
    throw new TypeError(`Not a users id: ${id}`);
  }
  return id;
};

const USER_ID = toUserId("users:user1");
const SERVER_SECRET = "route-secret";

type Row = Record<string, unknown>;

/** In-memory user_api_keys table supporting the by_user_provider lookup. */
const fakeCtx = () => {
  const rows: Row[] = [];
  const db = {
    query: () => ({
      withIndex: (
        _index: string,
        build: (q: {
          eq: (field: string, value: unknown) => typeof q;
        }) => unknown
      ) => {
        const filters: [string, unknown][] = [];
        const q = {
          eq: (field: string, value: unknown) => {
            filters.push([field, value]);
            return q;
          },
        };
        build(q);
        return {
          unique: () =>
            rows.find((row) =>
              filters.every(([field, value]) => row[field] === value)
            ) ?? null,
        };
      },
    }),
    insert: (_table: string, doc: Row) => {
      rows.push({ ...doc, _id: `user_api_keys:${rows.length}` });
    },
  };
  return { db };
};

type Handler<Args, Result> = (
  ctx: ReturnType<typeof fakeCtx>,
  args: Args
) => Promise<Result>;

const isHandler = <Args, Result>(fn: unknown): fn is Handler<Args, Result> =>
  typeof fn === "function";
// Convex keeps each registered function's handler on `_handler`; tests call it directly
const asHandler = <Args, Result>(fn: object): Handler<Args, Result> => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler<Args, Result>(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return handler;
};

const save = asHandler<{ provider: "openai"; key: string }, null>(saveApiKey);
const decrypt = asHandler<
  { provider: "openai"; serverSecret: string },
  string | null
>(getDecryptedKey);

const errorCodeOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ConvexError ? error.data : error;
  }
};

describe("getDecryptedKey query", () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue(USER_ID);
    vi.stubEnv("SERVER_ROUTE_SECRET", SERVER_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the caller's stored key to the server route", async () => {
    const ctx = fakeCtx();
    await save(ctx, { provider: "openai", key: "sk-user-key" });

    await expect(
      decrypt(ctx, { provider: "openai", serverSecret: SERVER_SECRET })
    ).resolves.toBe("sk-user-key");
  });

  it("returns null when the caller has no key for the provider", async () => {
    await expect(
      decrypt(fakeCtx(), { provider: "openai", serverSecret: SERVER_SECRET })
    ).resolves.toBeNull();
  });

  it("refuses a browser session without the server secret", async () => {
    const ctx = fakeCtx();
    await save(ctx, { provider: "openai", key: "sk-user-key" });

    await expect(
      errorCodeOf(decrypt(ctx, { provider: "openai", serverSecret: "guess" }))
    ).resolves.toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it("refuses everyone while the server secret is not configured", async () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "");

    await expect(
      errorCodeOf(decrypt(fakeCtx(), { provider: "openai", serverSecret: "" }))
    ).resolves.toBe(ERROR_CODES.UNAUTHORIZED);
  });
});
