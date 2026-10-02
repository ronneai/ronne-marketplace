import { type Kysely, type SelectQueryBuilder, type SqlBool, sql } from "kysely";

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
};

export type KeysetPage<Row> = { rows: Row[]; next: string | null; previous: string | null };

type SortValue = string | number;
type Cursor = { k: string; v: SortValue; id: string; d: "after" | "before" };

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
  },
): Promise<KeysetPage<Row>> => {
  const { sort, idColumn, size, sortValue, idOf } = options;
  const cursor = decodeCursor(options.cursor, sort.key);
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
    page = page.where(
      sameColumn
        ? sql<SqlBool>`${id} ${op} ${cursor.id}`
        : sql<SqlBool>`(${col} ${op} ${cursor.v} or (${col} = ${cursor.v} and ${id} ${op} ${cursor.id}))`,
    );
  }
  if (!sameColumn) page = page.orderBy(sql.ref(sort.column), order);
  page = page.orderBy(sql.ref(idColumn), order).limit(size + 1);

  const fetched = await page.execute();
  const more = fetched.length > size;
  const rows = fetched.slice(0, size);
  if (!forward) rows.reverse();

  const at = (row: Row | undefined, d: Cursor["d"]) =>
    row === undefined ? null : encode({ k: sort.key, v: sortValue(row), id: idOf(row), d });
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
  db: Kysely<DB>,
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
