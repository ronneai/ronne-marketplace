import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

/**
 * A reviewer marks one finding of a security scan a false positive (feature 137), with a reason.
 * A finding is its position in the scan's kept findings, which never change once the scan is
 * stored; each is dismissed at most once (restoring deletes the row). Rows go with their scan
 * (cascade); the reviewer's row stays, as review events' do (an erased user is a pseudonym).
 */
export const scanDismissals: AppMigration = (dialect: DatabaseDialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("scan_dismissals")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("scan_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "scan_dismissals_scan_id_fk",
        ["scan_id"],
        "content_scans",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("finding", "integer", (c) => c.notNull())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("scan_dismissals_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("reason", t.text(), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addUniqueConstraint("scan_dismissals_scan_finding_unique", ["scan_id", "finding"])
      .$call(tableDefaults(dialect))
      .execute();
  },
});
