import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * A change proposal's open rebase conflicts (feature 017): JSON, the paths changed both by the author
 * and in the version the proposal was rebased onto. The author resolves each; submitting waits
 * until none is left. Null when there are none.
 */
export const proposalConflicts: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("submissions").addColumn("rebase_conflicts", t.json()).execute();
  },
});
