import { type Kysely, type RawBuilder, sql } from "kysely";
import { parseExactTimestamp } from "./dates";
import { foreignKeyOrder, readSchema, type TableSchema } from "./introspect";
import { readSnapshot } from "./snapshot";
import type { DatabaseDialect } from "./url";

/**
 * The database half of a backup (099): every table's rows as JSON Lines, read inside one snapshot,
 * in primary-key order, in batches, and handed out in parts so memory stays flat. The values'
 * encoding is `docs/spec/backup-format.md`'s, the same for every dialect.
 */

/** A value as the backup format writes it. */
export type EncodedValue = string | number | boolean | null | { $b64: string };

export class DumpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DumpError";
  }
}

/**
 * One stored value as the format's JSON: dates as ISO 8601 UTC with milliseconds, bytes as
 * `{"$b64": …}`, integers up to 2^53 − 1, strings and booleans as they are. Anything else (a
 * fraction, a bigger integer, an object) stops the backup rather than writing a value a restore
 * would read differently.
 */
export const encodeValue = (value: unknown, where: string): EncodedValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DumpError(`${where} holds an invalid date.`);
    // As a restore will check it: years 1 to 9999 only (0000 is no year PostgreSQL takes, and
    // PostgreSQL's years past 9999 come out as `+010000-…`).
    const iso = value.toISOString();
    if (!parseExactTimestamp(iso))
      throw new DumpError(
        `${where} holds a date outside the years 1 to 9999, which no restore takes.`,
      );
    return iso;
  }
  if (value instanceof Uint8Array) return { $b64: Buffer.from(value).toString("base64") };
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) return value;
    throw new DumpError(`${where} holds ${value}, which isn't an integer the format can carry.`);
  }
  if (typeof value === "bigint") {
    if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER))
      return Number(value);
    throw new DumpError(`${where} holds ${value}, larger than the format's integers (2^53 − 1).`);
  }
  throw new DumpError(`${where} holds a value of a kind the backup format doesn't carry.`);
};

/** One row as a line of JSON, its keys in the table's column order. */
export const encodeRow = (row: Record<string, unknown>, table: TableSchema): string => {
  const out: Record<string, EncodedValue> = {};
  for (const column of table.columns) {
    const value = row[column.name];
    const where = `${table.name}.${column.name}`;
    // SQLite's timestamps are text (`…_at` columns): checked as a restore will check them, so no
    // backup holds a timestamp no restore takes. A timestamp is text (SQLite), a Date (the others)
    // or NULL: anything else (a blob, a number SQLite let in) is no timestamp either.
    if (
      column.name.endsWith("_at") &&
      value !== null &&
      value !== undefined &&
      !(value instanceof Date) &&
      (typeof value !== "string" || !parseExactTimestamp(value))
    )
      throw new DumpError(
        `${where} holds ${typeof value === "string" ? JSON.stringify(value.slice(0, 40)) : "a value that isn't text"}, which isn't a timestamp a restore takes.`,
      );
    out[column.name] = encodeValue(value, where);
  }
  return `${JSON.stringify(out)}\n`;
};

/** Rows read per query, at most… */
export const DUMP_BATCH_ROWS = 1_000;
/**
 * …and about this many bytes of text: a batch is sized from its rows' lengths, measured first, so
 * wide rows (a draft's files, up to 20 MiB each) come a few at a time, and one larger than this
 * alone. Memory then follows this and the part size, never the table's.
 */
export const DUMP_BATCH_BYTES = 4 * 1024 * 1024;
/** A part ends once it has this many rows… */
export const PART_MAX_ROWS = 10_000;
/** …or this many bytes; one larger row is a part on its own. */
export const PART_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Columns whose values can be long: the ones a batch's size is measured by. SQLite stores any value
 * in any column, so there every column is measured.
 */
const isWide = (type: string, dialect: DatabaseDialect) =>
  dialect === "sqlite" || /char|text|blob|bytea|json/.test(type);

/** A column's length in bytes, 0 for NULL, in the dialect's own SQL. */
const byteLength = (column: string, dialect: DatabaseDialect) =>
  dialect === "sqlite"
    ? sql`coalesce(length(cast(${sql.ref(column)} as blob)), 0)`
    : sql`coalesce(octet_length(${sql.ref(column)}), 0)`;

/** How many rows the first size query looks ahead; it then follows what the batches take. */
const FIRST_LOOKAHEAD = 32;

/**
 * "After this key", for the keyset. A row comparison, `(a, b) > (x, y)`, where the database uses
 * the primary key's index for it; MySQL and MariaDB scan the whole index for one, so they get it
 * spelled out: `a > x or (a = x and b > y)`.
 */
const afterKey = (
  keys: readonly string[],
  values: readonly unknown[],
  dialect: DatabaseDialect,
) => {
  if (dialect !== "mysql")
    return sql`(${sql.join(keys.map((k) => sql.ref(k)))}) > (${sql.join([...values])})`;
  const branches = keys.map((key, i) =>
    sql.join(
      [
        ...keys.slice(0, i).map((k, j) => sql`${sql.ref(k)} = ${values[j]}`),
        sql`${sql.ref(key)} > ${values[i]}`,
      ],
      sql` and `,
    ),
  );
  return sql`(${sql.join(
    branches.map((b) => sql`(${b})`),
    sql` or `,
  )})`;
};

/**
 * Hands the table's rows to `onBatch` in primary-key order, a batch at a time: each query asks for
 * the rows after the last one seen (keyset), so a deep batch costs the same as the first and
 * nothing is skipped. A batch holds up to `batchRows` rows and about `batchBytes` of data, measured
 * by a first query of the rows' lengths alone (inside the same snapshot, so both see the same
 * rows). That query looks ahead about twice as many rows as the last batch took, never
 * `batchRows` of wide rows to keep a few: reading the lengths reads the values on some databases,
 * so a table of wide rows costs about twice its reading, not its size times the lookahead. The
 * next batch is read once `onBatch` is done with this one. A NULL in the key would end the keyset
 * early (SQLite allows one in some keys), so it stops the dump instead.
 */
export const readRowsInKeyOrder = async (
  db: Kysely<unknown>,
  dialect: DatabaseDialect,
  table: TableSchema,
  onBatch: (rows: Record<string, unknown>[]) => Promise<void>,
  limits: { batchRows?: number; batchBytes?: number } = {},
): Promise<void> => {
  if (table.primaryKey.length === 0)
    throw new DumpError(
      `The table ${table.name} has no primary key, so it can't be read in order.`,
    );
  const batchRows = limits.batchRows ?? DUMP_BATCH_ROWS;
  const batchBytes = limits.batchBytes ?? DUMP_BATCH_BYTES;
  const key = sql.join(table.primaryKey.map((c) => sql.ref(c)));
  const wide = table.columns
    .filter((c) => isWide(c.type, dialect))
    .map((c) => byteLength(c.name, dialect));
  const rowBytes = wide.length > 0 ? sql.join(wide, sql` + `) : null;
  let lookahead = Math.min(FIRST_LOOKAHEAD, batchRows);
  let after: unknown[] | null = null;
  for (;;) {
    const where: RawBuilder<unknown> =
      after === null ? sql`` : sql`where ${afterKey(table.primaryKey, after, dialect)}`;
    let take = batchRows;
    if (rowBytes) {
      const { rows: sizes } = await sql<{ row_bytes: number | string }>`
        select ${rowBytes} as row_bytes from ${sql.table(table.name)} ${where}
        order by ${key} limit ${sql.lit(lookahead)}`.execute(db);
      if (sizes.length === 0) return;
      let total = 0;
      take = 0;
      for (const size of sizes) {
        total += Number(size.row_bytes);
        if (take > 0 && total > batchBytes) break;
        take++;
      }
      lookahead = Math.min(batchRows, Math.max(2, take * 2));
    }
    const { rows } = await sql<Record<string, unknown>>`
      select * from ${sql.table(table.name)} ${where}
      order by ${key} limit ${sql.lit(take)}`.execute(db);
    if (rows.length === 0) return;
    for (const row of rows)
      if (table.primaryKey.some((c) => row[c] === null || row[c] === undefined))
        throw new DumpError(
          `A row of ${table.name} has no value in its primary key (${table.primaryKey.join(", ")}), so it can't be read in order.`,
        );
    await onBatch(rows);
    if (rows.length < take) return;
    const last = rows[rows.length - 1] as Record<string, unknown>;
    after = table.primaryKey.map((c) => last[c]);
  }
};

/** What the manifest says of one dumped table. */
export type DumpedTable = { columns: string[]; primaryKey: string[]; rows: number; parts: number };

export type DumpOptions = {
  batchRows?: number;
  batchBytes?: number;
  partMaxRows?: number;
  partMaxBytes?: number;
  /** Called before each table is read; tests use it to write while the dump runs. */
  beforeTable?: (table: string) => Promise<void>;
};

/** `database/<table>/<part>.jsonl`, the part numbered from 1 in six digits. */
export const partPath = (table: string, part: number) =>
  `database/${table}/${String(part).padStart(6, "0")}.jsonl`;

/**
 * Dumps the given tables (read through `db`, which should be a snapshot) as parts, each handed to
 * `addPart` whole, in order: one table's parts together, numbered from 1. Tables go in foreign-key
 * order. Returns the manifest's `tables`.
 */
export const dumpTables = async (
  db: Kysely<unknown>,
  dialect: DatabaseDialect,
  tables: readonly TableSchema[],
  addPart: (path: string, bytes: Uint8Array) => Promise<void>,
  options: DumpOptions = {},
): Promise<Record<string, DumpedTable>> => {
  const maxRows = options.partMaxRows ?? PART_MAX_ROWS;
  const maxBytes = options.partMaxBytes ?? PART_MAX_BYTES;
  const encoder = new TextEncoder();
  const dumped: Record<string, DumpedTable> = {};
  for (const table of foreignKeyOrder(tables)) {
    await options.beforeTable?.(table.name);
    let rows = 0;
    let parts = 0;
    let lines: string[] = [];
    let bytes = 0;
    const flush = async () => {
      if (lines.length === 0) return;
      parts++;
      await addPart(partPath(table.name, parts), encoder.encode(lines.join("")));
      lines = [];
      bytes = 0;
    };
    await readRowsInKeyOrder(
      db,
      dialect,
      table,
      async (batch) => {
        for (const row of batch) {
          const line = encodeRow(row, table);
          const size = Buffer.byteLength(line);
          // A row that would take the part past its size starts a new one, so a large row is a
          // part on its own (the format spec), never added to the rows before it.
          if (lines.length > 0 && bytes + size > maxBytes) await flush();
          lines.push(line);
          bytes += size;
          rows++;
          if (lines.length >= maxRows || bytes >= maxBytes) await flush();
        }
      },
      { batchRows: options.batchRows, batchBytes: options.batchBytes },
    );
    await flush();
    dumped[table.name] = {
      columns: table.columns.map((c) => c.name),
      primaryKey: table.primaryKey,
      rows,
      parts,
    };
  }
  return dumped;
};

/**
 * The whole database inside one snapshot: its schema, then every table's rows as parts. Writes keep
 * going on other connections, and none made after the snapshot started is in the dump.
 */
export const dumpDatabase = async (
  db: Kysely<unknown>,
  dialect: DatabaseDialect,
  addPart: (path: string, bytes: Uint8Array) => Promise<void>,
  options: DumpOptions = {},
): Promise<{ tables: Record<string, DumpedTable> }> =>
  readSnapshot(db, dialect, async (snapshot) => {
    const schema = await readSchema(snapshot, dialect);
    return { tables: await dumpTables(snapshot, dialect, schema, addPart, options) };
  });
