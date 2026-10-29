import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * What a reviewer's mark on a scan finding says (feature 137): `false_positive` (the finding is
 * wrong) or `accepted` (it's real, and the risk is known and fine). Marks made before are false
 * positives, which was the only kind.
 */
export const scanDismissalKind: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("scan_dismissals")
      .addColumn("kind", t.string(16), (c) => c.notNull().defaultTo("false_positive"))
      .execute();
  },
});
