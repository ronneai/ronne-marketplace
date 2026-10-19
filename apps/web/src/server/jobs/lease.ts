import type { Kysely } from "kysely";
import { toDbDate } from "../db/dates";
import { isUniqueViolation } from "../db/locks";
import type { Database } from "../db/schema";
import type { DatabaseDialect } from "../db/url";

/**
 * A job's lease (feature 102): the one mechanism the three database kinds share for "one run at
 * a time, however many processes start it". A run claims the job's row with one conditional
 * UPDATE and goes on only when it changed the row; the lease expires on its own, so a run that
 * dies holds nothing for long, and the next run takes over. No advisory locks: SQLite has none,
 * and a lost connection wouldn't release one.
 */
export const LEASE_MS = 15 * 60 * 1000;

type Db = Kysely<Database>;

/** Makes the job's row when it doesn't exist yet; two makers at once are fine. */
const ensureRow = async (db: Db, name: string): Promise<void> => {
  try {
    await db
      .insertInto("jobs")
      .values({
        name,
        lease_holder: null,
        lease_ends_at: null,
        last_run_at: null,
        last_result: null,
      })
      .execute();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
};

/**
 * Claims the lease for `holder` until `now + LEASE_MS`, when nobody holds it or the holder's
 * lease has ended. True when this call took it.
 */
export const claimLease = async (
  db: Db,
  dialect: DatabaseDialect,
  name: string,
  holder: string,
  now: Date,
): Promise<boolean> => {
  await ensureRow(db, name);
  const until = toDbDate(new Date(now.getTime() + LEASE_MS), dialect);
  const result = await db
    .updateTable("jobs")
    .set({ lease_holder: holder, lease_ends_at: until })
    .where("name", "=", name)
    .where((eb) =>
      eb.or([eb("lease_ends_at", "is", null), eb("lease_ends_at", "<", toDbDate(now, dialect))]),
    )
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
};

/**
 * Pushes the holder's lease to `now + LEASE_MS`. False when the holder no longer has it (it
 * expired and another run took over): the caller must stop, since the other run is doing the work.
 */
export const renewLease = async (
  db: Db,
  dialect: DatabaseDialect,
  name: string,
  holder: string,
  now: Date,
): Promise<boolean> => {
  const result = await db
    .updateTable("jobs")
    .set({ lease_ends_at: toDbDate(new Date(now.getTime() + LEASE_MS), dialect) })
    .where("name", "=", name)
    .where("lease_holder", "=", holder)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
};

/**
 * Ends the holder's lease and records the run (`last_run_at`, `last_result` as JSON text). Does
 * nothing when the holder no longer has the lease: the run that took over records its own.
 */
export const releaseLease = async (
  db: Db,
  dialect: DatabaseDialect,
  name: string,
  holder: string,
  ranAt: Date,
  result: string,
): Promise<void> => {
  await db
    .updateTable("jobs")
    .set({
      lease_holder: null,
      lease_ends_at: null,
      last_run_at: toDbDate(ranAt, dialect),
      last_result: result,
    })
    .where("name", "=", name)
    .where("lease_holder", "=", holder)
    .execute();
};
