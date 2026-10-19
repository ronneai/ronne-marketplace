import { type Kysely, type SqlBool, sql } from "kysely";
import { decodeJson, encodeJson } from "../../../db/json";
import type { Database } from "../../../db/schema";
import { escapeLike, LIKE_ESCAPE } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import type { AuditMetadataValue } from "../models/audit-event";

/**
 * The one kind of change an erasure (feature 103) makes to the audit log, which is otherwise
 * insert-only (007; this file is on the guard test's allowlist): the events stay, but the person
 * leaves them. Their IP address goes from every event they acted in or were the target of, now
 * rather than at the retention's age (102), and their email, wherever an event's metadata holds
 * it as a value (`user.created`, `user.updated`'s relink, `auth.sign_in_failed`, SCIM's), becomes
 * the pseudonym's. Nothing else in a row changes, and no row is ever deleted.
 */
export const REWRITE_BATCH = 500;

export type EmailRewrite = {
  userId: string;
  /** The address to find, as it was stored (normalised). */
  email: string;
  /** The pseudonym's address that takes its place. */
  replacement: string;
};

export type RewriteOptions = {
  /** Rows per page; the default is REWRITE_BATCH. */
  batch?: number;
  /**
   * Runs one page's read and writes: in the caller's transaction (an identity function), or in
   * a short transaction of its own on MySQL after the main one committed (103's edge case).
   */
  inBatch: <T>(work: (db: Kysely<Database>) => Promise<T>) => Promise<T>;
  /** Called after every page that changed rows, with the rows changed so far. */
  onBatch?: (done: number) => Promise<void> | void;
};

type Db = Kysely<Database>;

/** Clears `ip_address` on every event the user acted in or was the target of. Returns how many. */
export const clearAuditIpsOf = async (db: Db, userId: string): Promise<number> => {
  const result = await db
    .updateTable("audit_log")
    .set({ ip_address: null })
    .where("ip_address", "is not", null)
    .where((eb) =>
      eb.or([
        eb("actor_id", "=", userId),
        eb.and([eb("target_type", "=", "user"), eb("target_id", "=", userId)]),
      ]),
    )
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
};

/** Every string equal to the address (any case, as the databases match it), at any depth, replaced. */
const replaced = (
  value: AuditMetadataValue,
  email: string,
  replacement: string,
): { value: AuditMetadataValue; changed: boolean } => {
  if (typeof value === "string")
    return value.toLowerCase() === email
      ? { value: replacement, changed: true }
      : { value, changed: false };
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const r = replaced(item, email, replacement);
      changed ||= r.changed;
      return r.value;
    });
    return { value: items, changed };
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([key, nested]) => {
      const r = replaced(nested, email, replacement);
      changed ||= r.changed;
      return [key, r.value] as const;
    });
    return { value: Object.fromEntries(entries), changed };
  }
  return { value, changed: false };
};

/** The last row a page read, so the next page starts after it (`created_at`, then `id`). */
type Cursor = { createdAt: Date | string; id: string };

/**
 * Rewrites the address in the metadata of the events that hold it: those found by a LIKE for the
 * address as a JSON string value (`"<address>"`, so a longer address that contains it never
 * matches), and those whose target is the user, whatever their metadata holds. Each page walks a
 * keyset past every row read, changed or not. Returns how many rows changed. Idempotent: once
 * rewritten, nothing matches.
 */
export const rewriteErasedEmail = async (
  job: EmailRewrite,
  options: RewriteOptions,
): Promise<number> => {
  const batch = options.batch ?? REWRITE_BATCH;
  const email = job.email.toLowerCase();
  // The address as JSON text, so the match is a whole string value; `!` escapes LIKE's wildcards
  // (`_` is one, and an address may hold it), and the query says so.
  const needle = `%${escapeLike(encodeJson(job.email))}%`;
  const holdsAddress = sql<SqlBool>`${sql.ref("metadata")} like ${needle} escape ${sql.lit(LIKE_ESCAPE)}`;
  const page = (q: Db, after: Cursor | null) => {
    let query = q
      .selectFrom("audit_log")
      .select(["id", "metadata", "created_at"])
      .where((eb) =>
        eb.or([
          holdsAddress,
          eb.and([eb("target_type", "=", "user"), eb("target_id", "=", job.userId)]),
        ]),
      );
    if (after)
      query = query.where((eb) =>
        eb.or([
          eb("created_at", ">", after.createdAt),
          eb.and([eb("created_at", "=", after.createdAt), eb("id", ">", after.id)]),
        ]),
      );
    return query.orderBy("created_at").orderBy("id").limit(batch).execute();
  };
  let total = 0;
  let after: Cursor | null = null;
  for (;;) {
    const { changed, read, last } = await options.inBatch(async (trx) => {
      const rows = await page(trx, after);
      let changed = 0;
      for (const row of rows) {
        const r = replaced(decodeJson<AuditMetadataValue>(row.metadata), email, job.replacement);
        if (!r.changed) continue;
        await trx
          .updateTable("audit_log")
          .set({ metadata: encodeJson(r.value) })
          .where("id", "=", row.id)
          .execute();
        changed++;
      }
      const lastRow = rows.at(-1);
      return {
        changed,
        read: rows.length,
        last: lastRow ? { createdAt: lastRow.created_at, id: lastRow.id } : undefined,
      };
    });
    total += changed;
    if (changed > 0) await options.onBatch?.(total);
    if (read < batch || !last) return total;
    // A page that ends where the last one did would be read for ever: a bug, not a state.
    if (after && last.id === after.id && String(last.createdAt) === String(after.createdAt))
      throw new Error("The erasure's rewrite page didn't advance past its last row");
    after = last;
  }
};

/** Whether `dialect` runs the rewrite after the main transaction (103's MySQL edge case). */
export const rewritesAfterCommit = (dialect: DatabaseDialect): boolean => dialect === "mysql";
