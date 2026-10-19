import type { Kysely } from "kysely";
import { toDbDate } from "../db/dates";
import { decodeJson, encodeJson } from "../db/json";
import type { Database } from "../db/schema";
import type { DatabaseDialect } from "../db/url";
import type { AuditMetadata } from "../domains/audit/models/audit-event";
import type { RetentionPolicy } from "../domains/settings/models/retention-policy";

/**
 * The retention purge (feature 102): what an instance clears once it's older than root's
 * retention, by the rules in the spec's table. Each rule runs in batches of BATCH rows, the oldest
 * first, each batch its own short transaction, so a first run on an old instance never holds a
 * long lock and a run stopped halfway leaves the rest for the next. Idempotent: a second run at
 * the same moment changes nothing. The caller holds the job's lease (task 3) and chooses the
 * moment; this module knows nothing about schedules.
 */
export const PURGE_BATCH = 1000;

export type PurgeCounts = {
  /** IP addresses set to null, by table. */
  ipsCleared: { auditLog: number; sessions: number; deviceGrants: number };
  /** `auth.sign_in_failed` events whose typed email was removed from the metadata. */
  emailsCleared: number;
  sessionsDeleted: number;
  grantsDeleted: number;
};

export type PurgeOptions = {
  /** Count what a run would do and change nothing. */
  dryRun?: boolean;
  /** Called after every batch that changed rows (the lease's renewal, a progress line). */
  onBatch?: (done: number) => Promise<void> | void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBefore = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);

/** The moments a run compares against: a row older than one of these is past its retention. */
export const purgeCutoffs = (policy: RetentionPolicy, now: Date) => ({
  ip: daysBefore(now, policy.ipDays),
  sessions: daysBefore(now, policy.sessionsDays),
});

type Db = Kysely<Database>;

/**
 * Runs `batch` until it reports fewer than BATCH rows changed, adding up the rows. A batch that
 * changes nothing ends the loop too, so a rule whose match outlives its change can't spin.
 */
const inBatches = async (options: PurgeOptions, batch: () => Promise<number>): Promise<number> => {
  let total = 0;
  for (;;) {
    const changed = await batch();
    total += changed;
    if (changed > 0) await options.onBatch?.(total);
    if (changed < PURGE_BATCH) return total;
  }
};

const count = async (query: { execute: () => Promise<{ n: unknown }[]> }) =>
  Number((await query.execute())[0]?.n ?? 0);

/**
 * Clears `audit_log.ip_address` on events older than the IP retention. Only the id is read, and
 * the row is updated by id, so the batch's transaction touches those rows alone.
 */
const clearAuditIps = async (db: Db, dialect: DatabaseDialect, cutoff: Date, o: PurgeOptions) => {
  const matching = (q: Db) =>
    q
      .selectFrom("audit_log")
      .where("created_at", "<", toDbDate(cutoff, dialect))
      .where("ip_address", "is not", null);
  if (o.dryRun) return count(matching(db).select((eb) => eb.fn.countAll().as("n")));
  return inBatches(o, () =>
    db.transaction().execute(async (trx) => {
      const ids = (
        await matching(trx)
          .select("id")
          .orderBy("created_at")
          .orderBy("id")
          .limit(PURGE_BATCH)
          .execute()
      ).map((r) => r.id);
      if (ids.length === 0) return 0;
      const result = await trx
        .updateTable("audit_log")
        .set({ ip_address: null })
        .where("id", "in", ids)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    }),
  );
};

/** The last row a page read, so the next page starts after it (`created_at`, then `id`). */
type Cursor = { createdAt: Date | string; id: string };

/**
 * Removes the typed email from `auth.sign_in_failed` events older than the IP retention. The
 * metadata is JSON text on every dialect (MVP §9.4), so the rows are read and rewritten here, by
 * id; only the top-level `email` key goes, the reason and the rest stay. The LIKE narrows the
 * rows to read; what it matches without that key (`"email":` nested, or inside a value) is left
 * as it is, so the pages walk a keyset (`created_at`, `id`) past every row read, changed or not:
 * a thousand look-alikes can't hide a real one behind them. A dry run walks the same pages and
 * decodes the same rows, so it counts what a run would change, and writes nothing.
 */
const clearFailedSignInEmails = async (
  db: Db,
  dialect: DatabaseDialect,
  cutoff: Date,
  o: PurgeOptions,
) => {
  const page = (q: Db, after: Cursor | null) => {
    let query = q
      .selectFrom("audit_log")
      .select(["id", "metadata", "created_at"])
      .where("action", "=", "auth.sign_in_failed")
      .where("created_at", "<", toDbDate(cutoff, dialect))
      .where("metadata", "like", '%"email":%');
    if (after)
      query = query.where((eb) =>
        eb.or([
          eb("created_at", ">", after.createdAt),
          eb.and([eb("created_at", "=", after.createdAt), eb("id", ">", after.id)]),
        ]),
      );
    return query.orderBy("created_at").orderBy("id").limit(PURGE_BATCH).execute();
  };
  const hasEmail = (metadata: string) =>
    Object.hasOwn(decodeJson<AuditMetadata>(metadata), "email");
  const cursorOf = (row: { id: string; created_at: Date | string } | undefined) =>
    row && { createdAt: row.created_at, id: row.id };
  let total = 0;
  let after: Cursor | null = null;
  for (;;) {
    const { changed, read, last }: { changed: number; read: number; last: Cursor | undefined } =
      o.dryRun
        ? await page(db, after).then((rows) => ({
            changed: rows.filter((row) => hasEmail(row.metadata)).length,
            read: rows.length,
            last: cursorOf(rows.at(-1)),
          }))
        : await db.transaction().execute(async (trx) => {
            const rows = await page(trx, after);
            let changed = 0;
            for (const row of rows) {
              if (!hasEmail(row.metadata)) continue;
              const { email: _gone, ...rest } = decodeJson<AuditMetadata>(row.metadata);
              await trx
                .updateTable("audit_log")
                .set({ metadata: encodeJson(rest) })
                .where("id", "=", row.id)
                .execute();
              changed++;
            }
            return { changed, read: rows.length, last: cursorOf(rows.at(-1)) };
          });
    total += changed;
    // A dry run counts, like the other rules' dry runs: no batch to report.
    if (changed > 0 && !o.dryRun) await o.onBatch?.(total);
    if (read < PURGE_BATCH || !last) return total;
    // A page that ends where the last one did would be read for ever: a bug, not a state.
    if (after && last.id === after.id && String(last.createdAt) === String(after.createdAt))
      throw new Error("The failed sign-ins' page didn't advance past its last row");
    after = last;
  }
};

/** Clears the address and the user agent of sessions older than the IP retention, live or not. */
const clearSessionIps = async (db: Db, dialect: DatabaseDialect, cutoff: Date, o: PurgeOptions) => {
  const matching = (q: Db) =>
    q
      .selectFrom("session")
      .where("created_at", "<", toDbDate(cutoff, dialect))
      .where((eb) => eb.or([eb("ip_address", "is not", null), eb("user_agent", "is not", null)]));
  if (o.dryRun) return count(matching(db).select((eb) => eb.fn.countAll().as("n")));
  return inBatches(o, () =>
    db.transaction().execute(async (trx) => {
      const ids = (
        await matching(trx)
          .select("id")
          .orderBy("created_at")
          .orderBy("id")
          .limit(PURGE_BATCH)
          .execute()
      ).map((r) => r.id);
      if (ids.length === 0) return 0;
      const result = await trx
        .updateTable("session")
        .set({ ip_address: null, user_agent: null })
        .where("id", "in", ids)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    }),
  );
};

/** Deletes sessions that expired before the sessions retention. */
const deleteExpiredSessions = async (
  db: Db,
  dialect: DatabaseDialect,
  cutoff: Date,
  o: PurgeOptions,
) => {
  const matching = (q: Db) =>
    q.selectFrom("session").where("expires_at", "<", toDbDate(cutoff, dialect));
  if (o.dryRun) return count(matching(db).select((eb) => eb.fn.countAll().as("n")));
  return inBatches(o, () =>
    db.transaction().execute(async (trx) => {
      const ids = (
        await matching(trx)
          .select("id")
          .orderBy("expires_at")
          .orderBy("id")
          .limit(PURGE_BATCH)
          .execute()
      ).map((r) => r.id);
      if (ids.length === 0) return 0;
      const result = await trx.deleteFrom("session").where("id", "in", ids).executeTakeFirst();
      return Number(result.numDeletedRows);
    }),
  );
};

/** Clears both addresses of device grants (107) older than the IP retention. */
const clearGrantIps = async (db: Db, dialect: DatabaseDialect, cutoff: Date, o: PurgeOptions) => {
  const matching = (q: Db) =>
    q
      .selectFrom("device_grants")
      .where("created_at", "<", toDbDate(cutoff, dialect))
      .where((eb) =>
        eb.or([eb("requester_ip", "is not", null), eb("approver_ip", "is not", null)]),
      );
  if (o.dryRun) return count(matching(db).select((eb) => eb.fn.countAll().as("n")));
  return inBatches(o, () =>
    db.transaction().execute(async (trx) => {
      const ids = (
        await matching(trx)
          .select("id")
          .orderBy("created_at")
          .orderBy("id")
          .limit(PURGE_BATCH)
          .execute()
      ).map((r) => r.id);
      if (ids.length === 0) return 0;
      const result = await trx
        .updateTable("device_grants")
        .set({ requester_ip: null, approver_ip: null })
        .where("id", "in", ids)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    }),
  );
};

/**
 * Deletes device grants older than the sessions retention once they're finished: any status but
 * `pending`, or a `pending` one past its `expires_at` (107's sweep would mark it expired; with
 * the retention at a day or more, it has been for days, and nothing is left to tell anyone).
 */
const deleteFinishedGrants = async (
  db: Db,
  dialect: DatabaseDialect,
  cutoff: Date,
  now: Date,
  o: PurgeOptions,
) => {
  const matching = (q: Db) =>
    q
      .selectFrom("device_grants")
      .where("created_at", "<", toDbDate(cutoff, dialect))
      .where((eb) =>
        eb.or([eb("status", "!=", "pending"), eb("expires_at", "<", toDbDate(now, dialect))]),
      );
  if (o.dryRun) return count(matching(db).select((eb) => eb.fn.countAll().as("n")));
  return inBatches(o, () =>
    db.transaction().execute(async (trx) => {
      const ids = (
        await matching(trx)
          .select("id")
          .orderBy("created_at")
          .orderBy("id")
          .limit(PURGE_BATCH)
          .execute()
      ).map((r) => r.id);
      if (ids.length === 0) return 0;
      const result = await trx
        .deleteFrom("device_grants")
        .where("id", "in", ids)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    }),
  );
};

/** One purge at `now`, by `policy`. The rules run in the spec's order; each ends before the next. */
export const runRetentionPurge = async (
  db: Db,
  dialect: DatabaseDialect,
  policy: RetentionPolicy,
  now: Date,
  options: PurgeOptions = {},
): Promise<PurgeCounts> => {
  const cutoff = purgeCutoffs(policy, now);
  const auditLog = await clearAuditIps(db, dialect, cutoff.ip, options);
  const emailsCleared = await clearFailedSignInEmails(db, dialect, cutoff.ip, options);
  const sessions = await clearSessionIps(db, dialect, cutoff.ip, options);
  const sessionsDeleted = await deleteExpiredSessions(db, dialect, cutoff.sessions, options);
  const deviceGrants = await clearGrantIps(db, dialect, cutoff.ip, options);
  const grantsDeleted = await deleteFinishedGrants(db, dialect, cutoff.sessions, now, options);
  return {
    ipsCleared: { auditLog, sessions, deviceGrants },
    emailsCleared,
    sessionsDeleted,
    grantsDeleted,
  };
};
