import type { Kysely } from "kysely";
import type { AppMigration } from "./types";

/**
 * The review queue's sorts (feature 062): each tab filters by status, then pages by the time it
 * shows (the first submit, or the last change) or by the item name, with the id as tiebreak.
 */
export const submissionsQueueIndexes: AppMigration = () => ({
  async up(db: Kysely<unknown>) {
    for (const [name, column] of [
      ["submissions_status_submitted_idx", "submitted_at"],
      ["submissions_status_updated_idx", "updated_at"],
      ["submissions_status_name_idx", "name"],
    ] as const)
      await db.schema
        .createIndex(name)
        .on("submissions")
        .columns(["status", column, "id"])
        .execute();
  },
});
