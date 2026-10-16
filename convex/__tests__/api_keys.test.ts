import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getDecryptedKey, saveApiKey } from "../api_keys";

const mocks = vi.hoisted(() => {
  // api_keys.ts reads its encryption secret once, at import (unstubbed after each test)
  vi.stubEnv("API_KEY_SECRET", "test-encryption-secret");
  return { getAuthUserId: vi.fn<(ctx: unknown) => Promise<string | null>>() };
});

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: mocks.getAuthUserId }));

vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
}));

const USER_ID = "users:user1" as Id<"users">;
const SERVER_SECRET = "route-secret";

type Row = Record<string, unknown>;

/** In-memory user_api_keys table supporting the by_user_provider lookup. */
function fakeCtx() {
  const rows: Row[] = [];
  const db = {
    query: () => ({
      withIndex: (
        _index: string,
        build: (q: { eq: (field: string, value: unknown) => typeof q }) => unknown,
      ) => {
        const filters: Array<[string, unknown]> = [];
        const q = {
          eq: (field: string, value: unknown) => {
            filters.push([field, value]);
            return q;
          },
        };
        build(q);
        return {
          unique: async () =>
            rows.find((row) => filters.every(([field, value]) => row[field] === value)) ?? null,
        };
      },
    }),
    insert: async (_table: string, doc: Row) => {
      rows.push({ ...doc, _id: `user_api_keys:${rows.length}` });
    },
  };
  return { db } as unknown as QueryCtx & MutationCtx;
}

const save = saveApiKey as unknown as (
  ctx: MutationCtx,
  args: { provider: "openai"; key: string },
) => Promise<null>;
const decrypt = getDecryptedKey as unknown as (
  ctx: QueryCtx,
  args: { provider: "openai"; serverSecret: string },
) => Promise<string | null>;

async function errorCodeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ConvexError ? error.data : error;
  }
}

describe("getDecryptedKey", () => {
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

    await expect(decrypt(ctx, { provider: "openai", serverSecret: SERVER_SECRET })).resolves.toBe(
      "sk-user-key",
    );
  });

  it("returns null when the caller has no key for the provider", async () => {
    await expect(decrypt(fakeCtx(), { provider: "openai", serverSecret: SERVER_SECRET })).resolves.toBeNull();
  });

  it("refuses a browser session without the server secret", async () => {
    const ctx = fakeCtx();
    await save(ctx, { provider: "openai", key: "sk-user-key" });

    await expect(errorCodeOf(decrypt(ctx, { provider: "openai", serverSecret: "guess" }))).resolves.toBe(
      ERROR_CODES.UNAUTHORIZED,
    );
  });

  it("refuses everyone while the server secret is not configured", async () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "");

    await expect(errorCodeOf(decrypt(fakeCtx(), { provider: "openai", serverSecret: "" }))).resolves.toBe(
      ERROR_CODES.UNAUTHORIZED,
    );
  });
});
