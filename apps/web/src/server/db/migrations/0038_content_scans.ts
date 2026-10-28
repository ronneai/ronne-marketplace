import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) =>
  (
    await sql`select 1 from information_schema.statistics
      where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(
      db,
    )
  ).rows.length > 0;

/**
 * The security scan of a submission revision (feature 135): queued when the revision is sent, then
 * running, then done or failed. A revision can have several ("Scan again"); the review page shows
 * the newest. Rows go with their revision (cascade). `findings` is the JSON array `parseSkillScan`
 * keeps (at most 200, each string at most 500 characters), so it can pass MySQL's 64 KB `text`:
 * `longText`. `error` is a short reason Ronne writes (`timeout`, `exit 2`), never the scanner's output.
 * `analysis` is what ran (`static`, or `semantic` when the LLM analysis ran); `llm_note` is
 * `unavailable` when semantic was asked for and didn't run; the provider and model are the ones the
 * operator set, kept so the panel can say who saw the files.
 */
export const contentScans: AppMigration = (dialect: DatabaseDialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("content_scans")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("revision_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "content_scans_revision_id_fk",
        ["revision_id"],
        "submission_revisions",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("scanner", t.string(32), (c) => c.notNull())
      .addColumn("scanner_version", t.string(64))
      .addColumn("status", t.string(16), (c) => c.notNull())
      .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("score", "integer")
      .addColumn("severity", t.string(16))
      .addColumn("recommendation", t.string(16))
      .addColumn("complete", t.boolean())
      .addColumn("analysis", t.string(16))
      .addColumn("llm_note", t.string(16))
      .addColumn("llm_provider", t.string(32))
      .addColumn("llm_model", t.string(128))
      .addColumn("findings", t.longText())
      .addColumn("findings_omitted", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("error", t.string(64))
      .addColumn("queued_at", t.timestamp(), (c) => c.notNull())
      .addColumn("started_at", t.timestamp())
      .addColumn("finished_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    // The job takes the oldest queued scan; the review page reads a revision's newest.
    for (const [name, columns] of [
      ["content_scans_status_idx", ["status", "queued_at"]],
      ["content_scans_revision_idx", ["revision_id", "queued_at"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, "content_scans", name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("content_scans")
          .columns([...columns])
          .execute();
  },
});
