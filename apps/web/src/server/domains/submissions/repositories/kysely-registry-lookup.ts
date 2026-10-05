import { parseManifest } from "@ronneai/core";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { fileBytes, MANIFEST_PATH } from "../models/submission";
import type { NamedSubmission, RegistryLookup } from "./registry-lookup";

/**
 * The registry as releases (015) fill it: published items and their versions, yanked ones marked,
 * each with its dependencies. It replaces 013's `unreleasedRegistry`; the checks don't change.
 * Since 056 it also lists the submissions of a name, for dependencies still in review.
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
    submissionsNamed: async (scope, name) => {
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .select([
          "submissions.id",
          "submissions.status",
          "submissions.type",
          "submissions.item_id",
          "submissions.author_id",
          "submissions.updated_at",
        ])
        .where("scopes.name", "=", scope)
        .where("submissions.name", "=", name)
        .where("submissions.status", "!=", "draft")
        .orderBy("submissions.updated_at", "desc")
        .orderBy("submissions.id", "desc")
        .execute();
      return Promise.all(
        rows.map(async (row): Promise<NamedSubmission> => {
          // The latest revision's manifest: what reviewers see, and what would be released.
          const manifest = await db
            .selectFrom("submission_revision_files")
            .innerJoin(
              "submission_revisions",
              "submission_revisions.id",
              "submission_revision_files.revision_id",
            )
            .select(["submission_revision_files.encoding", "submission_revision_files.content"])
            .where("submission_revisions.submission_id", "=", row.id)
            .where("submission_revision_files.path", "=", MANIFEST_PATH)
            .orderBy("submission_revisions.number", "desc")
            .limit(1)
            .executeTakeFirst();
          const parsed = manifest
            ? parseManifest(new TextDecoder().decode(fileBytes(manifest))).manifest
            : null;
          return {
            id: row.id,
            status: row.status as NamedSubmission["status"],
            type: row.type as NamedSubmission["type"],
            authorId: row.author_id,
            proposal: row.item_id !== null,
            dependencies: (parsed?.dependencies ?? {}) as Record<string, string>,
          };
        }),
      );
    },
  };
};
