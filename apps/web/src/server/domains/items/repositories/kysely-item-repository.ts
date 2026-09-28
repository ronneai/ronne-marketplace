import type { ItemType } from "@ronneai/core";
import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { encodeJson } from "../../../db/json";
import { forUpdate } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { ItemRepository } from "./item-repository";

export const kyselyItemRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ItemRepository => ({
  findByName: async (scope, name) => {
    const row = await db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .select([
        "items.id",
        "items.scope_id",
        "scopes.name as scope_name",
        "items.name",
        "items.type",
        "items.description",
        "items.owner_id",
        "items.created_at",
      ])
      .where("scopes.name", "=", scope)
      .where("items.name", "=", name)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          scope: { id: row.scope_id, name: row.scope_name },
          name: row.name,
          type: row.type as ItemType,
          description: row.description,
          ownerId: row.owner_id,
          createdAt: fromDbDate(row.created_at),
        }
      : null;
  },

  insertItem: async (item) => {
    const id = newId();
    await db
      .insertInto("items")
      .values({
        id,
        scope_id: item.scopeId,
        name: item.name,
        type: item.type,
        description: item.description,
        owner_id: item.ownerId,
        created_at: toDbDate(item.createdAt, dialect),
      })
      .execute();
    return id;
  },

  updateDescription: async (itemId, description) => {
    await db.updateTable("items").set({ description }).where("id", "=", itemId).execute();
  },

  versions: async (itemId) => {
    const rows = await db
      .selectFrom("item_versions")
      .select([
        "id",
        "item_id",
        "version",
        "sha256",
        "size",
        "published_at",
        "yanked_at",
        "deprecated_message",
      ])
      .where("item_id", "=", itemId)
      .execute();
    const dependencies = rows.length
      ? await db
          .selectFrom("version_dependencies")
          .innerJoin("items", "items.id", "version_dependencies.depends_on_item_id")
          .innerJoin("scopes", "scopes.id", "items.scope_id")
          .select([
            "version_dependencies.version_id",
            "version_dependencies.range",
            "items.name",
            "scopes.name as scope_name",
          ])
          .where(
            "version_dependencies.version_id",
            "in",
            rows.map((row) => row.id),
          )
          .execute()
      : [];
    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      version: row.version,
      sha256: row.sha256,
      size: Number(row.size),
      publishedAt: fromDbDate(row.published_at),
      yankedAt: fromDbDate(row.yanked_at),
      deprecatedMessage: row.deprecated_message,
      dependencies: Object.fromEntries(
        dependencies
          .filter((dependency) => dependency.version_id === row.id)
          .map((dependency) => [`@${dependency.scope_name}/${dependency.name}`, dependency.range]),
      ),
    }));
  },

  insertVersion: async (version) => {
    const id = newId();
    await db
      .insertInto("item_versions")
      .values({
        id,
        item_id: version.itemId,
        version: version.version,
        manifest: encodeJson(version.manifest),
        readme: version.readme,
        files: encodeJson(version.files),
        notes: version.notes,
        artifact_path: version.artifactPath,
        sha256: version.sha256,
        size: version.size,
        published_by: version.publishedBy,
        published_at: toDbDate(version.publishedAt, dialect),
        deprecated_message: null,
        yanked_at: null,
        submission_id: version.submissionId,
      })
      .execute();
    for (const dependency of version.dependencies)
      await db
        .insertInto("version_dependencies")
        .values({
          version_id: id,
          depends_on_item_id: dependency.itemId,
          range: dependency.range,
        })
        .execute();
    return id;
  },

  setTag: async (itemId, tag, versionId) => {
    const current = await db
      .selectFrom("dist_tags")
      .select("version_id")
      .where("item_id", "=", itemId)
      .where("tag", "=", tag)
      .executeTakeFirst();
    if (current)
      await db
        .updateTable("dist_tags")
        .set({ version_id: versionId })
        .where("item_id", "=", itemId)
        .where("tag", "=", tag)
        .execute();
    else
      await db
        .insertInto("dist_tags")
        .values({ item_id: itemId, tag, version_id: versionId })
        .execute();
    return current?.version_id ?? null;
  },

  lockItem: async (itemId) => {
    await forUpdate(
      db.selectFrom("items").select("id").where("id", "=", itemId),
      dialect,
    ).execute();
  },
});
