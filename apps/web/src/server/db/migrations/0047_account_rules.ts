import { type Kysely, sql } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the column exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const hasColumn = async (db: Kysely<unknown>, dialect: string, table: string, name: string) => {
  if (dialect === "sqlite") {
    const { rows } = await sql<{
      name: string;
    }>`select name from pragma_table_info(${table})`.execute(db);
    return rows.some((r) => r.name === name);
  }
  const { rows } = await sql`select 1 from information_schema.columns
    where table_name = ${table} and column_name = ${name}
    and table_schema = ${dialect === "postgres" ? sql`current_schema()` : sql`database()`}`.execute(
    db,
  );
  return rows.length > 0;
};

/** A provider's stored domain list; anything unreadable is an empty list, as 106 reads it. */
const domainCount = (value: unknown): number => {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

/**
 * Who may create accounts (feature 191):
 * - `identity_providers.creates_accounts`, `any_domain` and `needs_approval`. 106's providers keep
 *   their behaviour: a provider creates accounts when its domain list isn't empty, for exactly
 *   those domains, with no approval.
 * - `user.created_via`: the way the account was made (`setup`, `root`, `sign_up`, `scim`,
 *   `provider:<id>`), backfilled as best it can be: a sign-up time, else SCIM, else the earliest
 *   provider link, else `unknown` (setup's root and Create user can't be told apart afterwards).
 *
 * `creates_accounts` and `created_via` have no default: null is "not backfilled yet". Every save
 * and every new account writes a value, and the backfill fills only nulls, so a rerun after a
 * failed run (MySQL commits each DDL statement) finishes the backfill and never overwrites what
 * was saved since. A null left anyway reads as off, or `unknown`.
 * The block list is a setting with its default in code (empty), so no setting row is written here.
 */
export const accountRules: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    const yes = dialect === "sqlite" ? 1 : true;
    const no = dialect === "sqlite" ? 0 : false;
    for (const column of ["any_domain", "needs_approval"])
      if (!(await hasColumn(db, dialect, "identity_providers", column)))
        await db.schema
          .alterTable("identity_providers")
          .addColumn(column, t.boolean(), (c) => c.notNull().defaultTo(false))
          .execute();
    if (!(await hasColumn(db, dialect, "identity_providers", "creates_accounts")))
      await db.schema
        .alterTable("identity_providers")
        .addColumn("creates_accounts", t.boolean())
        .execute();
    const providers = await sql<{
      id: string;
      domains: unknown;
    }>`select id, domains from identity_providers where creates_accounts is null`.execute(db);
    for (const p of providers.rows)
      await sql`update identity_providers set creates_accounts = ${domainCount(p.domains) > 0 ? yes : no}
        where id = ${p.id} and creates_accounts is null`.execute(db);

    if (!(await hasColumn(db, dialect, "user", "created_via")))
      await db.schema.alterTable("user").addColumn("created_via", t.string(48)).execute();
    // The surest evidence first, each step only over what no step has decided: a sign-up time,
    // which only a sign-up writes; SCIM, which provisions before anyone signs in; the earliest
    // provider link (a link may have been added to an account that existed); else unknown.
    await sql`update ${sql.table("user")} set created_via = 'sign_up'
      where created_via is null and signed_up_at is not null`.execute(db);
    await sql`update ${sql.table("user")} set created_via = 'scim'
      where created_via is null and id in (select user_id from scim_users)`.execute(db);
    const links = await sql<{
      user_id: string;
      provider_id: string;
    }>`select a.user_id, a.provider_id
      from account a inner join identity_providers p on p.id = a.provider_id
      inner join ${sql.table("user")} u on u.id = a.user_id
      where u.created_via is null
      order by a.created_at, a.id`.execute(db);
    const earliest = new Map<string, string>();
    for (const link of links.rows)
      if (!earliest.has(link.user_id)) earliest.set(link.user_id, link.provider_id);
    for (const [userId, providerId] of earliest)
      await sql`update ${sql.table("user")} set created_via = ${`provider:${providerId}`}
        where id = ${userId} and created_via is null`.execute(db);
    await sql`update ${sql.table("user")} set created_via = 'unknown'
      where created_via is null`.execute(db);
  },
});
