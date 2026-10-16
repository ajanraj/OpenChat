/**
 * In-memory stand-in for a mutation ctx (`db`, `scheduler`, `meta`) for unit tests, since
 * convex-test isn't installed. Index queries use the field order declared in the real schema, so
 * a test fails if code queries an index that doesn't exist or out of field order. (The name has
 * two dots so Convex doesn't deploy it and Vitest doesn't run it as a test file.)
 */
import { vi } from "vitest";
import { z } from "zod";

import type { TableNames } from "../_generated/dataModel";
import schema from "../schema";

export type Row = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};

interface Bound {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}
type RangeBuilder = Record<
  Bound["op"],
  (field: string, value: unknown) => RangeBuilder
>;
interface SearchBuilder {
  search: (field: string, text: string) => SearchBuilder;
  eq: (field: string, value: unknown) => SearchBuilder;
}

const MiB = 1024 * 1024;
const LIMITS = {
  documentsWritten: 16_000,
  documentsRead: 32_000,
  databaseQueries: 4096,
  functionsScheduled: 1000,
};

// Convex orders values by type (undefined < null < number < boolean < string), then by value
const typeRank = (value: unknown): number => {
  if (value === undefined) {
    return 0;
  }
  if (value === null) {
    return 1;
  }
  if (typeof value === "number") {
    return 2;
  }
  if (typeof value === "boolean") {
    return 3;
  }
  return 4;
};

const compareValues = (a: unknown, b: unknown): number => {
  const rankDiff = typeRank(a) - typeRank(b);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const [sa, sb] = [String(a), String(b)];
  if (sa < sb) {
    return -1;
  }
  return sa > sb ? 1 : 0;
};

// Whether a comparison result satisfies each bound operator
const BOUND_CHECKS: Record<Bound["op"], (cmp: number) => boolean> = {
  eq: (cmp) => cmp === 0,
  gt: (cmp) => cmp > 0,
  gte: (cmp) => cmp >= 0,
  lt: (cmp) => cmp < 0,
  lte: (cmp) => cmp <= 0,
};

const matchesBound = (row: Row, { field, op, value }: Bound): boolean =>
  BOUND_CHECKS[op](compareValues(row[field], value));

// The parts of the schema's deploy-time JSON the fake reads
const exportedSchema = z.object({
  tables: z.array(
    z.object({
      tableName: z.string(),
      indexes: z.array(
        z.object({ indexDescriptor: z.string(), fields: z.array(z.string()) })
      ),
      searchIndexes: z.array(
        z.object({
          indexDescriptor: z.string(),
          searchField: z.string(),
          filterFields: z.array(z.string()),
        })
      ),
    })
  ),
});
type ExportedTable = z.infer<typeof exportedSchema>["tables"][number];

// SchemaDefinition.export() is internal to Convex, so it isn't in the public type
const hasExport = (value: object): value is { export: () => string } =>
  "export" in value && typeof value.export === "function";

const exportSchemaJson = (): string => {
  if (!hasExport(schema)) {
    throw new Error("The Convex schema no longer has export()");
  }
  return schema.export();
};

// The schema's deploy-time JSON, which lists every table's indexes and search indexes
const exportedTables = exportedSchema.parse(
  JSON.parse(exportSchemaJson())
).tables;

const tableDefinition = (table: TableNames): ExportedTable => {
  const found = exportedTables.find((t) => t.tableName === table);
  if (!found) {
    throw new Error(`Table ${table} is not defined in the schema`);
  }
  return found;
};

// Like Convex, every index ends with _creationTime
const indexFields = (table: TableNames, index: string): string[] => {
  if (index === "by_creation_time") {
    return ["_creationTime"];
  }
  const found = tableDefinition(table).indexes.find(
    (i) => i.indexDescriptor === index
  );
  if (!found) {
    throw new Error(`Index ${table}.${index} is not defined in the schema`);
  }
  return [...found.fields, "_creationTime"];
};

const tokens = (text: unknown): string[] =>
  typeof text === "string"
    ? text.toLowerCase().split(/\W+/u).filter(Boolean)
    : [];

const metric = (used: number, limit: number) => ({
  used,
  remaining: limit - used,
});

export const createFakeDb = () => {
  const rows = new Map<string, { table: TableNames; doc: Row }>();
  const stats = { reads: 0, writes: 0, queries: 0, bytesRead: 0 };
  // Ids of documents handed to the code under test, in order
  const readIds: string[] = [];
  let nextId = 0;
  let clock = 1000;

  const read = (doc: Row) => {
    stats.reads += 1;
    // Approximates Convex's bytesRead metric
    stats.bytesRead += JSON.stringify(doc).length;
    readIds.push(doc._id);
    return { ...doc };
  };

  // Resolves `(table, id)` or legacy `(id)` call arguments to a row
  const findRow = (tableOrId: string, maybeId?: string) => {
    if (maybeId === undefined) {
      return rows.get(tableOrId);
    }
    const found = rows.get(maybeId);
    if (found && found.table !== tableOrId) {
      throw new Error(
        `document ${maybeId} is in table ${found.table}, not ${tableOrId}`
      );
    }
    return found;
  };

  // Mirrors the real db's async API; `await Promise.resolve(...)` keeps each method asynchronous
  class FakeQuery {
    private readonly table: TableNames;
    private readonly bounds: Bound[] = [];
    private fields: string[] = ["_creationTime"];
    private descending = false;
    private searchField: string | null = null;
    private searchTerms: string[] = [];

    constructor(table: TableNames) {
      this.table = table;
    }

    withIndex(index: string, build?: (q: RangeBuilder) => unknown) {
      this.fields = indexFields(this.table, index);
      const builder: RangeBuilder = {
        eq: (field, value) =>
          this.addBound(builder, { field, op: "eq", value }),
        gt: (field, value) =>
          this.addBound(builder, { field, op: "gt", value }),
        gte: (field, value) =>
          this.addBound(builder, { field, op: "gte", value }),
        lt: (field, value) =>
          this.addBound(builder, { field, op: "lt", value }),
        lte: (field, value) =>
          this.addBound(builder, { field, op: "lte", value }),
      };
      build?.(builder);
      // Like Convex: equalities on a prefix of the index fields, then ranges on the next field
      const eqCount = this.bounds.filter((b) => b.op === "eq").length;
      for (const [i, bound] of this.bounds.entries()) {
        const expected =
          bound.op === "eq" ? this.fields[i] : this.fields[eqCount];
        if (bound.field !== expected) {
          throw new Error(
            `${this.table}.${index}: "${bound.field}" is out of index order`
          );
        }
      }
      return this;
    }

    withSearchIndex(index: string, build: (q: SearchBuilder) => unknown) {
      const definition = tableDefinition(this.table).searchIndexes.find(
        (i) => i.indexDescriptor === index
      );
      if (!definition) {
        throw new Error(
          `Search index ${this.table}.${index} is not defined in the schema`
        );
      }
      const builder: SearchBuilder = {
        search: (field, text) => {
          if (field !== definition.searchField) {
            throw new Error(
              `${field} is not the search field of ${this.table}.${index}`
            );
          }
          this.searchField = field;
          this.searchTerms = tokens(text);
          return builder;
        },
        eq: (field, value) => {
          if (!definition.filterFields.includes(field)) {
            throw new Error(
              `${field} is not a filter field of ${this.table}.${index}`
            );
          }
          this.bounds.push({ field, op: "eq", value });
          return builder;
        },
      };
      build(builder);
      return this;
    }

    order(direction: "asc" | "desc") {
      this.descending = direction === "desc";
      return this;
    }

    filter(): never {
      throw new Error(
        `The fake db doesn't support filter() (on ${this.table}); query through an index instead`
      );
    }

    private addBound(builder: RangeBuilder, bound: Bound): RangeBuilder {
      this.bounds.push(bound);
      return builder;
    }

    private matching(): Row[] {
      const found = [...rows.values()]
        .filter(
          ({ table, doc }) =>
            table === this.table &&
            this.bounds.every((b) => matchesBound(doc, b))
        )
        .map(({ doc }) => doc);
      if (this.searchField !== null) {
        const field = this.searchField;
        const terms = this.searchTerms;
        const last = terms.at(-1);
        // Like Convex, a search with no terms matches nothing
        if (last === undefined) {
          return [];
        }
        // Any term matches a word; the last term also matches as a prefix
        return found.filter((doc) =>
          tokens(doc[field]).some(
            (word) => terms.includes(word) || word.startsWith(last)
          )
        );
      }
      found.sort((a, b) => {
        for (const key of this.fields) {
          const cmp = compareValues(a[key], b[key]);
          if (cmp !== 0) {
            return cmp;
          }
        }
        return 0;
      });
      return this.descending ? found.toReversed() : found;
    }

    async collect() {
      return await Promise.resolve(this.matching().map(read));
    }

    async take(n: number) {
      return await Promise.resolve(this.matching().slice(0, n).map(read));
    }

    async first() {
      const doc = this.matching().at(0);
      return await Promise.resolve(doc === undefined ? null : read(doc));
    }

    async unique() {
      const found = this.matching();
      if (found.length > 1) {
        throw new Error(`unique() matched ${found.length} documents`);
      }
      const doc = found.at(0);
      return await Promise.resolve(doc === undefined ? null : read(doc));
    }

    async paginate({
      numItems,
      cursor,
    }: {
      numItems: number;
      cursor: string | null;
    }) {
      const all = this.matching();
      const start = cursor === null || cursor === "" ? 0 : Number(cursor);
      const page = all.slice(start, start + numItems).map(read);
      return await Promise.resolve({
        page,
        isDone: start + numItems >= all.length,
        continueCursor: String(start + page.length),
      });
    }

    async *[Symbol.asyncIterator]() {
      for (const doc of this.matching()) {
        // Skip documents deleted while iterating
        if (rows.has(doc._id)) {
          yield read(doc);
        }
      }
    }
  }

  return {
    stats,
    readIds,
    /** Inserts a document without counting it as a write; returns its id. */
    seed(table: TableNames, doc: Record<string, unknown>): string {
      nextId += 1;
      clock += 1;
      const _id = `${table}:${nextId}`;
      rows.set(_id, { table, doc: { ...doc, _id, _creationTime: clock } });
      return _id;
    },
    /** All documents of a table, in insertion order. */
    all(table: TableNames): Row[] {
      return [...rows.values()]
        .filter((r) => r.table === table)
        .map(({ doc }) => ({ ...doc }));
    },
    // get/patch/delete accept the table-first form (`db.get("chats", id)`) and the legacy id-only
    // form; a table name that doesn't match the document fails like a wrong-table Id would.
    async get(tableOrId: string, maybeId?: string) {
      const found = findRow(tableOrId, maybeId);
      return await Promise.resolve(found ? read(found.doc) : null);
    },
    /** Like the real db: checks only the id's format and table (`<table>:<n>`), not existence. */
    normalizeId(table: TableNames, id: string): string | null {
      return id.startsWith(`${table}:`) ? id : null;
    },
    query(table: TableNames) {
      stats.queries += 1;
      return new FakeQuery(table);
    },
    async insert(table: TableNames, doc: Record<string, unknown>) {
      stats.writes += 1;
      return await Promise.resolve(this.seed(table, doc));
    },
    async patch(
      tableOrId: string,
      idOrFields: string | Record<string, unknown>,
      maybeFields?: Record<string, unknown>
    ) {
      const [id, fields] =
        typeof idOrFields === "string"
          ? [idOrFields, maybeFields ?? {}]
          : [tableOrId, idOrFields];
      const found = findRow(
        tableOrId,
        typeof idOrFields === "string" ? idOrFields : undefined
      );
      if (!found) {
        throw new Error(`patch of missing document ${id}`);
      }
      stats.writes += 1;
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
          Reflect.deleteProperty(found.doc, key);
        } else {
          found.doc[key] = value;
        }
      }
      await Promise.resolve();
    },
    async delete(tableOrId: string, maybeId?: string) {
      const id = maybeId ?? tableOrId;
      if (!findRow(tableOrId, maybeId) || !rows.delete(id)) {
        throw new Error(`delete of missing document ${id}`);
      }
      stats.writes += 1;
      await Promise.resolve();
    },
  };
};

export type FakeDb = ReturnType<typeof createFakeDb>;

/**
 * A mutation-like ctx over `db`. Transaction metrics count only the work done through this ctx,
 * so create a new one per simulated transaction.
 */
export const createFakeCtx = (db: FakeDb) => {
  const start = { ...db.stats };
  const runAfter =
    vi.fn<(delayMs: number, fn: unknown, args: unknown) => Promise<string>>();
  runAfter.mockResolvedValue("scheduled:1");
  const runAt =
    vi.fn<(timestamp: number, fn: unknown, args: unknown) => Promise<string>>();
  runAt.mockResolvedValue("scheduled:1");
  const cancel = vi.fn<(id: string) => Promise<void>>();
  cancel.mockResolvedValue();
  return {
    db,
    scheduler: {
      runAfter,
      runAt,
      cancel,
    },
    meta: {
      getTransactionMetrics: async () =>
        await Promise.resolve({
          documentsWritten: metric(
            db.stats.writes - start.writes,
            LIMITS.documentsWritten
          ),
          documentsRead: metric(
            db.stats.reads - start.reads,
            LIMITS.documentsRead
          ),
          databaseQueries: metric(
            db.stats.queries - start.queries,
            LIMITS.databaseQueries
          ),
          functionsScheduled: metric(
            runAfter.mock.calls.length + runAt.mock.calls.length,
            LIMITS.functionsScheduled
          ),
          bytesRead: metric(db.stats.bytesRead - start.bytesRead, 16 * MiB),
          bytesWritten: metric(0, 16 * MiB),
          scheduledFunctionArgsBytes: metric(0, 16 * MiB),
        }),
    },
  };
};

export type FakeCtx = ReturnType<typeof createFakeCtx>;
