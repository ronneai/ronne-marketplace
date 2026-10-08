import { parseManifest } from "@ronneai/core";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import type { Viewer } from "../../workspaces/models/viewer";
import { isReadableSubmission } from "../../workspaces/repositories/visible";
import { fileBytes, MANIFEST_PATH } from "../models/submission";
import type { NamedSubmission, OwnDraft, RegistryLookup } from "./registry-lookup";

/**
 * The registry as releases (015) fill it: published items and their versions, yanked ones marked,
 * each with its dependencies. It replaces 013's `unreleasedRegistry`; the checks don't change.
 * Since 056 it also lists the submissions of a name, for dependencies still in review.
 */
export const kyselyRegistryLookup = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  viewer: Viewer,
): RegistryLookup => {
  // What the viewer sees (093): a dependency in a workspace they don't see is an unknown name.
  const items = kyselyItemRepository(db, dialect, viewer);
  // Anything but "public" is private, as the viewer reads it (093).
  const privateWorkspaces = async (ids: readonly string[]): Promise<ReadonlySet<string>> => {
    if (ids.length === 0) return new Set();
    const rows = await db
      .selectFrom("workspaces")
      .select(["id", "visibility"])
      .where("id", "in", [...new Set(ids)])
      .execute();
    return new Set(rows.filter((row) => row.visibility !== "public").map((row) => row.id));
  };
  return {
    findItem: async (scope, name) => {
      const item = await items.findByName(scope, name);
      if (!item) return null;
      const isPrivate = (await privateWorkspaces([item.workspaceId])).has(item.workspaceId);
      return {
        id: item.id,
        scope: item.scope.name,
        name: item.name,
        type: item.type,
        workspace: { id: item.workspaceId, private: isPrivate },
      };
    },
    privateWorkspaces,
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
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "scopes.workspace_id",
          "workspaces.visibility",
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
        .where(isReadableSubmission(viewer, "submissions.id"))
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
            workspace: { id: row.workspace_id, private: row.visibility !== "public" },
          };
        }),
      );
    },
    ownDraftNamed: async (scope, name, authorId) => {
      const row = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "scopes.workspace_id",
          "workspaces.visibility",
          "submissions.id",
          "submissions.type",
        ])
        .where("scopes.name", "=", scope)
        .where("submissions.name", "=", name)
        .where("submissions.status", "=", "draft")
        .where("submissions.author_id", "=", authorId)
        .where(isReadableSubmission(viewer, "submissions.id"))
        .orderBy("submissions.updated_at", "desc")
        .orderBy("submissions.id", "desc")
        .limit(1)
        .executeTakeFirst();
      if (!row) return null;
      // A draft has no revision yet: its saved files are what would be submitted.
      const manifest = await db
        .selectFrom("submission_files")
        .select(["encoding", "content"])
        .where("submission_id", "=", row.id)
        .where("path", "=", MANIFEST_PATH)
        .executeTakeFirst();
      const parsed = manifest
        ? parseManifest(new TextDecoder().decode(fileBytes(manifest))).manifest
        : null;
      return {
        id: row.id,
        type: row.type as OwnDraft["type"],
        dependencies: (parsed?.dependencies ?? {}) as Record<string, string>,
        workspace: { id: row.workspace_id, private: row.visibility !== "public" },
      };
    },
  };
};
