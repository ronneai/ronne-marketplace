import type { Kysely } from "kysely";
import type { AppMigration } from "./types";

/**
 * Users sort by name in the admin list (feature 061): keyset pages order by the name, then the id.
 * Email is already unique (so indexed), and "created" sorts by the id.
 */
export const userNameIndex: AppMigration = () => ({
  async up(db: Kysely<unknown>) {
    await db.schema.createIndex("user_name_id_idx").on("user").columns(["name", "id"]).execute();
  },
});
