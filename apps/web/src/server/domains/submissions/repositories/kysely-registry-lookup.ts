import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import type { RegistryLookup } from "./registry-lookup";

/**
 * The registry as releases (015) fill it: published items and their versions, yanked ones marked,
 * each with its dependencies. It replaces 013's `unreleasedRegistry`; the checks don't change.
 */
export const kyselyRegistryLookup = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): RegistryLookup => {
  const items = kyselyItemRepository(db, dialect);
  return {
    findItem: async (scope, name) => {
      const item = await items.findByName(scope, name);
      return item
        ? { id: item.id, scope: item.scope.name, name: item.name, type: item.type }
        : null;
    },
    publishedVersions: async (itemId) =>
      (await items.versions(itemId)).map((version) => ({
        id: version.id,
        version: version.version,
        publishedAt: version.publishedAt,
        artifactPath: version.artifactPath,
        sha256: version.sha256,
        yanked: version.yankedAt !== null,
        dependencies: version.dependencies,
      })),
  };
};
