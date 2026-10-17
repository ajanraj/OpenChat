import { getAuthUserId } from "@convex-dev/auth/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import {
  removeConnection,
  saveConnection,
  setConnectorEnabled,
} from "../connectors";

vi.mock(import("@convex-dev/auth/server"), () => ({
  getAuthUserId: vi.fn<typeof getAuthUserId>(),
}));

type Handler = (
  ctx: unknown,
  args: Record<string, unknown>
) => Promise<unknown>;
const isHandler = (fn: unknown): fn is Handler => typeof fn === "function";
// Convex keeps each registered function's handler on `_handler`; tests call it with a fake ctx
const asHandler = (fn: object): Handler => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return handler;
};

const isUserId = (id: string): id is Id<"users"> => id.startsWith("users:");
const toUserId = (id: string): Id<"users"> => {
  if (!isUserId(id)) {
    throw new TypeError(`Not a users id: ${id}`);
  }
  return id;
};

const USER_ID = toUserId("users:user1");
const CONNECTOR_ID = "connectors:gmail1";

/**
 * Fake ctx with one user and (optionally) an existing gmail connector row. Its db methods are
 * async like the real db's.
 */
const createCtx = (user: { isAnonymous?: boolean }, hasConnector = true) => {
  const writes: string[] = [];
  const ctx = {
    db: {
      get: async () => await Promise.resolve({ _id: USER_ID, ...user }),
      query: () => ({
        withIndex: () => ({
          unique: async () =>
            await Promise.resolve(
              hasConnector ? { _id: CONNECTOR_ID, userId: USER_ID } : null
            ),
        }),
      }),
      insert: async () => {
        writes.push("insert");
        return await Promise.resolve("connectors:new");
      },
      patch: async () => {
        writes.push("patch");
        await Promise.resolve();
      },
      delete: async () => {
        writes.push("delete");
        await Promise.resolve();
      },
    },
  };
  return { ctx, writes };
};

const mutations: [string, Handler, Record<string, unknown>][] = [
  [
    "saveConnection",
    asHandler(saveConnection),
    { type: "gmail", connectionId: "ca_1" },
  ],
  ["removeConnection", asHandler(removeConnection), { type: "gmail" }],
  [
    "setConnectorEnabled",
    asHandler(setConnectorEnabled),
    { type: "gmail", enabled: false },
  ],
];

describe("connector mutations", () => {
  beforeEach(() => {
    vi.mocked(getAuthUserId).mockResolvedValue(USER_ID);
  });

  it.each(mutations)(
    "%s rejects anonymous users without writing",
    async (_name, handler, args) => {
      const { ctx, writes } = createCtx({ isAnonymous: true });

      await expect(handler(ctx, args)).rejects.toMatchObject({
        data: ERROR_CODES.UNAUTHORIZED,
      });
      expect(writes).toStrictEqual([]);
    }
  );

  it.each(mutations)(
    "%s rejects signed-out callers",
    async (_name, handler, args) => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const { ctx, writes } = createCtx({ isAnonymous: false });

      await expect(handler(ctx, args)).rejects.toMatchObject({
        data: ERROR_CODES.NOT_AUTHENTICATED,
      });
      expect(writes).toStrictEqual([]);
    }
  );

  it("lets signed-in Google users save a connection", async () => {
    const { ctx, writes } = createCtx({ isAnonymous: false }, false);

    await expect(
      asHandler(saveConnection)(ctx, {
        type: "gmail",
        connectionId: "ca_1",
      })
    ).resolves.toBe("connectors:new");
    expect(writes).toStrictEqual(["insert"]);
  });
});
