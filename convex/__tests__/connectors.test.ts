import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import { removeConnection, saveConnection, setConnectorEnabled } from "../connectors";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

// Registered functions become their raw handlers so we can call them with a fake ctx.
vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

const USER_ID = "users:user1" as Id<"users">;
const CONNECTOR_ID = "connectors:gmail1";

/** Fake ctx with one user and (optionally) an existing gmail connector row. */
function createCtx(user: { isAnonymous?: boolean }, hasConnector = true) {
  const writes: string[] = [];
  const ctx = {
    db: {
      get: async () => ({ _id: USER_ID, ...user }),
      query: () => ({
        withIndex: () => ({
          unique: async () => (hasConnector ? { _id: CONNECTOR_ID, userId: USER_ID } : null),
        }),
      }),
      insert: async () => {
        writes.push("insert");
        return "connectors:new";
      },
      patch: async () => {
        writes.push("patch");
      },
      delete: async () => {
        writes.push("delete");
      },
    },
  };
  return { ctx, writes };
}

const mutations: Array<[string, Handler, Record<string, unknown>]> = [
  ["saveConnection", saveConnection as unknown as Handler, { type: "gmail", connectionId: "ca_1" }],
  ["removeConnection", removeConnection as unknown as Handler, { type: "gmail" }],
  [
    "setConnectorEnabled",
    setConnectorEnabled as unknown as Handler,
    { type: "gmail", enabled: false },
  ],
];

describe("connector mutations", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it.each(mutations)("%s rejects anonymous users without writing", async (_name, handler, args) => {
    const { ctx, writes } = createCtx({ isAnonymous: true });

    await expect(handler(ctx, args)).rejects.toMatchObject({ data: ERROR_CODES.UNAUTHORIZED });
    expect(writes).toEqual([]);
  });

  it.each(mutations)("%s rejects signed-out callers", async (_name, handler, args) => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    const { ctx, writes } = createCtx({ isAnonymous: false });

    await expect(handler(ctx, args)).rejects.toMatchObject({
      data: ERROR_CODES.NOT_AUTHENTICATED,
    });
    expect(writes).toEqual([]);
  });

  it("lets signed-in Google users save a connection", async () => {
    const { ctx, writes } = createCtx({ isAnonymous: false }, false);

    await expect(
      (saveConnection as unknown as Handler)(ctx, { type: "gmail", connectionId: "ca_1" }),
    ).resolves.toBe("connectors:new");
    expect(writes).toEqual(["insert"]);
  });
});
