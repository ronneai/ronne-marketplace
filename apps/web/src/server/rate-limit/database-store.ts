import type { Db } from "../db/create-db";
import { fromDbDate, toDbDate } from "../db/dates";
import { forUpdate, retryOnDeadlock, writeTransaction } from "../db/locks";
import type { DatabaseDialect } from "../db/url";
import { rateLimitKeyHash } from "./key-hash";
import { distinct } from "./memory-store";
import {
  type Limit,
  type RateLimitDecision,
  type RateLimitEntry,
  type RateLimitStore,
  refusal,
} from "./rate-limiter";

/** Where the counters are: the instance's database, and the secret their keys are hashed with. */
export type RateLimitDatabase = { db: Db; dialect: DatabaseDialect; authSecret: string };

type Target = { hash: string; limit: Limit };

type Row = { key_hash: string; hits: number; expires_at: Date | string };

/** Writes a row's new count; `fresh` starts its window at the attempt. */
type Write = (target: Target, hits: number, fresh: boolean) => Promise<void>;

/**
 * How many times an attempt makes its missing rows and locks them again before giving up: a row
 * goes missing between the two only when the purge deleted it, its window having ended, so a
 * second try all but always finds it.
 */
const ROW_ATTEMPTS = 5;

const MISSING = Symbol("missing rows");

/** The entries' rows, each once, in key order: every transaction locks them in this order. */
const targets = (authSecret: string, entries: readonly RateLimitEntry[]): Target[] =>
  distinct(entries)
    .map((entry) => ({ hash: rateLimitKeyHash(authSecret, entry), limit: entry.limit }))
    .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));

/** Whether the row's window is still running at `now`. */
const live = (row: Row, now: number) => fromDbDate(row.expires_at).getTime() > now;

/**
 * Counts in the `rate_limits` table (109), shared by every replica and kept across restarts. An
 * attempt that writes runs in one transaction (`writeTransaction`): its rows are locked in key
 * order with `forUpdate`, which reads the latest committed row, then decided and written. A row
 * that doesn't exist yet can't be locked, so it's made first, in its own statement before the
 * transaction, ignoring one another attempt made at the same moment, and the transaction runs
 * again. When the database fails, the error goes up: no attempt is let through uncounted.
 */
export const createDatabaseRateLimitStore = (connect: () => RateLimitDatabase): RateLimitStore => {
  /** Makes the rows that don't exist yet, as windows that have already ended. */
  const makeRows = async ({ db, dialect }: RateLimitDatabase, list: Target[], now: number) => {
    const at = toDbDate(new Date(now), dialect);
    const insert = db
      .insertInto("rate_limits")
      .values(
        list.map((t) => ({ key_hash: t.hash, window_started_at: at, hits: 0, expires_at: at })),
      );
    await (dialect === "mysql"
      ? insert.ignore()
      : insert.onConflict((oc) => oc.column("key_hash").doNothing())
    ).execute();
  };

  /**
   * Runs `decide` on the locked rows, in a transaction, run again when the database ended a
   * deadlock. With `need`, a missing row makes the rows and tries again.
   */
  const locked = async <T>(
    entries: readonly RateLimitEntry[],
    now: number,
    need: boolean,
    decide: (write: Write, rows: { target: Target; row: Row | undefined }[]) => Promise<T>,
  ): Promise<T> => {
    const connection = connect();
    const { db, dialect } = connection;
    const list = targets(connection.authSecret, entries);
    if (list.length === 0) return decide(async () => {}, []);
    for (let attempt = 1; ; attempt++) {
      const result = await retryOnDeadlock(() =>
        writeTransaction(db, dialect, async (trx) => {
          const found = await forUpdate(
            trx
              .selectFrom("rate_limits")
              .select(["key_hash", "hits", "expires_at"])
              .where(
                "key_hash",
                "in",
                list.map((t) => t.hash),
              )
              .orderBy("key_hash"),
            dialect,
          ).execute();
          const byHash = new Map(found.map((row) => [row.key_hash, row]));
          if (need && byHash.size < list.length) return MISSING;
          const write: Write = async (target, hits, fresh) => {
            const update = fresh
              ? {
                  hits,
                  window_started_at: toDbDate(new Date(now), dialect),
                  expires_at: toDbDate(new Date(now + target.limit.windowMs), dialect),
                }
              : { hits };
            await trx
              .updateTable("rate_limits")
              .set(update)
              .where("key_hash", "=", target.hash)
              .execute();
          };
          return decide(
            write,
            list.map((target) => ({ target, row: byHash.get(target.hash) })),
          );
        }),
      );
      if (result !== MISSING) return result as T;
      if (attempt >= ROW_ATTEMPTS)
        throw new Error("The rate limit's rows kept disappearing before they could be locked.");
      await makeRows(connection, list, now);
    }
  };

  /** Counts one attempt against each row: a running window goes up by one, an ended one restarts. */
  const countAll = async (
    write: Write,
    rows: { target: Target; row: Row | undefined }[],
    now: number,
  ) => {
    for (const { target, row } of rows) {
      if (row && live(row, now)) await write(target, Number(row.hits) + 1, false);
      else await write(target, 1, true);
    }
  };

  /** The refusal when any row's window is running and full, from rows read with or without a lock. */
  const decision = (rows: { target: Target; row: Row | undefined }[], now: number) =>
    refusal(
      rows
        .filter(({ target, row }) => row && live(row, now) && Number(row.hits) >= target.limit.max)
        .map(({ row }) => fromDbDate((row as Row).expires_at).getTime()),
      now,
    );

  return {
    consume: (entries, now) =>
      locked<RateLimitDecision>(entries, now, true, async (write, rows) => {
        const refused = decision(rows, now);
        if (refused.allowed) await countAll(write, rows, now);
        return refused;
      }),
    check: async (entries, now) => {
      const connection = connect();
      const list = targets(connection.authSecret, entries);
      if (list.length === 0) return { allowed: true };
      const found = await connection.db
        .selectFrom("rate_limits")
        .select(["key_hash", "hits", "expires_at"])
        .where(
          "key_hash",
          "in",
          list.map((t) => t.hash),
        )
        .execute();
      const byHash = new Map(found.map((row) => [row.key_hash, row]));
      return decision(
        list.map((target) => ({ target, row: byHash.get(target.hash) })),
        now,
      );
    },
    record: (entries, now) =>
      locked(entries, now, true, (write, rows) => countAll(write, rows, now)),
    release: (entries, now) =>
      locked(entries, now, false, async (write, rows) => {
        for (const { target, row } of rows)
          if (row && live(row, now) && Number(row.hits) > 0)
            await write(target, Number(row.hits) - 1, false);
      }),
  };
};
