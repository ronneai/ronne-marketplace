import type { Kysely } from "kysely";
import { disabledTargetsField } from "../../domains/items/models/listing";
import { columnTypes } from "../column-types";
import { decodeJson } from "../json";
import type { Database } from "../schema";
import type { AppMigration } from "./types";

/** Fills in 0011's column for versions released before it, from each version's manifest. */
export const backfillDisabledTargets = async (db: Kysely<Database>) => {
  const versions = await db.selectFrom("item_versions").select(["id", "manifest"]).execute();
  for (const version of versions) {
    const field = disabledTargetsField(decodeJson<Record<string, unknown>>(version.manifest));
    if (field)
      await db
        .updateTable("item_versions")
        .set({ disabled_targets: field })
        .where("id", "=", version.id)
        .execute();
  }
};

/**
 * The AI tools each version's manifest turns off (feature 026), so the catalogue can list the
 * items a tool supports in one query on every database.
 */
export const disabledTargets: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("item_versions")
      .addColumn("disabled_targets", t.string(200), (c) => c.notNull().defaultTo(""))
      .execute();
    await backfillDisabledTargets(db as Kysely<Database>);
  },
});
