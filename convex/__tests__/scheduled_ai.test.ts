import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import { executeTask } from "../scheduled_ai";

/**
 * A claimed scheduled run: it finishes the claim it was given, and its credit wiring (what is
 * charged, when a limit pauses the task, and that a credit is refunded only when the run fails
 * before the model finishes generating).
 */

const mocks = vi.hoisted(() => ({
  model: { id: "scheduled-model", name: "Scheduled", premium: false, skipRateLimit: false },
  generate: vi.fn<(options: { timeout?: number }) => Promise<{ text: string; usage: object }>>(
    async () => ({ text: "Done", usage: {} }),
  ),
}));

vi.mock("../_generated/server", () => ({
  internalAction: (def: { handler: unknown }) => def.handler,
}));

vi.mock("../../src/lib/config/models/minimax", () => ({
  SCHEDULED_AGENT_MODEL_ID: "scheduled-model",
}));

vi.mock("../../src/lib/config", () => ({
  MODELS_MAP: { "scheduled-model": mocks.model },
}));

vi.mock("../../src/lib/ai/agent", () => ({
  createScheduledAgent: () => ({ generate: mocks.generate }),
}));

vi.mock("../../src/lib/ai/scheduled-agent-memory", () => ({
  formatWorkingMemoryPrompt: () => "",
  ScheduledAgentMemory: class {
    loadHistory = async () => [];
    loadWorkingMemory = async () => null;
    saveHistory = async () => undefined;
    createUpdateTool = () => ({});
  },
}));

vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("../../src/lib/create-agent-tool", () => ({ createAgentTool: () => ({}) }));
vi.mock("../../src/lib/prompt_config", () => ({ buildSystemPrompt: () => "system" }));
vi.mock("../../src/lib/tools/search-credit-metering", () => ({
  createMeteredSearchTool: () => null,
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
type FunctionRef = Parameters<typeof getFunctionName>[0];

const TASK_ID = "scheduled_tasks:task1";
const USER_ID = "users:user1";
const CHARGED_BUCKETS = ["authenticatedDaily", "standardMonthly"];
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
function createCtx(overrides: Record<string, () => Promise<unknown>> = {}) {
  const mutationResults: Record<string, () => Promise<unknown>> = {
    "users:consumeMessageCreditInternal": async () => CHARGED_BUCKETS,
    "chats:createChatInternal": async () => ({ chatId: "chats:chat1" }),
    "messages:sendUserMessageToChatInternal": async () => ({ messageId: "messages:m1" }),
    ...overrides,
  };
  const queryResults: Record<string, unknown> = {
    "users:getUser": { _id: USER_ID },
    "connectors:getConnectedConnectors": [],
    "connectors:getAllUserConnectors": [],
  };
  const runMutation = vi.fn<(fn: FunctionRef, args: unknown) => Promise<unknown>>(
    async (fn) => (await mutationResults[getFunctionName(fn)]?.()) ?? null,
  );
  const runQuery = vi.fn<(fn: FunctionRef, args: unknown) => Promise<unknown>>(
    async (fn) => queryResults[getFunctionName(fn)] ?? null,
  );
  return { runMutation, runQuery, scheduler: { runAfter: vi.fn<() => Promise<void>>() } };
}

/** Mutations the run called, as [function name, args]. */
const calls = (ctx: ReturnType<typeof createCtx>) =>
  ctx.runMutation.mock.calls.map(([fn, args]) => [getFunctionName(fn), args] as const);
const called = (ctx: ReturnType<typeof createCtx>, name: string) =>
  calls(ctx).filter(([fn]) => fn === name);
const outcome = (ctx: ReturnType<typeof createCtx>) =>
  (called(ctx, "scheduled_tasks:finishTaskExecution")[0]?.[1] as { outcome: string } | undefined)
    ?.outcome;

const run = (ctx: ReturnType<typeof createCtx>) =>
  (executeTask as unknown as Handler)(ctx, { task: TASK, executionId: EXECUTION_ID });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  mocks.model.skipRateLimit = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("executeTask", () => {
  it("runs the claimed task without claiming it again and finishes that claim", async () => {
    const ctx = createCtx();

    await run(ctx);

    expect(
      calls(ctx)
        .map(([fn]) => fn)
        .filter((fn) => fn.startsWith("scheduled_tasks:")),
    ).toEqual(["scheduled_tasks:updateTaskChatId", "scheduled_tasks:finishTaskExecution"]);
    expect(called(ctx, "scheduled_tasks:updateTaskChatId")).toEqual([
      ["scheduled_tasks:updateTaskChatId", { taskId: TASK_ID, chatId: "chats:chat1" }],
    ]);
    expect(called(ctx, "scheduled_tasks:finishTaskExecution")).toEqual([
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

    expect(called(ctx, "users:consumeMessageCreditInternal")).toEqual([
      [
        "users:consumeMessageCreditInternal",
        { userId: USER_ID, requiresPremium: false, usesPremiumCredits: false },
      ],
    ]);
    expect(called(ctx, "users:refundMessageCreditInternal")).toEqual([]);
    expect(outcome(ctx)).toBe("success");
  });

  it("pauses the task on a usage limit without creating a chat", async () => {
    const ctx = createCtx({
      "users:consumeMessageCreditInternal": async () => {
        throw new ConvexError(ERROR_CODES.DAILY_LIMIT_REACHED);
      },
    });

    await run(ctx);

    expect(outcome(ctx)).toBe("paused");
    expect(called(ctx, "chats:createChatInternal")).toEqual([]);
    expect(called(ctx, "users:refundMessageCreditInternal")).toEqual([]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("refunds the charged buckets when generation fails", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Provider down"));
    const ctx = createCtx();

    await run(ctx);

    expect(called(ctx, "users:refundMessageCreditInternal")).toEqual([
      ["users:refundMessageCreditInternal", { userId: USER_ID, buckets: CHARGED_BUCKETS }],
    ]);
    expect(outcome(ctx)).toBe("failure");
  });

  it("keeps the credit when saving fails after generating", async () => {
    const ctx = createCtx({
      "messages:saveAssistantMessageInternal": async () => {
        throw new Error("Chat was deleted");
      },
    });

    await run(ctx);

    expect(called(ctx, "users:refundMessageCreditInternal")).toEqual([]);
    expect(outcome(ctx)).toBe("failure");
  });

  it("only checks limits for models that skip rate limiting, and never refunds", async () => {
    mocks.model.skipRateLimit = true;
    mocks.generate.mockRejectedValueOnce(new Error("Provider down"));
    const ctx = createCtx();

    await run(ctx);

    expect(called(ctx, "users:assertNotOverLimitInternal")).toHaveLength(1);
    expect(called(ctx, "users:consumeMessageCreditInternal")).toEqual([]);
    expect(called(ctx, "users:refundMessageCreditInternal")).toEqual([]);
    expect(outcome(ctx)).toBe("failure");
  });

  it("gives generation a deadline inside the 10-minute action limit", async () => {
    await run(createCtx());

    const timeout = mocks.generate.mock.calls[0]?.[0].timeout ?? Infinity;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(8 * 60 * 1000);
  });
});

describe("executeTask start lag", () => {
  it("measures the generation deadline from the claim, not the action start", async () => {
    vi.setSystemTime(NOW + 3 * MINUTE);

    await run(createCtx());

    expect(mocks.generate.mock.calls[0]?.[0].timeout).toBe(5 * MINUTE);
  });

  it("ends a run that starts after its deadline without charging, a chat, or generating", async () => {
    vi.setSystemTime(NOW + 8 * MINUTE);
    const ctx = createCtx();

    await run(ctx);

    expect(calls(ctx)).toEqual([
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
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
