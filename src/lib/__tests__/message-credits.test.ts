import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMessageCreditTracker } from "../message-credits";

vi.mock("@/lib/middleware/auth", () => ({
  getServerRouteSecret: () => "route-secret",
}));

type MutationCall = [FunctionReference<"mutation">, Record<string, unknown>];

function setup(mutationImpl?: (name: string) => Promise<unknown>) {
  const mutation = vi.fn<(...call: MutationCall) => Promise<unknown>>(async (fn) =>
    mutationImpl ? mutationImpl(getFunctionName(fn)) : null,
  );
  const controller = new AbortController();
  const credits = createMessageCreditTracker(
    { mutation } as unknown as Pick<ConvexHttpClient, "mutation">,
    controller.signal,
  );
  const calls = () => mutation.mock.calls.map(([fn, args]) => [getFunctionName(fn), args] as const);
  return { credits, controller, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMessageCreditTracker", () => {
  it("charges a credit and refunds it once with the server secret", async () => {
    const { credits, calls } = setup();

    await credits.charge(true);
    await credits.refund();
    await credits.refund();

    expect(calls()).toEqual([
      ["users:consumeMessageCredit", { usesPremiumCredits: true }],
      ["users:refundMessageCredit", { serverSecret: "route-secret", usesPremiumCredits: true }],
    ]);
  });

  it("does nothing on refund when no credit was charged", async () => {
    const { credits, calls } = setup();

    await credits.refund();

    expect(calls()).toEqual([]);
  });

  it("keeps the charge when the client aborted the request", async () => {
    const { credits, controller, calls } = setup();

    await credits.charge(false);
    controller.abort();
    await credits.refund();

    expect(calls().map(([name]) => name)).toEqual(["users:consumeMessageCredit"]);
  });

  it("does not refund a charge that was rejected for exhausted credits", async () => {
    const { credits, calls } = setup(async (name) => {
      if (name === "users:consumeMessageCredit") {
        throw new ConvexError("DAILY_LIMIT_REACHED");
      }
      return null;
    });

    await expect(credits.charge(false)).rejects.toThrow(ConvexError);
    await credits.refund();

    expect(calls().map(([name]) => name)).toEqual(["users:consumeMessageCredit"]);
  });

  it("logs instead of throwing when the refund fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { credits } = setup(async (name) => {
      if (name === "users:refundMessageCredit") {
        throw new Error("network down");
      }
      return null;
    });

    await credits.charge(false);
    await expect(credits.refund()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to refund message credit:",
      expect.any(Error),
    );
  });
});
