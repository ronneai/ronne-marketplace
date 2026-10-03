import type { Kysely } from "kysely";
import type { AppMigration } from "./types";

/**
 * My submissions' sorts (feature 063): one author's submissions, paged by the last change or by
 * the item name, with the id as tiebreak.
 */
export const submissionsAuthorIndexes: AppMigration = () => ({
  async up(db: Kysely<unknown>) {
    for (const [name, column] of [
      ["submissions_author_updated_idx", "updated_at"],
      ["submissions_author_name_idx", "name"],
    ] as const)
      await db.schema
        .createIndex(name)
        .on("submissions")
        .columns(["author_id", column, "id"])
        .execute();
  },
});
