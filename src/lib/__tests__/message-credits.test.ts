import type { UIMessage } from "ai";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMessageCreditTracker,
  shouldRefundGeneration,
} from "../message-credits";

const getServerRouteSecret = vi.hoisted(() =>
  vi.fn<() => string>(() => "route-secret")
);

vi.mock(import("@/lib/middleware/auth"), () => ({ getServerRouteSecret }));

type MutationCall = [FunctionReference<"mutation">, Record<string, unknown>];

const CHARGED_RECEIPT = [{ bucket: "premiumMonthly", windowStart: 1 }];

type CreditClient = Parameters<typeof createMessageCreditTracker>[0];

// The tracker only calls mutation(), so a fake with that method stands in for the client
const isCreditClient = (client: object): client is CreditClient =>
  "mutation" in client && typeof client.mutation === "function";

// consumeMessageCredit answers with the charge's receipt unless mutationImpl overrides it.
// The fake answers (or throws) synchronously; the tracker awaits every call either way.
const setup = (mutationImpl?: (name: string) => unknown) => {
  const mutation = vi.fn<(...call: MutationCall) => unknown>((fn) => {
    const name = getFunctionName(fn);
    if (mutationImpl) {
      return mutationImpl(name);
    }
    return name === "users:consumeMessageCredit" ? CHARGED_RECEIPT : null;
  });
  const client = { mutation };
  if (!isCreditClient(client)) {
    throw new TypeError("The fake client has no mutation method");
  }
  const controller = new AbortController();
  const credits = createMessageCreditTracker(client, controller.signal);
  const calls = () =>
    mutation.mock.calls.map(
      ([fn, args]) => [getFunctionName(fn), args] as const
    );
  return { credits, controller, calls };
};

const failed = (parts: UIMessage["parts"]) =>
  shouldRefundGeneration({ hasResult: true, generationFailed: true, parts });

describe(createMessageCreditTracker, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges a credit and refunds its receipt once with the server secret", async () => {
    const { credits, calls } = setup();

    await credits.charge(true);
    await credits.refund();
    await credits.refund();

    expect(calls()).toStrictEqual([
      ["users:consumeMessageCredit", { usesPremiumCredits: true }],
      [
        "users:refundMessageCredit",
        { serverSecret: "route-secret", receipt: CHARGED_RECEIPT },
      ],
    ]);
  });

  it("charges nothing when the server secret is missing, since it could not be refunded", async () => {
    getServerRouteSecret.mockImplementationOnce(() => {
      throw new Error("Environment variable SERVER_ROUTE_SECRET is missing.");
    });
    const { credits, calls } = setup();

    await expect(credits.charge(false)).rejects.toThrow(
      "SERVER_ROUTE_SECRET is missing"
    );
    await credits.refund();

    expect(calls()).toStrictEqual([]);
  });

  it("does nothing on refund when no credit was charged", async () => {
    const { credits, calls } = setup();

    await credits.refund();

    expect(calls()).toStrictEqual([]);
  });

  it("keeps the charge when the client aborted the request", async () => {
    const { credits, controller, calls } = setup();

    await credits.charge(false);
    controller.abort();
    await credits.refund();

    expect(calls().map(([name]) => name)).toStrictEqual([
      "users:consumeMessageCredit",
    ]);
  });

  it("does not refund a charge that was rejected for exhausted credits", async () => {
    const { credits, calls } = setup((name) => {
      if (name === "users:consumeMessageCredit") {
        throw new ConvexError("DAILY_LIMIT_REACHED");
      }
      return null;
    });

    await expect(credits.charge(false)).rejects.toThrow(ConvexError);
    await credits.refund();

    expect(calls().map(([name]) => name)).toStrictEqual([
      "users:consumeMessageCredit",
    ]);
  });

  it("logs instead of throwing when the refund fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    const { credits } = setup((name) => {
      if (name === "users:refundMessageCredit") {
        throw new Error("network down");
      }
      return CHARGED_RECEIPT;
    });

    await credits.charge(false);
    await expect(credits.refund()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to refund message credit:",
      expect.any(Error)
    );
  });
});

describe(shouldRefundGeneration, () => {
  it("refunds when no attempt streamed", () => {
    expect(
      shouldRefundGeneration({
        hasResult: false,
        generationFailed: false,
        parts: [],
      })
    ).toBeTruthy();
  });

  it("refunds a provider failure before any output", () => {
    expect(failed([])).toBeTruthy();
    expect(
      failed([{ type: "step-start" }, { type: "text", text: "  " }])
    ).toBeTruthy();
  });

  it("keeps the charge once output reached the client", () => {
    expect(
      failed([{ type: "step-start" }, { type: "text", text: "Partial answer" }])
    ).toBeFalsy();
    expect(failed([{ type: "reasoning", text: "Thinking" }])).toBeFalsy();
    expect(
      failed([
        {
          type: "dynamic-tool",
          toolName: "create_agent",
          toolCallId: "call-1",
          state: "input-available",
          input: {},
        },
      ])
    ).toBeFalsy();
  });

  it("keeps the charge for a successful generation, even if a later save fails", () => {
    expect(
      shouldRefundGeneration({
        hasResult: true,
        generationFailed: false,
        parts: [],
      })
    ).toBeFalsy();
  });
});
