import type { Kysely } from "kysely";
import type { Database } from "./schema";

/**
 * The catalogue revision (feature 079): one counter for the instance, raised with every change that
 * can change a plugin feed. Raised through the same connection as the change, so inside its
 * transaction it commits or rolls back with it.
 */
export const bumpCatalogueRevision = async (db: Kysely<Database>): Promise<void> => {
  await db
    .updateTable("catalogue_revision")
    .set((eb) => ({ revision: eb("revision", "+", 1) }))
    .where("id", "=", 1)
    .execute();
};

export type CatalogueRevision = {
  /** This database's random id, from its migration. */
  instance: string;
  revision: number;
};

export const catalogueRevision = async (db: Kysely<Database>): Promise<CatalogueRevision> => {
  const row = await db
    .selectFrom("catalogue_revision")
    .select(["instance", "revision"])
    .where("id", "=", 1)
    .executeTakeFirstOrThrow();
  return { instance: row.instance, revision: Number(row.revision) };
};
