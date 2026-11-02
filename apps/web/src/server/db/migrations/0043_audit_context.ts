import { type Kysely, sql } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Whether audit_log has the column or the index yet: MySQL commits each DDL statement, so a run
 * that failed half-way is run again from the start.
 */
const mysqlHas = async (db: Kysely<unknown>, kind: "column" | "index", name: string) => {
  const result =
    kind === "column"
      ? await sql`select 1 from information_schema.columns
          where table_schema = database() and table_name = 'audit_log' and column_name = ${name}`.execute(
          db,
        )
      : await sql`select 1 from information_schema.statistics
          where table_schema = database() and table_name = 'audit_log' and index_name = ${name}`.execute(
          db,
        );
  return result.rows.length > 0;
};

/**
 * What an audit event came from (feature 166): the request (its ID, as the logs have it), the
 * channel (`web`, `api`, `scim`, `cli` or `system`), the client (the user agent, cut to 256), the
 * workspace it's about (no foreign key: an event outlives its workspace, whose name stays in the
 * metadata) and the outcome (`success`, `failed` or `denied`). Older rows keep no channel and read
 * as successes. One column per statement: SQLite adds one at a time.
 */
export const auditContext: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    const columns = [
      // Compared byte for byte: the exact Request ID filter mustn't match one that differs only in
      // case, as MySQL's default collation would (docs/knowledge/collations.md).
      ["request_id", t.exactString(128)],
      ["via", t.string(16)],
      ["user_agent", t.string(256)],
      ["workspace_id", t.id()],
    ] as const;
    for (const [name, type] of columns)
      if (dialect !== "mysql" || !(await mysqlHas(db, "column", name)))
        await db.schema.alterTable("audit_log").addColumn(name, type).execute();
    if (dialect !== "mysql" || !(await mysqlHas(db, "column", "outcome")))
      await db.schema
        .alterTable("audit_log")
        .addColumn("outcome", t.string(16), (c) => c.notNull().defaultTo("success"))
        .execute();
    // A workspace's events newest first (the id is a ULID, so time order), and an event's request.
    for (const [name, on] of [
      ["audit_log_workspace_idx", ["workspace_id", "id"]],
      ["audit_log_request_idx", ["request_id"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHas(db, "index", name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("audit_log")
          .columns([...on])
          .execute();
  },
});
