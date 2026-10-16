import { ToolLoopAgent } from "ai";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduledAgentMemory } from "../../src/lib/ai/scheduled-agent-memory";
import { MODELS_MAP } from "../../src/lib/config/models";
import { SCHEDULED_AGENT_MODEL_ID } from "../../src/lib/config/models/minimax";
import type { createAgentTool } from "../../src/lib/create-agent-tool";
import { ERROR_CODES } from "../../src/lib/error-codes";
import { executeTask } from "../scheduled_ai";

/**
 * A claimed scheduled run: it finishes the claim it was given, and its credit wiring (what is
 * charged, when a limit pauses the task, and that a credit is refunded only when the run fails
 * before the model finishes generating).
 */

type Handler = (
  ctx: unknown,
  args: Record<string, unknown>
) => Promise<unknown>;

vi.mock(import("../../src/lib/config/models"), async (importOriginal) => {
  const actual = await importOriginal();
  const { SCHEDULED_AGENT_MODEL_ID: scheduledModelId } =
    await import("../../src/lib/config/models/minimax");
  const { MockLanguageModelV4 } = await import("ai/test");
  // A copy of the scheduled model, standard-priced, answering "Done" without a provider call
  const model = {
    ...actual.MODELS_MAP[scheduledModelId],
    premium: false,
    usesPremiumCredits: false,
    skipRateLimit: false,
    api_sdk: new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: "Done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
        warnings: [],
      },
    }),
  };
  return {
    ...actual,
    MODELS_MAP: { ...actual.MODELS_MAP, [scheduledModelId]: model },
  };
});

// Only called when the user has connectors, which these runs never do
vi.mock(import("../../src/lib/create-agent-tool"), () => ({
  createAgentTool: vi.fn<typeof createAgentTool>(),
}));
vi.mock(import("../../src/lib/prompt-config"), () => ({
  buildSystemPrompt: () => "system",
}));

// The real agent runs on the mock model above; the spy records its options
const generate = vi.spyOn(ToolLoopAgent.prototype, "generate");

// Redis-backed memory starts empty and saves nowhere
vi.spyOn(ScheduledAgentMemory.prototype, "loadHistory").mockResolvedValue([]);
vi.spyOn(ScheduledAgentMemory.prototype, "loadWorkingMemory").mockResolvedValue(
  null
);
vi.spyOn(ScheduledAgentMemory.prototype, "saveHistory").mockResolvedValue();

// The mocked copy of the scheduled model; tests toggle skipRateLimit on it
const model = MODELS_MAP[SCHEDULED_AGENT_MODEL_ID];

type FunctionRef = Parameters<typeof getFunctionName>[0];

const TASK_ID = "scheduled_tasks:task1";
const USER_ID = "users:user1";
const CHARGED_RECEIPT = [
  { bucket: "authenticatedDaily", windowStart: 1 },
  { bucket: "standardMonthly", windowStart: 1 },
];
const EXECUTION_ID = "exec_1";
const NOW = Date.parse("2026-10-14T09:00:00Z");
const MINUTE = 60 * 1000;
// The task as claimed by scheduled_tasks.claimRun
const TASK = {
  _id: TASK_ID,
  _creationTime: 0,
  userId: USER_ID,
  title: "Daily digest",
  prompt: "Summarise my day",
  scheduleType: "daily",
  scheduledTime: "09:00",
  timezone: "UTC",
  status: "running",
  lastExecuted: NOW,
  createdAt: 0,
};

/** ctx whose runMutation/runQuery answer by function name; `overrides` replaces a mutation. */
const createCtx = (overrides: Record<string, () => unknown> = {}) => {
  const mutationResults: Record<string, () => unknown> = {
    "users:consumeMessageCreditInternal": () => CHARGED_RECEIPT,
    "chats:createChatInternal": () => ({ chatId: "chats:chat1" }),
    "messages:sendUserMessageToChatInternal": () => ({
      messageId: "messages:m1",
    }),
    ...overrides,
  };
  const queryResults: Record<string, () => unknown> = {
    "users:getUser": () => ({ _id: USER_ID }),
    "connectors:getConnectedConnectors": () => [],
    "connectors:getAllUserConnectors": () => [],
  };
  const runMutation = vi.fn<
    (fn: FunctionRef, args: unknown) => Promise<unknown>
  >(async (fn) => (await mutationResults[getFunctionName(fn)]?.()) ?? null);
  const runQuery = vi.fn<(fn: FunctionRef, args: unknown) => Promise<unknown>>(
    async (fn) => (await queryResults[getFunctionName(fn)]?.()) ?? null
  );
  return {
    runMutation,
    runQuery,
    scheduler: { runAfter: vi.fn<() => Promise<void>>() },
  };
};

/** Mutations the run called, as [function name, args]. */
const calls = (ctx: ReturnType<typeof createCtx>) =>
  ctx.runMutation.mock.calls.map(
    ([fn, args]) => [getFunctionName(fn), args] as const
  );
const called = (ctx: ReturnType<typeof createCtx>, name: string) =>
  calls(ctx).filter(([fn]) => fn === name);
const outcome = (ctx: ReturnType<typeof createCtx>) => {
  const args = called(ctx, "scheduled_tasks:finishTaskExecution")[0]?.[1];
  return typeof args === "object" && args !== null && "outcome" in args
    ? args.outcome
    : undefined;
};

const isHandler = (value: unknown): value is Handler =>
  typeof value === "function";

// Convex keeps a registered function's handler on `_handler`; the run calls it with a fake ctx
const run = async (ctx: ReturnType<typeof createCtx>) => {
  const handler = "_handler" in executeTask ? executeTask._handler : undefined;
  if (!isHandler(handler)) {
    throw new TypeError(
      "Expected executeTask to be a registered Convex function"
    );
  }
  return await handler(ctx, {
    task: TASK,
    executionId: EXECUTION_ID,
  });
};

describe("scheduled_ai", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    model.skipRateLimit = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("executeTask action", () => {
    it("runs the claimed task without claiming it again and finishes that claim", async () => {
      const ctx = createCtx();

      await run(ctx);

      expect(
        calls(ctx)
          .map(([fn]) => fn)
          .filter((fn) => fn.startsWith("scheduled_tasks:"))
      ).toStrictEqual([
        "scheduled_tasks:updateTaskChatId",
        "scheduled_tasks:finishTaskExecution",
      ]);
      expect(called(ctx, "scheduled_tasks:updateTaskChatId")).toStrictEqual([
        [
          "scheduled_tasks:updateTaskChatId",
          { taskId: TASK_ID, chatId: "chats:chat1" },
        ],
      ]);
      expect(called(ctx, "scheduled_tasks:finishTaskExecution")).toStrictEqual([
        [
          "scheduled_tasks:finishTaskExecution",
          expect.objectContaining({
            taskId: TASK_ID,
            executionId: EXECUTION_ID,
            outcome: "success",
            chatId: "chats:chat1",
          }),
        ],
      ]);
    });
  });

  describe("executeTask credits", () => {
    it("charges one credit and keeps it when the run succeeds", async () => {
      const ctx = createCtx();

      await run(ctx);

      expect(called(ctx, "users:consumeMessageCreditInternal")).toStrictEqual([
        [
          "users:consumeMessageCreditInternal",
          {
            userId: USER_ID,
            requiresPremium: false,
            usesPremiumCredits: false,
          },
        ],
      ]);
      expect(called(ctx, "users:refundMessageCreditInternal")).toStrictEqual(
        []
      );
      expect(outcome(ctx)).toBe("success");
    });

    it("pauses the task on a usage limit without creating a chat", async () => {
      const ctx = createCtx({
        "users:consumeMessageCreditInternal": () => {
          throw new ConvexError(ERROR_CODES.DAILY_LIMIT_REACHED);
        },
      });

      await run(ctx);

      expect(outcome(ctx)).toBe("paused");
      expect(called(ctx, "chats:createChatInternal")).toStrictEqual([]);
      expect(called(ctx, "users:refundMessageCreditInternal")).toStrictEqual(
        []
      );
      expect(generate).not.toHaveBeenCalled();
    });

    it("refunds the charged credit when generation fails", async () => {
      generate.mockRejectedValueOnce(new Error("Provider down"));
      const ctx = createCtx();

      await run(ctx);

      expect(called(ctx, "users:refundMessageCreditInternal")).toStrictEqual([
        [
          "users:refundMessageCreditInternal",
          { userId: USER_ID, receipt: CHARGED_RECEIPT },
        ],
      ]);
      expect(outcome(ctx)).toBe("failure");
    });

    it("keeps the credit when saving fails after generating", async () => {
      const ctx = createCtx({
        "messages:saveAssistantMessageInternal": () => {
          throw new Error("Chat was deleted");
        },
      });

      await run(ctx);

      expect(called(ctx, "users:refundMessageCreditInternal")).toStrictEqual(
        []
      );
      expect(outcome(ctx)).toBe("failure");
    });

    it("only checks limits for models that skip rate limiting, and never refunds", async () => {
      model.skipRateLimit = true;
      generate.mockRejectedValueOnce(new Error("Provider down"));
      const ctx = createCtx();

      await run(ctx);

      expect(called(ctx, "users:assertNotOverLimitInternal")).toHaveLength(1);
      expect(called(ctx, "users:consumeMessageCreditInternal")).toStrictEqual(
        []
      );
      expect(called(ctx, "users:refundMessageCreditInternal")).toStrictEqual(
        []
      );
      expect(outcome(ctx)).toBe("failure");
    });

    it("gives generation a deadline inside the 10-minute action limit", async () => {
      await run(createCtx());

      const timeout = generate.mock.calls[0]?.[0].timeout ?? Infinity;
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(8 * 60 * 1000);
    });
  });

  describe("executeTask start lag", () => {
    it("measures the generation deadline from the claim, not the action start", async () => {
      vi.setSystemTime(NOW + 3 * MINUTE);

      await run(createCtx());

      expect(generate.mock.calls[0]?.[0].timeout).toBe(5 * MINUTE);
    });

    it("ends a run that starts after its deadline without charging, a chat, or generating", async () => {
      vi.setSystemTime(NOW + 8 * MINUTE);
      const ctx = createCtx();

      await run(ctx);

      expect(calls(ctx)).toStrictEqual([
        [
          "scheduled_tasks:finishTaskExecution",
          {
            taskId: TASK_ID,
            executionId: EXECUTION_ID,
            outcome: "failure",
            chatId: undefined,
            errorMessage: "The run could not start in time.",
          },
        ],
      ]);
      expect(ctx.runQuery).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    });
  });
});
