import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Scheduled jobs (feature 102): one row per job name, made on first use. A run holds the row's
 * lease (`lease_holder`, a random id per run, until `lease_ends_at`) while it works, renewing it
 * batch by batch, so one run happens at a time however many processes or replicas (111) start it;
 * a run that dies leaves a lease that expires. `last_run_at` and `last_result` (JSON: when, how
 * long, the counts or the error's name) are what the Privacy tab shows.
 */
export const jobs: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("jobs")
      .addColumn("name", t.string(64), (c) => c.primaryKey())
      .addColumn("lease_holder", t.id())
      .addColumn("lease_ends_at", t.timestamp())
      .addColumn("last_run_at", t.timestamp())
      .addColumn("last_result", t.json())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
