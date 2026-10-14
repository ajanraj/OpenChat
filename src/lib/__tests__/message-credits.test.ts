import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { createMessageCreditTracker, shouldRefundGeneration } from "../message-credits";

const getServerRouteSecret = vi.hoisted(() => vi.fn<() => string>(() => "route-secret"));

vi.mock("@/lib/middleware/auth", () => ({ getServerRouteSecret }));

type MutationCall = [FunctionReference<"mutation">, Record<string, unknown>];

const CHARGED_RECEIPT = [{ bucket: "premiumMonthly", windowStart: 1 }];

// consumeMessageCredit answers with the charge's receipt unless mutationImpl overrides it
function setup(mutationImpl?: (name: string) => Promise<unknown>) {
  const mutation = vi.fn<(...call: MutationCall) => Promise<unknown>>(async (fn) => {
    const name = getFunctionName(fn);
    if (mutationImpl) {
      return await mutationImpl(name);
    }
    return name === "users:consumeMessageCredit" ? CHARGED_RECEIPT : null;
  });
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
  it("charges a credit and refunds its receipt once with the server secret", async () => {
    const { credits, calls } = setup();

    await credits.charge(true);
    await credits.refund();
    await credits.refund();

    expect(calls()).toEqual([
      ["users:consumeMessageCredit", { usesPremiumCredits: true }],
      ["users:refundMessageCredit", { serverSecret: "route-secret", receipt: CHARGED_RECEIPT }],
    ]);
  });

  it("charges nothing when the server secret is missing, since it could not be refunded", async () => {
    getServerRouteSecret.mockImplementationOnce(() => {
      throw new Error("Environment variable SERVER_ROUTE_SECRET is missing.");
    });
    const { credits, calls } = setup();

    await expect(credits.charge(false)).rejects.toThrow("SERVER_ROUTE_SECRET is missing");
    await credits.refund();

    expect(calls()).toEqual([]);
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
      return CHARGED_RECEIPT;
    });

    await credits.charge(false);
    await expect(credits.refund()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to refund message credit:",
      expect.any(Error),
    );
  });
});

describe("shouldRefundGeneration", () => {
  const failed = (parts: UIMessage["parts"]) =>
    shouldRefundGeneration({ hasResult: true, generationFailed: true, parts });

  it("refunds when no attempt streamed", () => {
    expect(shouldRefundGeneration({ hasResult: false, generationFailed: false, parts: [] })).toBe(
      true,
    );
  });

  it("refunds a provider failure before any output", () => {
    expect(failed([])).toBe(true);
    expect(failed([{ type: "step-start" }, { type: "text", text: "  " }])).toBe(true);
  });

  it("keeps the charge once output reached the client", () => {
    expect(failed([{ type: "step-start" }, { type: "text", text: "Partial answer" }])).toBe(false);
    expect(failed([{ type: "reasoning", text: "Thinking" }])).toBe(false);
    expect(
      failed([
        {
          type: "dynamic-tool",
          toolName: "create_agent",
          toolCallId: "call-1",
          state: "input-available",
          input: {},
        },
      ]),
    ).toBe(false);
  });

  it("keeps the charge for a successful generation, even if a later save fails", () => {
    expect(shouldRefundGeneration({ hasResult: true, generationFailed: false, parts: [] })).toBe(
      false,
    );
  });
});
