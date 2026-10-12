/**
 * In-memory stand-in for a mutation ctx (`db`, `scheduler`, `meta`) for unit tests, since
 * convex-test isn't installed. Index queries use the field order declared in the real schema, so
 * a test fails if code queries an index that doesn't exist or out of field order. (The name has
 * two dots so Convex doesn't deploy it and Vitest doesn't run it as a test file.)
 */
import { vi } from "vitest";
import type { TableNames } from "../_generated/dataModel";
import schema from "../schema";

export type Row = Record<string, unknown> & { _id: string; _creationTime: number };

interface Bound {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}
type RangeBuilder = { [Op in Bound["op"]]: (field: string, value: unknown) => RangeBuilder };
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
function typeRank(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null) return 1;
  if (typeof value === "number") return 2;
  if (typeof value === "boolean") return 3;
  return 4;
}

function compareValues(a: unknown, b: unknown): number {
  const rankDiff = typeRank(a) - typeRank(b);
  if (rankDiff !== 0) return rankDiff;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const [sa, sb] = [String(a), String(b)];
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matchesBound(row: Row, { field, op, value }: Bound): boolean {
  const cmp = compareValues(row[field], value);
  return op === "eq"
    ? cmp === 0
    : op === "gt"
      ? cmp > 0
      : op === "gte"
        ? cmp >= 0
        : op === "lt"
          ? cmp < 0
          : cmp <= 0;
}

interface ExportedTable {
  tableName: string;
  indexes: Array<{ indexDescriptor: string; fields: string[] }>;
  searchIndexes: Array<{ indexDescriptor: string; searchField: string; filterFields: string[] }>;
}
// The schema's deploy-time JSON, which lists every table's indexes and search indexes
const exportedTables = (
  JSON.parse((schema as unknown as { export(): string }).export()) as { tables: ExportedTable[] }
).tables;

function tableDefinition(table: TableNames): ExportedTable {
  const found = exportedTables.find((t) => t.tableName === table);
  if (!found) throw new Error(`Table ${table} is not defined in the schema`);
  return found;
}

function indexFields(table: TableNames, index: string): string[] {
  if (index === "by_creation_time") return [];
  const found = tableDefinition(table).indexes.find((i) => i.indexDescriptor === index);
  if (!found) {
    throw new Error(`Index ${table}.${index} is not defined in the schema`);
  }
  return found.fields;
}

function tokens(text: unknown): string[] {
  return typeof text === "string" ? text.toLowerCase().split(/\W+/).filter(Boolean) : [];
}

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb() {
  const rows = new Map<string, { table: TableNames; doc: Row }>();
  const stats = { reads: 0, writes: 0, queries: 0 };
  // Ids of documents handed to the code under test, in order
  const readIds: string[] = [];
  let nextId = 0;
  let clock = 1_000;

  const read = (doc: Row) => {
    stats.reads += 1;
    readIds.push(doc._id);
    return { ...doc };
  };

  class FakeQuery {
    private bounds: Bound[] = [];
    private fields: string[] = [];
    private descending = false;
    private searchField: string | null = null;
    private searchTerms: string[] = [];

    constructor(private readonly table: TableNames) {}

    withIndex(index: string, build?: (q: RangeBuilder) => unknown) {
      this.fields = indexFields(this.table, index);
      const builder = {} as RangeBuilder;
      for (const op of ["eq", "gt", "gte", "lt", "lte"] as const) {
        builder[op] = (field, value) => {
          this.bounds.push({ field, op, value });
          return builder;
        };
      }
      build?.(builder);
      // Like Convex: equalities on a prefix of the index fields, then ranges on the next field
      const eqCount = this.bounds.filter((b) => b.op === "eq").length;
      this.bounds.forEach((bound, i) => {
        const expected = bound.op === "eq" ? this.fields[i] : this.fields[eqCount];
        if (bound.field !== expected) {
          throw new Error(`${this.table}.${index}: "${bound.field}" is out of index order`);
        }
      });
      return this;
    }

    withSearchIndex(index: string, build: (q: SearchBuilder) => unknown) {
      const definition = tableDefinition(this.table).searchIndexes.find(
        (i) => i.indexDescriptor === index,
      );
      if (!definition) {
        throw new Error(`Search index ${this.table}.${index} is not defined in the schema`);
      }
      const builder: SearchBuilder = {
        search: (field, text) => {
          if (field !== definition.searchField) {
            throw new Error(`${field} is not the search field of ${this.table}.${index}`);
          }
          this.searchField = field;
          this.searchTerms = tokens(text);
          return builder;
        },
        eq: (field, value) => {
          if (!definition.filterFields.includes(field)) {
            throw new Error(`${field} is not a filter field of ${this.table}.${index}`);
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
      throw new Error("The fake db doesn't support filter(); query through an index instead");
    }

    private matching(): Row[] {
      const found = [...rows.values()]
        .filter(
          ({ table, doc }) =>
            table === this.table && this.bounds.every((b) => matchesBound(doc, b)),
        )
        .map(({ doc }) => doc);
      if (this.searchField) {
        const field = this.searchField;
        const terms = this.searchTerms;
        const last = terms.at(-1) ?? "";
        // Any term matches a word; the last term also matches as a prefix
        return found.filter((doc) =>
          tokens(doc[field]).some((word) => terms.includes(word) || word.startsWith(last)),
        );
      }
      const keys = [...this.fields, "_creationTime"];
      found.sort((a, b) => {
        for (const key of keys) {
          const cmp = compareValues(a[key], b[key]);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
      return this.descending ? found.reverse() : found;
    }

    async collect() {
      return this.matching().map(read);
    }

    async take(n: number) {
      return this.matching().slice(0, n).map(read);
    }

    async first() {
      const [doc] = this.matching();
      return doc ? read(doc) : null;
    }

    async unique() {
      const found = this.matching();
      if (found.length > 1) throw new Error(`unique() matched ${found.length} documents`);
      return found[0] ? read(found[0]) : null;
    }

    async paginate({ numItems, cursor }: { numItems: number; cursor: string | null }) {
      const all = this.matching();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + numItems).map(read);
      return {
        page,
        isDone: start + numItems >= all.length,
        continueCursor: String(start + page.length),
      };
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
      return [...rows.values()].filter((r) => r.table === table).map(({ doc }) => ({ ...doc }));
    },
    async get(id: string) {
      const found = rows.get(id);
      return found ? read(found.doc) : null;
    },
    query(table: TableNames) {
      stats.queries += 1;
      return new FakeQuery(table);
    },
    async insert(table: TableNames, doc: Record<string, unknown>) {
      stats.writes += 1;
      return this.seed(table, doc);
    },
    async patch(id: string, fields: Record<string, unknown>) {
      const found = rows.get(id);
      if (!found) throw new Error(`patch of missing document ${id}`);
      stats.writes += 1;
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
          delete found.doc[key];
        } else {
          found.doc[key] = value;
        }
      }
    },
    async delete(id: string) {
      if (!rows.delete(id)) throw new Error(`delete of missing document ${id}`);
      stats.writes += 1;
    },
  };
}

/**
 * A mutation-like ctx over `db`. Transaction metrics count only the work done through this ctx,
 * so create a new one per simulated transaction.
 */
export function createFakeCtx(db: FakeDb) {
  const start = { ...db.stats };
  const metric = (used: number, limit: number) => ({ used, remaining: limit - used });
  return {
    db,
    scheduler: {
      runAfter: vi.fn<(delayMs: number, fn: unknown, args: unknown) => Promise<string>>(
        async () => "scheduled:1",
      ),
      cancel: vi.fn<(id: string) => Promise<void>>(async () => undefined),
    },
    meta: {
      getTransactionMetrics: async () => ({
        documentsWritten: metric(db.stats.writes - start.writes, LIMITS.documentsWritten),
        documentsRead: metric(db.stats.reads - start.reads, LIMITS.documentsRead),
        databaseQueries: metric(db.stats.queries - start.queries, LIMITS.databaseQueries),
        functionsScheduled: metric(0, LIMITS.functionsScheduled),
        bytesRead: metric(0, 16 * MiB),
        bytesWritten: metric(0, 16 * MiB),
        scheduledFunctionArgsBytes: metric(0, 16 * MiB),
      }),
    },
  };
}

export type FakeCtx = ReturnType<typeof createFakeCtx>;
