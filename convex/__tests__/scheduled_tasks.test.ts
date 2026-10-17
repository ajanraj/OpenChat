import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../../src/lib/error-codes";
import type { Id } from "../_generated/dataModel";
import type { ensureAuthenticated } from "../lib/auth_helper";
import {
  deleteScheduledTask,
  expireTaskExecution,
  finishTaskExecution,
  migrateScheduledRuns,
  startScheduledRun,
  triggerScheduledTask,
  updateScheduledTask,
} from "../scheduled_tasks";
import type { hasActivePremium } from "../stripe";

/**
 * Run-lifecycle tests for scheduled tasks against an in-memory ctx
 * (convex-test is not installed, so handlers are called directly).
 */

const mocks = vi.hoisted(() => {
  // Ids are plain strings at runtime; the fake ones here carry their table as a prefix
  const prefix = "users:";
  const isUserId = (id: string): id is Id<"users"> => id.startsWith(prefix);
  const userId = `${prefix}user1`;
  if (!isUserId(userId)) {
    throw new TypeError(`Not a users id: ${userId}`);
  }
  return { userId };
});

vi.mock(import("../lib/auth_helper"), () => ({
  ensureAuthenticated: vi
    .fn<typeof ensureAuthenticated>()
    .mockResolvedValue(mocks.userId),
}));

vi.mock(import("../stripe"), () => ({
  hasActivePremium: vi.fn<typeof hasActivePremium>().mockResolvedValue(true),
}));

type Row = Record<string, unknown> & { _id: string };
interface Job {
  _id: string;
  name: string;
  args: Record<string, unknown>;
  scheduledTime: number;
  state: { kind: "pending" | "inProgress" | "success" | "failed" | "canceled" };
}
type FunctionRef = Parameters<typeof getFunctionName>[0];

const USER_ID = mocks.userId;
// Saturday Oct 31, 2026 09:00 in New York (EDT); clocks fall back the next night.
const NOW = Date.parse("2026-10-31T13:00:00Z");
const NEXT_DAY_9AM_NY = Date.parse("2026-11-01T14:00:00Z");
const MINUTE = 60 * 1000;

const createFakeCtx = () => {
  const tables = new Map<string, Row[]>();
  const jobs: Job[] = [];
  let nextId = 0;
  const newId = (table: string) => {
    nextId += 1;
    return `${table}:${nextId}`;
  };

  const rows = (table: string): Row[] => {
    const existing = tables.get(table);
    if (existing) {
      return existing;
    }
    const created: Row[] = [];
    tables.set(table, created);
    return created;
  };
  const find = (id: string) =>
    [...tables.values()].flat().find((row) => row._id === id) ?? null;
  // Tests book jobs by "module:function" name; the code under test passes function references
  const addJob = (
    scheduledTime: number,
    ref: FunctionRef | string,
    args: Record<string, unknown>,
    kind: Job["state"]["kind"] = "pending"
  ) => {
    const _id = newId("_scheduled_functions");
    jobs.push({
      _id,
      name: typeof ref === "string" ? ref : getFunctionName(ref),
      args,
      scheduledTime,
      state: { kind },
    });
    return _id;
  };

  // The handlers await every call, so plain return values stand in for Convex's promises
  const db = {
    // A copy, like Convex: later patches do not show through an earlier read
    get: (tableOrId: string, id?: string) => {
      const row = find(id ?? tableOrId);
      return row ? { ...row } : null;
    },
    insert: (table: string, doc: Record<string, unknown>) => {
      const _id = newId(table);
      rows(table).push({ ...doc, _id });
      return _id;
    },
    patch: (_table: string, id: string, fields: Record<string, unknown>) => {
      const row = find(id);
      if (!row) {
        throw new Error(`Document ${id} not found`);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
          Reflect.deleteProperty(row, key);
        } else {
          row[key] = value;
        }
      }
    },
    delete: (table: string, id: string) => {
      tables.set(
        table,
        rows(table).filter((row) => row._id !== id)
      );
    },
    query: (table: string) => {
      const filters: [string, unknown][] = [];
      let descending = false;
      const results = () => {
        const matched = rows(table).filter((row) =>
          filters.every(([f, v]) => row[f] === v)
        );
        return descending ? matched.toReversed() : matched;
      };
      const eqBuilder = {
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return eqBuilder;
        },
      };
      const builder = {
        withIndex: (
          _index: string,
          range?: (q: typeof eqBuilder) => unknown
        ) => {
          range?.(eqBuilder);
          return builder;
        },
        order: (direction: "asc" | "desc") => {
          descending = direction === "desc";
          return builder;
        },
        collect: () => results(),
        take: (n: number) => results().slice(0, n),
        unique: () => results()[0] ?? null,
        paginate: ({
          numItems,
          cursor,
        }: {
          numItems: number;
          cursor: string | null;
        }) => {
          const start = cursor !== null && cursor !== "" ? Number(cursor) : 0;
          const end = start + numItems;
          const all = results();
          return {
            page: all.slice(start, end),
            isDone: end >= all.length,
            continueCursor: `${end}`,
          };
        },
      };
      return builder;
    },
    system: {
      get: (_table: string, id: string) =>
        jobs.find((job) => job._id === id) ?? null,
      // Like Convex: null for an id of another table
      normalizeId: (table: string, id: string) =>
        id.startsWith(`${table}:`) ? id : null,
    },
  };

  const scheduler = {
    runAt: (
      timestamp: number,
      ref: FunctionRef,
      args: Record<string, unknown>
    ) => addJob(timestamp, ref, args),
    runAfter: (
      delayMs: number,
      ref: FunctionRef,
      args: Record<string, unknown>
    ) => addJob(Date.now() + delayMs, ref, args),
    cancel: (id: string) => {
      const job = jobs.find((j) => j._id === id);
      if (job?.state.kind !== "pending") {
        throw new Error(`Cannot cancel ${id}`);
      }
      job.state = { kind: "canceled" };
    },
  };

  return { ctx: { db, scheduler }, rows, find, jobs, addJob };
};

type Fake = ReturnType<typeof createFakeCtx>;

type Handler = (
  ctx: Fake["ctx"],
  args: Record<string, unknown>
) => Promise<unknown>;

const isHandler = (fn: unknown): fn is Handler => typeof fn === "function";

// Convex keeps each registered function's handler on `_handler`; tests call it directly
const call = async (
  fn: object,
  ctx: Fake["ctx"],
  args: Record<string, unknown>
) => {
  const handler = "_handler" in fn ? fn._handler : undefined;
  if (!isHandler(handler)) {
    throw new TypeError("Expected a registered Convex function");
  }
  return await handler(ctx, args);
};

const RUN = "scheduled_tasks:startScheduledRun";
const ACTION = "scheduled_ai:executeTask";
const EXPIRE = "scheduled_tasks:expireTaskExecution";
// A timed run booked by the old code; _scheduled_functions names include the ".js" extension
const LEGACY_RUN = "scheduled_ai.js:executeTask";

const seedTask = (fake: Fake, fields: Record<string, unknown> = {}) =>
  fake.ctx.db.insert("scheduled_tasks", {
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

/** Seeds a task whose scheduled job for this morning is currently executing. */
const seedDueTask = (
  fake: Fake,
  fields: Record<string, unknown> = {},
  jobState: Job["state"]["kind"] = "inProgress"
) => {
  const jobId = fake.addJob(NOW, RUN, {}, jobState);
  const taskId = seedTask(fake, {
    scheduledFunctionId: jobId,
    nextExecution: NOW,
    ...fields,
  });
  return { taskId, jobId };
};

const pendingJobs = (fake: Fake, name: string) =>
  fake.jobs.filter((job) => job.name === name && job.state.kind === "pending");

/** The run claimed for a task: its history row's executionId and the action job it scheduled. */
const claimedRun = (fake: Fake, taskId: string) => {
  const row = fake
    .rows("task_history")
    .find((r) => r.taskId === taskId && r.status === "running");
  const executionId = row?.executionId;
  const action = pendingJobs(fake, ACTION).find(
    (job) => job.args.executionId === executionId
  );
  return { row, executionId, action };
};

/** Claims this morning's timed run and returns the task and the run's executionId. */
const claim = async (fake: Fake, fields: Record<string, unknown> = {}) => {
  const { taskId } = seedDueTask(fake, fields);
  await call(startScheduledRun, fake.ctx, { taskId });
  return { taskId, executionId: claimedRun(fake, taskId).executionId };
};

/** Each named task's status, to assert several tasks at once. */
const statusesOf = (fake: Fake, taskIds: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(taskIds).map(([name, taskId]) => [
      name,
      fake.find(taskId)?.status,
    ])
  );

/**
 * Seeds one task of each kind pauseAll handles (with a live claim among them), then runs the
 * migration with pauseAll.
 */
const migrateWithPauseAll = async () => {
  const fake = createFakeCtx();
  const activeJob = fake.addJob(NEXT_DAY_9AM_NY, LEGACY_RUN, {});
  const active = seedTask(fake, { scheduledFunctionId: activeJob });
  const { taskId: live } = seedDueTask(fake);
  await call(startScheduledRun, fake.ctx, { taskId: live });
  const liveRun = claimedRun(fake, live);
  const stuck = seedTask(fake, {
    status: "running",
    lastExecuted: NOW - 60 * MINUTE,
  });
  fake.ctx.db.insert("task_history", {
    taskId: stuck,
    status: "running",
    startTime: NOW,
  });
  // A run the old code started before the deploy: its row starts before the task's lastExecuted
  const oldRun = seedTask(fake, {
    status: "running",
    lastExecuted: NOW - 5 * MINUTE,
  });
  fake.ctx.db.insert("task_history", {
    taskId: oldRun,
    status: "running",
    startTime: NOW - 5 * MINUTE - 2000,
  });
  const paused = seedTask(fake, { status: "paused" });
  const archived = seedTask(fake, { status: "archived" });

  const result = await call(migrateScheduledRuns, fake.ctx, {
    pauseAll: true,
  });
  return {
    fake,
    result,
    activeJob,
    liveRun,
    ids: { active, live, stuck, oldRun, paused, archived },
  };
};

describe("scheduled task run lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startScheduledRun internal mutation", () => {
    it("books the next local occurrence, claims the run, and starts the action", async () => {
      const fake = createFakeCtx();
      const { taskId } = seedDueTask(fake);

      await call(startScheduledRun, fake.ctx, { taskId });

      const [nextRun] = pendingJobs(fake, RUN);
      const task = fake.find(taskId);
      expect({ nextRun, task }).toMatchObject({
        nextRun: { scheduledTime: NEXT_DAY_9AM_NY, args: { taskId } },
        task: {
          status: "running",
          lastExecuted: NOW,
          nextExecution: NEXT_DAY_9AM_NY,
          scheduledFunctionId: nextRun._id,
        },
      });
      const { row, executionId, action } = claimedRun(fake, taskId);
      expect(row).toMatchObject({
        status: "running",
        startTime: NOW,
        isManualTrigger: false,
      });
      expect(executionId).toBeTypeOf("string");
      // The action gets the task as stored after the claim
      expect(action).toMatchObject({
        scheduledTime: NOW,
        args: { task, executionId },
      });
      expect(pendingJobs(fake, EXPIRE)).toStrictEqual([
        expect.objectContaining({
          scheduledTime: NOW + 20 * MINUTE,
          args: { taskId, executionId },
        }),
      ]);
    });

    it("claims while its own job still reads as pending", async () => {
      const fake = createFakeCtx();
      const { taskId } = seedDueTask(fake, {}, "pending");

      await call(startScheduledRun, fake.ctx, { taskId });

      expect(fake.find(taskId)).toMatchObject({
        status: "running",
        lastExecuted: NOW,
      });
      expect(pendingJobs(fake, ACTION)).toHaveLength(1);
    });

    it("skips a timed run during a live manual run but keeps the chain going", async () => {
      const fake = createFakeCtx();
      const { taskId } = seedDueTask(fake, {
        status: "running",
        lastExecuted: NOW - 2 * MINUTE,
      });

      await call(startScheduledRun, fake.ctx, { taskId });

      expect(fake.find(taskId)).toMatchObject({
        status: "running",
        lastExecuted: NOW - 2 * MINUTE,
        nextExecution: NEXT_DAY_9AM_NY,
      });
      expect(pendingJobs(fake, RUN)).toHaveLength(1);
      expect(pendingJobs(fake, ACTION)).toHaveLength(0);
      expect(fake.rows("task_history")).toHaveLength(0);
    });

    it("takes over a running claim older than 20 minutes", async () => {
      const fake = createFakeCtx();
      const { taskId } = seedDueTask(fake, {
        status: "running",
        lastExecuted: NOW - 21 * MINUTE,
      });

      await call(startScheduledRun, fake.ctx, { taskId });

      expect(fake.find(taskId)).toMatchObject({
        status: "running",
        lastExecuted: NOW,
      });
      expect(pendingJobs(fake, ACTION)).toHaveLength(1);
    });

    it("drops a stray timed run when the task's chain is pending in the future", async () => {
      const fake = createFakeCtx();
      const futureJob = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const taskId = seedTask(fake, { scheduledFunctionId: futureJob });

      await call(startScheduledRun, fake.ctx, { taskId });

      expect(fake.find(taskId)).toMatchObject({
        status: "active",
        scheduledFunctionId: futureJob,
      });
      expect(fake.jobs).toHaveLength(1);
      expect(fake.rows("task_history")).toHaveLength(0);
    });

    it("ignores paused and deleted tasks", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake, { status: "paused" });

      await call(startScheduledRun, fake.ctx, { taskId });
      await call(startScheduledRun, fake.ctx, {
        taskId: "scheduled_tasks:deleted",
      });

      expect(fake.jobs).toHaveLength(0);
      expect(fake.rows("task_history")).toHaveLength(0);
    });
  });

  describe("triggerScheduledTask mutation", () => {
    it("claims a manual run and starts the action without touching the schedule", async () => {
      const fake = createFakeCtx();
      const futureJob = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const taskId = seedTask(fake, {
        scheduledFunctionId: futureJob,
        nextExecution: NEXT_DAY_9AM_NY,
      });

      await call(triggerScheduledTask, fake.ctx, { taskId });

      expect(fake.find(taskId)).toMatchObject({
        status: "running",
        lastExecuted: NOW,
        nextExecution: NEXT_DAY_9AM_NY,
        scheduledFunctionId: futureJob,
      });
      expect(pendingJobs(fake, RUN)).toHaveLength(1);
      const { row, action } = claimedRun(fake, taskId);
      expect(row).toMatchObject({ isManualTrigger: true });
      expect(action).toBeDefined();
    });

    it("rejects a second trigger while the first run holds the task", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake);
      await call(triggerScheduledTask, fake.ctx, { taskId });

      const second = call(triggerScheduledTask, fake.ctx, { taskId });

      await expect(second).rejects.toMatchObject({
        data: ERROR_CODES.UNSUPPORTED_OPERATION,
      });
      expect(pendingJobs(fake, ACTION)).toHaveLength(1);
    });
  });

  describe("finishTaskExecution / expireTaskExecution", () => {
    it("returns a recurring task to active after a failure with its next run still booked", async () => {
      const fake = createFakeCtx();
      const { taskId, executionId } = await claim(fake);

      await call(finishTaskExecution, fake.ctx, {
        taskId,
        executionId,
        outcome: "failure",
        errorMessage: "provider down",
      });

      expect(fake.find(taskId)).toMatchObject({
        status: "active",
        nextExecution: NEXT_DAY_9AM_NY,
      });
      expect(pendingJobs(fake, RUN)).toHaveLength(1);
      expect(fake.rows("task_history")[0]).toMatchObject({
        status: "failure",
        errorMessage: "provider down",
      });
    });

    it("archives a one-time task after a failed manual run and cancels its scheduled run", async () => {
      const fake = createFakeCtx();
      const futureJob = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const taskId = seedTask(fake, {
        scheduleType: "onetime",
        scheduledDate: "2026-11-01",
        scheduledFunctionId: futureJob,
      });
      await call(triggerScheduledTask, fake.ctx, { taskId });

      await call(finishTaskExecution, fake.ctx, {
        taskId,
        executionId: claimedRun(fake, taskId).executionId,
        outcome: "failure",
      });

      const task = fake.find(taskId);
      expect(task).toMatchObject({ status: "archived" });
      expect(task).not.toHaveProperty("scheduledFunctionId");
      expect(fake.jobs.find((job) => job._id === futureJob)?.state.kind).toBe(
        "canceled"
      );
    });

    it("pauses the task and cancels the booked run when a usage limit stops the run", async () => {
      const fake = createFakeCtx();
      const { taskId, executionId } = await claim(fake);

      await call(finishTaskExecution, fake.ctx, {
        taskId,
        executionId,
        outcome: "paused",
      });

      expect(fake.find(taskId)).toMatchObject({ status: "paused" });
      expect(pendingJobs(fake, RUN)).toHaveLength(0);
      expect(fake.rows("task_history")[0]).toMatchObject({
        status: "cancelled",
      });
    });

    it("expires a run that never finished, and a late finish is then a no-op", async () => {
      const fake = createFakeCtx();
      const { taskId, executionId } = await claim(fake);

      await call(expireTaskExecution, fake.ctx, { taskId, executionId });
      expect(fake.find(taskId)).toMatchObject({ status: "active" });
      expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });

      await call(finishTaskExecution, fake.ctx, {
        taskId,
        executionId,
        outcome: "success",
      });
      expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });
    });

    it("leaves a task alone once a later claim has taken it over", async () => {
      const fake = createFakeCtx();
      const { taskId, executionId } = await claim(fake);
      fake.ctx.db.patch("scheduled_tasks", taskId, {
        lastExecuted: NOW + 21 * MINUTE,
      });

      await call(expireTaskExecution, fake.ctx, { taskId, executionId });

      expect(fake.find(taskId)).toMatchObject({ status: "running" });
    });

    it("keeps only the newest 30 history rows", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake);
      for (let i = 0; i < 31; i += 1) {
        fake.ctx.db.insert("task_history", {
          taskId,
          executionId: `old_${i}`,
          status: "success",
          startTime: NOW - (40 - i) * 24 * 60 * MINUTE,
          createdAt: NOW,
        });
      }
      fake.ctx.db.patch("scheduled_tasks", taskId, {
        scheduledFunctionId: fake.addJob(NOW, RUN, {}, "inProgress"),
      });
      await call(startScheduledRun, fake.ctx, { taskId });

      await call(finishTaskExecution, fake.ctx, {
        taskId,
        executionId: claimedRun(fake, taskId).executionId,
        outcome: "success",
      });

      const history = fake.rows("task_history");
      expect(history).toHaveLength(30);
      expect(history.map((row) => row.executionId)).not.toContain("old_0");
      expect(history.map((row) => row.executionId)).not.toContain("old_1");
    });
  });

  describe("updateScheduledTask mutation", () => {
    it("rejects updates while a run is in progress", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake, {
        status: "running",
        lastExecuted: NOW,
      });

      const update = call(updateScheduledTask, fake.ctx, {
        taskId,
        status: "paused",
      });

      await expect(update).rejects.toBeInstanceOf(ConvexError);
      await expect(update).rejects.toMatchObject({
        data: ERROR_CODES.UNSUPPORTED_OPERATION,
      });
    });

    it("enforces the task limits when resuming", async () => {
      const fake = createFakeCtx();
      for (let i = 0; i < 10; i += 1) {
        seedTask(fake, {
          scheduleType: "weekly",
          scheduledTime: "1:09:00",
        });
      }
      const taskId = seedTask(fake, { status: "paused" });

      await expect(
        call(updateScheduledTask, fake.ctx, { taskId, status: "active" })
      ).rejects.toThrow("Total task limit reached (max 10)");
      expect(fake.find(taskId)).toMatchObject({ status: "paused" });
    });

    it("enforces the daily limit when an active task changes to daily", async () => {
      const fake = createFakeCtx();
      for (let i = 0; i < 5; i += 1) {
        seedTask(fake);
      }
      const taskId = seedTask(fake, {
        scheduleType: "weekly",
        scheduledTime: "1:09:00",
      });

      await expect(
        call(updateScheduledTask, fake.ctx, {
          taskId,
          scheduleType: "daily",
          scheduledTime: "08:00",
        })
      ).rejects.toThrow("Daily task limit reached (max 5)");
    });

    it("schedules the next local run when resuming", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake, {
        status: "paused",
        scheduledTime: "10:00",
      });

      await call(updateScheduledTask, fake.ctx, { taskId, status: "active" });

      const [run] = pendingJobs(fake, RUN);
      expect(run.scheduledTime).toBe(Date.parse("2026-10-31T14:00:00Z"));
      expect(fake.find(taskId)).toMatchObject({
        status: "active",
        scheduledFunctionId: run._id,
      });
    });

    it("rejects an invalid time zone with INVALID_INPUT, even on a paused task", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake, { status: "paused" });

      const update = call(updateScheduledTask, fake.ctx, {
        taskId,
        timezone: "Not/AZone",
      });

      await expect(update).rejects.toBeInstanceOf(ConvexError);
      await expect(update).rejects.toMatchObject({
        data: ERROR_CODES.INVALID_INPUT,
      });
    });
  });

  describe("deleteScheduledTask mutation", () => {
    it("cancels the pending run and deletes the task's history", async () => {
      const fake = createFakeCtx();
      const futureJob = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const taskId = seedTask(fake, { scheduledFunctionId: futureJob });
      const otherTaskId = seedTask(fake);
      for (const id of [taskId, taskId, otherTaskId]) {
        fake.ctx.db.insert("task_history", {
          taskId: id,
          status: "success",
          startTime: NOW,
        });
      }

      await call(deleteScheduledTask, fake.ctx, { taskId });

      expect(fake.find(taskId)).toBeNull();
      expect(fake.rows("task_history").map((row) => row.taskId)).toStrictEqual([
        otherTaskId,
      ]);
      expect(fake.jobs[0].state.kind).toBe("canceled");
    });

    it("rejects deletion while a run is in progress", async () => {
      const fake = createFakeCtx();
      const taskId = seedTask(fake, {
        status: "running",
        lastExecuted: NOW,
      });

      const deletion = call(deleteScheduledTask, fake.ctx, { taskId });

      await expect(deletion).rejects.toMatchObject({
        data: ERROR_CODES.UNSUPPORTED_OPERATION,
      });
      expect(fake.find(taskId)).not.toBeNull();
    });
  });

  describe("migrateScheduledRuns internal mutation", () => {
    it("re-points pending runs of the old action at startScheduledRun at the same time", async () => {
      const fake = createFakeCtx();
      const legacyJob = fake.addJob(NEXT_DAY_9AM_NY, LEGACY_RUN, {
        taskId: "x",
      });
      const active = seedTask(fake, { scheduledFunctionId: legacyJob });
      // A live run whose next run the old code booked
      const legacyBooked = fake.addJob(NEXT_DAY_9AM_NY, LEGACY_RUN, {
        taskId: "y",
      });
      const running = seedTask(fake, {
        status: "running",
        lastExecuted: NOW - 5 * MINUTE,
        scheduledFunctionId: legacyBooked,
      });
      const currentJob = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const current = seedTask(fake, { scheduledFunctionId: currentJob });

      const result = await call(migrateScheduledRuns, fake.ctx, {});

      expect(result).toStrictEqual({
        scanned: 3,
        migrated: 2,
        paused: 0,
        isDone: true,
      });
      for (const [taskId, oldJob] of [
        [active, legacyJob],
        [running, legacyBooked],
      ]) {
        const newJob = fake.jobs.find(
          (job) => job._id === fake.find(taskId)?.scheduledFunctionId
        );
        expect(newJob).toMatchObject({
          name: RUN,
          args: { taskId },
          scheduledTime: NEXT_DAY_9AM_NY,
          state: { kind: "pending" },
        });
        expect(fake.jobs.find((job) => job._id === oldJob)?.state.kind).toBe(
          "canceled"
        );
      }
      expect(fake.find(active)).toMatchObject({ status: "active" });
      expect(fake.find(running)).toMatchObject({ status: "running" });
      expect(fake.find(current)).toMatchObject({
        status: "active",
        scheduledFunctionId: currentJob,
      });
    });

    it("pauses active tasks without a pending run and stale running tasks only", async () => {
      const fake = createFakeCtx();
      const healthy = seedTask(fake, {
        scheduledFunctionId: fake.addJob(NEXT_DAY_9AM_NY, RUN, {}),
      });
      const dead = seedTask(fake, {
        scheduledFunctionId: fake.addJob(NOW - 60 * MINUTE, RUN, {}, "success"),
      });
      // An old job that came due between the deploy and the migration and failed validation
      const failedLegacy = seedTask(fake, {
        scheduledFunctionId: fake.addJob(
          NOW - MINUTE,
          LEGACY_RUN,
          {},
          "failed"
        ),
      });
      const live = seedTask(fake, {
        status: "running",
        lastExecuted: NOW - 5 * MINUTE,
      });
      const stuckBooking = fake.addJob(NEXT_DAY_9AM_NY, RUN, {});
      const stuck = seedTask(fake, {
        status: "running",
        lastExecuted: NOW - 60 * MINUTE,
        scheduledFunctionId: stuckBooking,
      });
      fake.ctx.db.insert("task_history", {
        taskId: stuck,
        status: "running",
        startTime: NOW,
      });

      const result = await call(migrateScheduledRuns, fake.ctx, {});

      expect(result).toStrictEqual({
        scanned: 5,
        migrated: 0,
        paused: 3,
        isDone: true,
      });
      expect(
        statusesOf(fake, { healthy, dead, failedLegacy, live, stuck })
      ).toStrictEqual({
        healthy: "active",
        dead: "paused",
        failedLegacy: "paused",
        live: "running",
        stuck: "paused",
      });
      expect(fake.find(dead)).not.toHaveProperty("scheduledFunctionId");
      expect(
        fake.jobs.find((job) => job._id === stuckBooking)?.state.kind
      ).toBe("canceled");
      expect(fake.rows("task_history")[0]).toMatchObject({ status: "timeout" });
    });

    it("pauses every task with pauseAll and drops its booked run", async () => {
      const { fake, result, activeJob, ids } = await migrateWithPauseAll();

      expect(result).toStrictEqual({
        scanned: 6,
        migrated: 0,
        paused: 4,
        isDone: true,
      });
      expect(statusesOf(fake, ids)).toStrictEqual({
        active: "paused",
        live: "paused",
        stuck: "paused",
        oldRun: "paused",
        paused: "paused",
        archived: "archived",
      });
      // No paused task keeps a schedule
      const { archived: _archived, ...pausedIds } = ids;
      expect(
        Object.values(pausedIds)
          .map((taskId) => fake.find(taskId))
          .filter(
            (task) =>
              task !== null &&
              ("scheduledFunctionId" in task || "nextExecution" in task)
          )
      ).toStrictEqual([]);
      expect(pendingJobs(fake, RUN)).toHaveLength(0);
      expect(fake.jobs.find((job) => job._id === activeJob)?.state.kind).toBe(
        "canceled"
      );
    });

    it("times out dead runs with pauseAll, letting a live claim finish and record its outcome", async () => {
      const { fake, liveRun, ids } = await migrateWithPauseAll();
      const historyOf = (taskId: string) =>
        fake.rows("task_history").find((row) => row.taskId === taskId);

      expect({
        stuck: historyOf(ids.stuck)?.status,
        oldRun: historyOf(ids.oldRun)?.status,
        live: historyOf(ids.live)?.status,
      }).toStrictEqual({
        stuck: "timeout",
        oldRun: "timeout",
        live: "running",
      });

      await call(finishTaskExecution, fake.ctx, {
        taskId: ids.live,
        executionId: liveRun.executionId,
        outcome: "success",
      });

      expect(historyOf(ids.live)).toMatchObject({ status: "success" });
      expect(fake.find(ids.live)).toMatchObject({ status: "paused" });
    });

    it("continues past 100 tasks in a scheduled batch with the same mode", async () => {
      const fake = createFakeCtx();
      const taskIds: string[] = [];
      for (let i = 0; i < 101; i += 1) {
        taskIds.push(seedTask(fake));
      }

      const first = await call(migrateScheduledRuns, fake.ctx, {
        pauseAll: true,
      });

      expect(first).toStrictEqual({
        scanned: 100,
        migrated: 0,
        paused: 100,
        isDone: false,
      });
      const [next] = pendingJobs(fake, "scheduled_tasks:migrateScheduledRuns");
      expect(next.args).toStrictEqual({ pauseAll: true, cursor: "100" });
      expect(fake.find(taskIds[100])).toMatchObject({ status: "active" });

      const second = await call(migrateScheduledRuns, fake.ctx, next.args);

      expect(second).toStrictEqual({
        scanned: 1,
        migrated: 0,
        paused: 1,
        isDone: true,
      });
      expect(
        fake.rows("scheduled_tasks").every((task) => task.status === "paused")
      ).toBeTruthy();
    });
  });
});
