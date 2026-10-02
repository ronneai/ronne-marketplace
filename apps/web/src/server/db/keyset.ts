import { type QueryExecutorProvider, type SelectQueryBuilder, type SqlBool, sql } from "kysely";
import { toDbDate } from "./dates";
import type { DatabaseDialect } from "./url";

/**
 * Keyset pagination for the web app's tables (feature 060): pages are "the rows after (or before)
 * this one" in the sort order, never an offset, so a page doesn't shift while rows are added, and
 * a deep page costs the same as the first. The sort column comes first and the id breaks ties, so
 * the order is strict even when many rows share a value.
 */
export type SortDir = "asc" | "desc";

export type KeysetSort = {
  /** The list's name for the sort (`time`, `action`), recorded in the cursor. */
  key: string;
  /** The column to order by, qualified (`audit_log.action`). Must be indexed with the id. */
  column: string;
  dir: SortDir;
  /**
   * `date` for a timestamp column (062): the cursor keeps the value as ISO text, and it's turned
   * back into the column's form for each database (`toDbDate`) before comparing.
   */
  kind?: "date";
};

export type KeysetPage<Row> = { rows: Row[]; next: string | null; previous: string | null };

type SortValue = string | number | Date;
type Cursor = { k: string; v: string | number; id: string; d: "after" | "before" };

const encode = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

/** A cursor for this sort, or null for anything else: malformed, tampered or another sort's. */
export const decodeCursor = (value: string | undefined, sortKey: string): Cursor | null => {
  if (!value || value.length > 1024) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    const valueOk = typeof cursor.v === "string" || Number.isFinite(cursor.v);
    if (
      cursor?.k !== sortKey ||
      !valueOk ||
      typeof cursor.id !== "string" ||
      (cursor.d !== "after" && cursor.d !== "before")
    )
      return null;
    return { k: cursor.k, v: cursor.v, id: cursor.id, d: cursor.d };
  } catch {
    return null;
  }
};

const flip = (dir: SortDir): SortDir => (dir === "asc" ? "desc" : "asc");

const isIsoDate = (value: string | number): boolean =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

/**
 * One page of `query` (already filtered, not yet ordered or limited). `sortValue` reads the sort
 * column's value from a row; `idColumn` is the qualified id column. Fetches `size + 1` rows to know
 * whether there's another page. Previous runs the reverse order from the page's first row, then
 * puts the rows back in order.
 */
export const paginate = async <DB, TB extends keyof DB, Row>(
  query: SelectQueryBuilder<DB, TB, Row>,
  options: {
    sort: KeysetSort;
    idColumn: string;
    size: number;
    cursor?: string;
    sortValue: (row: Row) => SortValue;
    idOf: (row: Row) => string;
    /** Needed for a `date` sort, to compare the cursor's date as the database stores it. */
    dialect?: DatabaseDialect;
  },
): Promise<KeysetPage<Row>> => {
  const { sort, idColumn, size, sortValue, idOf } = options;
  // A date compares differently on each database (text on SQLite), so a date sort must say which.
  const dialectOf = (): DatabaseDialect => {
    if (!options.dialect) throw new Error(`paginate: the date sort "${sort.key}" needs a dialect`);
    return options.dialect;
  };
  const decoded = decodeCursor(options.cursor, sort.key);
  const cursor = sort.kind === "date" && decoded && !isIsoDate(decoded.v) ? null : decoded;
  const forward = cursor === null || cursor.d === "after";
  const order = forward ? sort.dir : flip(sort.dir);
  const sameColumn = sort.column === idColumn;

  let page = query;
  if (cursor) {
    // Written out rather than as a row comparison `(col, id) > (v, id)`, which the four databases
    // don't all treat the same way. `op` is one of two fixed strings.
    const op = sql.raw(order === "asc" ? ">" : "<");
    const col = sql.ref(sort.column);
    const id = sql.ref(idColumn);
    const value = sort.kind === "date" ? toDbDate(new Date(cursor.v), dialectOf()) : cursor.v;
    page = page.where(
      sameColumn
        ? sql<SqlBool>`${id} ${op} ${cursor.id}`
        : sql<SqlBool>`(${col} ${op} ${value} or (${col} = ${value} and ${id} ${op} ${cursor.id}))`,
    );
  }
  if (!sameColumn) page = page.orderBy(sql.ref(sort.column), order);
  page = page.orderBy(sql.ref(idColumn), order).limit(size + 1);

  const fetched = await page.execute();
  const more = fetched.length > size;
  const rows = fetched.slice(0, size);
  if (!forward) rows.reverse();

  const cursorValue = (row: Row): string | number => {
    const v = sortValue(row);
    return v instanceof Date ? v.toISOString() : v;
  };
  const at = (row: Row | undefined, d: Cursor["d"]) =>
    row === undefined ? null : encode({ k: sort.key, v: cursorValue(row), id: idOf(row), d });
  // Going forward, there's a page before this one whenever we came from a cursor, and one after
  // when the extra row came back; going back, the reverse.
  const hasNext = forward ? more : cursor !== null;
  const hasPrevious = forward ? cursor !== null : more;
  return {
    rows,
    next: hasNext ? at(rows.at(-1), "after") : null,
    previous: hasPrevious ? at(rows[0], "before") : null,
  };
};

/** Counting stops here: past it, a list says "10,000+" rather than count a huge table. */
export const COUNT_CAP = 10_000;

/**
 * How many rows `query` (filtered, not ordered) matches, up to COUNT_CAP + 1. It reads at most
 * that many rows, so a large table never needs a full count.
 */
export const countCapped = async <DB, TB extends keyof DB, Row>(
  db: QueryExecutorProvider,
  query: SelectQueryBuilder<DB, TB, Row>,
): Promise<{ count: number; capped: boolean }> => {
  const limited = query
    .clearSelect()
    .select(sql<number>`1`.as("one"))
    .limit(COUNT_CAP + 1);
  const { rows } = await sql<{
    n: number | string | bigint;
  }>`select count(*) as n from (${limited}) as capped`.execute(db);
  const n = Number(rows[0]?.n ?? 0);
  return { count: Math.min(n, COUNT_CAP), capped: n > COUNT_CAP };
};
