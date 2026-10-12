import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/error-codes";
import {
  claimTaskExecution,
  deleteScheduledTask,
  expireTaskExecution,
  finishTaskExecution,
  pauseDeadTasks,
  updateScheduledTask,
} from "../scheduled_tasks";

/**
 * Run-lifecycle tests for scheduled tasks against an in-memory ctx
 * (convex-test is not installed, so handlers are called directly).
 */

vi.mock("../_generated/server", () => ({
  mutation: (def: { handler: unknown }) => def.handler,
  query: (def: { handler: unknown }) => def.handler,
  internalMutation: (def: { handler: unknown }) => def.handler,
  internalQuery: (def: { handler: unknown }) => def.handler,
}));

vi.mock("../lib/auth_helper", () => ({
  ensureAuthenticated: vi.fn<() => Promise<string>>(async () => "users:user1"),
}));

vi.mock("../stripe", () => ({
  hasActivePremium: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock("../../src/lib/config/models/minimax", () => ({
  SCHEDULED_AGENT_MODEL_ID: "scheduled-model",
}));

vi.mock("../../src/lib/config", () => ({
  MODELS_MAP: { "scheduled-model": { premium: true } },
}));

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)(ctx, args);

type Row = Record<string, unknown> & { _id: string };
interface Job {
  _id: string;
  name: string;
  args: unknown;
  scheduledTime: number;
  state: { kind: "pending" | "inProgress" | "success" | "canceled" };
}
type FunctionRef = Parameters<typeof getFunctionName>[0];

const USER_ID = "users:user1";
// Saturday Oct 31, 2026 09:00 in New York (EDT); clocks fall back the next night.
const NOW = Date.parse("2026-10-31T13:00:00Z");
const NEXT_DAY_9AM_NY = Date.parse("2026-11-01T14:00:00Z");
const MINUTE = 60 * 1000;

function createFakeCtx() {
  const tables = new Map<string, Row[]>();
  const jobs: Job[] = [];
  let nextId = 0;

  const rows = (table: string): Row[] => {
    const existing = tables.get(table);
    if (existing) {
      return existing;
    }
    const created: Row[] = [];
    tables.set(table, created);
    return created;
  };
  const find = (id: string) => [...tables.values()].flat().find((row) => row._id === id) ?? null;
  const addJob = (
    scheduledTime: number,
    ref: FunctionRef,
    args: unknown,
    kind: Job["state"]["kind"] = "pending",
  ) => {
    const _id = `_scheduled_functions:${++nextId}`;
    jobs.push({ _id, name: getFunctionName(ref), args, scheduledTime, state: { kind } });
    return _id;
  };

  const db = {
    get: async (tableOrId: string, id?: string) => find(id ?? tableOrId),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${++nextId}`;
      rows(table).push({ ...doc, _id });
      return _id;
    },
    patch: async (_table: string, id: string, fields: Record<string, unknown>) => {
      const row = find(id);
      if (!row) {
        throw new Error(`Document ${id} not found`);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
          delete row[key];
        } else {
          row[key] = value;
        }
      }
    },
    delete: async (table: string, id: string) => {
      tables.set(
        table,
        rows(table).filter((row) => row._id !== id),
      );
    },
    query: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let descending = false;
      const results = () => {
        const matched = rows(table).filter((row) => filters.every(([f, v]) => row[f] === v));
        return descending ? [...matched].reverse() : matched;
      };
      const eqBuilder = {
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return eqBuilder;
        },
      };
      const builder = {
        withIndex: (_index: string, range?: (q: typeof eqBuilder) => unknown) => {
          range?.(eqBuilder);
          return builder;
        },
        order: (direction: "asc" | "desc") => {
          descending = direction === "desc";
          return builder;
        },
        collect: async () => results(),
        take: async (n: number) => results().slice(0, n),
        unique: async () => results()[0] ?? null,
        paginate: async () => ({ page: results(), isDone: true, continueCursor: "" }),
      };
      return builder;
    },
    system: {
      get: async (_table: string, id: string) => jobs.find((job) => job._id === id) ?? null,
    },
  };

  const scheduler = {
    runAt: async (timestamp: number, ref: FunctionRef, args: unknown) =>
      addJob(timestamp, ref, args),
    runAfter: async (delayMs: number, ref: FunctionRef, args: unknown) =>
      addJob(Date.now() + delayMs, ref, args),
    cancel: async (id: string) => {
      const job = jobs.find((j) => j._id === id);
      if (job?.state.kind !== "pending") {
        throw new Error(`Cannot cancel ${id}`);
      }
      job.state = { kind: "canceled" };
    },
  };

  return { ctx: { db, scheduler }, rows, find, jobs, addJob };
}

type Fake = ReturnType<typeof createFakeCtx>;

// getFunctionName also accepts a plain "module:function" string
const executeTaskRef = "scheduled_ai:executeTask" as unknown as FunctionRef;

async function seedTask(fake: Fake, fields: Record<string, unknown> = {}) {
  return await fake.ctx.db.insert("scheduled_tasks", {
    userId: USER_ID,
    title: "Morning brief",
    prompt: "Summarize my inbox",
    scheduleType: "daily",
    scheduledTime: "09:00",
    timezone: "America/New_York",
    status: "active",
    createdAt: NOW - 7 * 24 * 60 * MINUTE,
    ...fields,
  });
}

/** Seeds a task whose scheduled job for this morning is currently executing. */
async function seedDueTask(fake: Fake, fields: Record<string, unknown> = {}) {
  const jobId = fake.addJob(NOW, executeTaskRef, {}, "inProgress");
  const taskId = await seedTask(fake, {
    scheduledFunctionId: jobId,
    nextExecution: NOW,
    ...fields,
  });
  return { taskId, jobId };
}

const pendingJobs = (fake: Fake, name: string) =>
  fake.jobs.filter((job) => job.name === name && job.state.kind === "pending");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("claimTaskExecution", () => {
  it("books the next local occurrence, marks the task running, and records history", async () => {
    const fake = createFakeCtx();
    const { taskId } = await seedDueTask(fake);

    const claimed = await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_1" });

    expect(claimed).toMatchObject({ status: "running", lastExecuted: NOW });
    const [nextRun] = pendingJobs(fake, "scheduled_ai:executeTask");
    expect(nextRun).toMatchObject({ scheduledTime: NEXT_DAY_9AM_NY, args: { taskId } });
    expect(fake.find(taskId)).toMatchObject({
      nextExecution: NEXT_DAY_9AM_NY,
      scheduledFunctionId: nextRun._id,
    });
    expect(fake.rows("task_history")).toEqual([
      expect.objectContaining({ taskId, executionId: "exec_1", status: "running", startTime: NOW }),
    ]);
    expect(pendingJobs(fake, "scheduled_tasks:expireTaskExecution")).toEqual([
      expect.objectContaining({ scheduledTime: NOW + 15 * MINUTE }),
    ]);
  });

  it("skips a scheduled run during a live manual run but keeps the chain going", async () => {
    const fake = createFakeCtx();
    const { taskId } = await seedDueTask(fake, {
      status: "running",
      lastExecuted: NOW - 2 * MINUTE,
    });

    expect(await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_2" })).toBeNull();

    expect(fake.find(taskId)).toMatchObject({ status: "running", nextExecution: NEXT_DAY_9AM_NY });
    expect(pendingJobs(fake, "scheduled_ai:executeTask")).toHaveLength(1);
    expect(fake.rows("task_history")).toHaveLength(0);
  });

  it("takes over a running claim older than 15 minutes", async () => {
    const fake = createFakeCtx();
    const { taskId } = await seedDueTask(fake, {
      status: "running",
      lastExecuted: NOW - 20 * MINUTE,
    });

    const claimed = await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_3" });

    expect(claimed).toMatchObject({ status: "running", lastExecuted: NOW });
  });

  it("drops a stray scheduled run when the task's chain is pending in the future", async () => {
    const fake = createFakeCtx();
    const futureJob = fake.addJob(NEXT_DAY_9AM_NY, executeTaskRef, {});
    const taskId = await seedTask(fake, { scheduledFunctionId: futureJob });

    expect(await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_4" })).toBeNull();

    expect(fake.find(taskId)).toMatchObject({ status: "active", scheduledFunctionId: futureJob });
    expect(fake.jobs).toHaveLength(1);
  });

  it("does not reschedule for a manual run", async () => {
    const fake = createFakeCtx();
    const futureJob = fake.addJob(NEXT_DAY_9AM_NY, executeTaskRef, {});
    const taskId = await seedTask(fake, { scheduledFunctionId: futureJob });

    const claimed = await call(claimTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_5",
      isManualTrigger: true,
    });

    expect(claimed).toMatchObject({ status: "running", scheduledFunctionId: futureJob });
    expect(pendingJobs(fake, "scheduled_ai:executeTask")).toHaveLength(1);
  });

  it("ignores paused tasks", async () => {
    const fake = createFakeCtx();
    const taskId = await seedTask(fake, { status: "paused" });

    expect(await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_6" })).toBeNull();
    expect(fake.jobs).toHaveLength(0);
  });
});

describe("finishTaskExecution / expireTaskExecution", () => {
  async function claim(fake: Fake, fields: Record<string, unknown> = {}, isManualTrigger = false) {
    const { taskId } = await seedDueTask(fake, fields);
    await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_1", isManualTrigger });
    return taskId;
  }

  it("returns a recurring task to active after a failure with its next run still booked", async () => {
    const fake = createFakeCtx();
    const taskId = await claim(fake);

    await call(finishTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_1",
      outcome: "failure",
      errorMessage: "provider down",
    });

    expect(fake.find(taskId)).toMatchObject({ status: "active", nextExecution: NEXT_DAY_9AM_NY });
    expect(pendingJobs(fake, "scheduled_ai:executeTask")).toHaveLength(1);
    expect(fake.rows("task_history")[0]).toMatchObject({
      status: "failure",
      errorMessage: "provider down",
    });
  });

  it("archives a one-time task after a failed manual run and cancels its scheduled run", async () => {
    const fake = createFakeCtx();
    const futureJob = fake.addJob(NEXT_DAY_9AM_NY, executeTaskRef, {});
    const taskId = await seedTask(fake, {
      scheduleType: "onetime",
      scheduledDate: "2026-11-01",
      scheduledFunctionId: futureJob,
    });
    await call(claimTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_1",
      isManualTrigger: true,
    });

    await call(finishTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_1",
      outcome: "failure",
    });

    const task = fake.find(taskId);
    expect(task).toMatchObject({ status: "archived" });
    expect(task).not.toHaveProperty("scheduledFunctionId");
    expect(fake.jobs.find((job) => job._id === futureJob)?.state.kind).toBe("canceled");
  });

  it("pauses the task and cancels the booked run when a usage limit stops the run", async () => {
    const fake = createFakeCtx();
    const taskId = await claim(fake);

    await call(finishTaskExecution, fake.ctx, { taskId, executionId: "exec_1", outcome: "paused" });

    expect(fake.find(taskId)).toMatchObject({ status: "paused" });
    expect(pendingJobs(fake, "scheduled_ai:executeTask")).toHaveLength(0);
    expect(fake.rows("task_history")[0]).toMatchObject({ status: "cancelled" });
  });

  it("expires a run that never finished, and a late finish is then a no-op", async () => {
    const fake = createFakeCtx();
    const taskId = await claim(fake);

    await call(expireTaskExecution, fake.ctx, { taskId, executionId: "exec_1" });
    expect(fake.find(taskId)).toMatchObject({ status: "active" });
    expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });

    await call(finishTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_1",
      outcome: "success",
    });
    expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });
  });

  it("leaves a task alone once a later claim has taken it over", async () => {
    const fake = createFakeCtx();
    const taskId = await claim(fake);
    await fake.ctx.db.patch("scheduled_tasks", taskId, { lastExecuted: NOW + 16 * MINUTE });

    await call(expireTaskExecution, fake.ctx, { taskId, executionId: "exec_1" });

    expect(fake.find(taskId)).toMatchObject({ status: "running" });
  });

  it("keeps only the newest 30 history rows", async () => {
    const fake = createFakeCtx();
    const taskId = await seedTask(fake);
    for (let i = 0; i < 31; i++) {
      await fake.ctx.db.insert("task_history", {
        taskId,
        executionId: `old_${i}`,
        status: "success",
        startTime: NOW - (40 - i) * 24 * 60 * MINUTE,
        createdAt: NOW,
      });
    }
    await fake.ctx.db.patch("scheduled_tasks", taskId, {
      scheduledFunctionId: fake.addJob(NOW, executeTaskRef, {}, "inProgress"),
    });
    await call(claimTaskExecution, fake.ctx, { taskId, executionId: "exec_1" });

    await call(finishTaskExecution, fake.ctx, {
      taskId,
      executionId: "exec_1",
      outcome: "success",
    });

    const history = fake.rows("task_history");
    expect(history).toHaveLength(30);
    expect(history.map((row) => row.executionId)).not.toContain("old_0");
    expect(history.map((row) => row.executionId)).not.toContain("old_1");
  });
});

describe("updateScheduledTask", () => {
  it("rejects updates while a run is in progress", async () => {
    const fake = createFakeCtx();
    const taskId = await seedTask(fake, { status: "running", lastExecuted: NOW });

    const update = call(updateScheduledTask, fake.ctx, { taskId, status: "paused" });

    await expect(update).rejects.toBeInstanceOf(ConvexError);
    await expect(update).rejects.toMatchObject({ data: ERROR_CODES.UNSUPPORTED_OPERATION });
  });

  it("enforces the task limits when resuming", async () => {
    const fake = createFakeCtx();
    for (let i = 0; i < 10; i++) {
      await seedTask(fake, { scheduleType: "weekly", scheduledTime: "1:09:00" });
    }
    const taskId = await seedTask(fake, { status: "paused" });

    await expect(call(updateScheduledTask, fake.ctx, { taskId, status: "active" })).rejects.toThrow(
      "Total task limit reached (max 10)",
    );
    expect(fake.find(taskId)).toMatchObject({ status: "paused" });
  });

  it("enforces the daily limit when an active task changes to daily", async () => {
    const fake = createFakeCtx();
    for (let i = 0; i < 5; i++) {
      await seedTask(fake);
    }
    const taskId = await seedTask(fake, { scheduleType: "weekly", scheduledTime: "1:09:00" });

    await expect(
      call(updateScheduledTask, fake.ctx, {
        taskId,
        scheduleType: "daily",
        scheduledTime: "08:00",
      }),
    ).rejects.toThrow("Daily task limit reached (max 5)");
  });

  it("schedules the next local run when resuming", async () => {
    const fake = createFakeCtx();
    const taskId = await seedTask(fake, { status: "paused", scheduledTime: "10:00" });

    await call(updateScheduledTask, fake.ctx, { taskId, status: "active" });

    const [run] = pendingJobs(fake, "scheduled_ai:executeTask");
    expect(run.scheduledTime).toBe(Date.parse("2026-10-31T14:00:00Z"));
    expect(fake.find(taskId)).toMatchObject({ status: "active", scheduledFunctionId: run._id });
  });

  it("rejects an invalid time zone with INVALID_INPUT, even on a paused task", async () => {
    const fake = createFakeCtx();
    const taskId = await seedTask(fake, { status: "paused" });

    const update = call(updateScheduledTask, fake.ctx, { taskId, timezone: "Not/AZone" });

    await expect(update).rejects.toBeInstanceOf(ConvexError);
    await expect(update).rejects.toMatchObject({ data: ERROR_CODES.INVALID_INPUT });
  });
});

describe("deleteScheduledTask", () => {
  it("cancels the pending run and deletes the task's history", async () => {
    const fake = createFakeCtx();
    const futureJob = fake.addJob(NEXT_DAY_9AM_NY, executeTaskRef, {});
    const taskId = await seedTask(fake, { scheduledFunctionId: futureJob });
    const otherTaskId = await seedTask(fake);
    for (const id of [taskId, taskId, otherTaskId]) {
      await fake.ctx.db.insert("task_history", { taskId: id, status: "success", startTime: NOW });
    }

    await call(deleteScheduledTask, fake.ctx, { taskId });

    expect(fake.find(taskId)).toBeNull();
    expect(fake.rows("task_history").map((row) => row.taskId)).toEqual([otherTaskId]);
    expect(fake.jobs[0].state.kind).toBe("canceled");
  });
});

describe("pauseDeadTasks", () => {
  it("pauses active tasks without a pending run and stale running tasks only", async () => {
    const fake = createFakeCtx();
    const healthy = await seedTask(fake, {
      scheduledFunctionId: fake.addJob(NEXT_DAY_9AM_NY, executeTaskRef, {}),
    });
    const dead = await seedTask(fake, {
      scheduledFunctionId: fake.addJob(NOW - 60 * MINUTE, executeTaskRef, {}, "success"),
    });
    const live = await seedTask(fake, { status: "running", lastExecuted: NOW - 5 * MINUTE });
    const stuck = await seedTask(fake, { status: "running", lastExecuted: NOW - 60 * MINUTE });
    await fake.ctx.db.insert("task_history", { taskId: stuck, status: "running", startTime: NOW });

    const result = await call(pauseDeadTasks, fake.ctx, {});

    expect(result).toEqual({ scanned: 4, paused: 2, isDone: true });
    expect(fake.find(healthy)).toMatchObject({ status: "active" });
    expect(fake.find(dead)).toMatchObject({ status: "paused" });
    expect(fake.find(dead)).not.toHaveProperty("scheduledFunctionId");
    expect(fake.find(live)).toMatchObject({ status: "running" });
    expect(fake.find(stuck)).toMatchObject({ status: "paused" });
    expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });
  });
});
