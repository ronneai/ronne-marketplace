import type { ItemType, RiskFlag } from "@ronneai/core";
import type { Kysely } from "kysely";
import { bumpCatalogueRevision } from "../../../db/catalogue-revision";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson, encodeJson } from "../../../db/json";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { Viewer } from "../../workspaces/models/viewer";
import {
  inVisibleWorkspace,
  isVisibleItem,
  isVisibleSubmission,
} from "../../workspaces/repositories/visible";
import type { VersionFile } from "../models/item";
import { disabledTargetsField, listingOf, searchFieldsOf } from "../models/listing";
import type { ItemRepository } from "./item-repository";

/** Recomputes how the catalogue lists an item (feature 018) after its versions or tags change. */
const refreshListing = async (db: Kysely<Database>, dialect: DatabaseDialect, itemId: string) => {
  const versions = await db
    .selectFrom("item_versions")
    .select(["id", "published_at", "yanked_at"])
    .where("item_id", "=", itemId)
    .execute();
  const latest = await db
    .selectFrom("dist_tags")
    .select("version_id")
    .where("item_id", "=", itemId)
    .where("tag", "=", "latest")
    .executeTakeFirst();
  const listing = listingOf(
    versions.map((v) => ({
      id: v.id,
      publishedAt: fromDbDate(v.published_at),
      yankedAt: fromDbDate(v.yanked_at),
    })),
    latest?.version_id ?? null,
  );
  await db
    .updateTable("items")
    .set({
      listed_version_id: listing.listedVersionId,
      installable: toDbBoolean(listing.installable, dialect),
      last_published_at: listing.lastPublishedAt
        ? toDbDate(listing.lastPublishedAt, dialect)
        : null,
    })
    .where("id", "=", itemId)
    .execute();
};

/**
 * Items and versions as `viewer` sees them (093): every read filters on the item's workspace, so a
 * private workspace's items answer as unknown to anyone but its members and root. Writes don't
 * filter: the services authorise them, and they act on items a read already found.
 */
export const kyselyItemRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  viewer: Viewer,
): ItemRepository => ({
  transaction: (work) =>
    readCommittedTransaction(db, dialect).execute((trx) =>
      work(kyselyItemRepository(trx, dialect, viewer)),
    ),

  findByName: async (scope, name) => {
    const row = await db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .where(inVisibleWorkspace(viewer, "scopes.workspace_id"))
      .select([
        "items.id",
        "items.scope_id",
        "scopes.name as scope_name",
        "workspaces.name as workspace_name",
        "scopes.workspace_id",
        "items.name",
        "items.type",
        "items.description",
        "items.owner_id",
        "items.created_at",
        "items.download_count",
      ])
      .where("scopes.name", "=", scope)
      .where("items.name", "=", name)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          scope: { id: row.scope_id, name: row.scope_name },
          workspace: row.workspace_name,
          workspaceId: row.workspace_id,
          name: row.name,
          type: row.type as ItemType,
          description: row.description,
          ownerId: row.owner_id,
          createdAt: fromDbDate(row.created_at),
          downloadCount: Number(row.download_count),
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
    await bumpCatalogueRevision(db);
  },

  versions: async (itemId) => {
    const rows = await db
      .selectFrom("item_versions")
      .leftJoin("user", "user.id", "item_versions.published_by")
      .select([
        "item_versions.id",
        "item_versions.item_id",
        "item_versions.version",
        "item_versions.sha256",
        "item_versions.size",
        "item_versions.artifact_path",
        "item_versions.published_at",
        "item_versions.yanked_at",
        "item_versions.yank_reason",
        "item_versions.deprecated_message",
        "item_versions.published_by",
        "user.name as published_by_name",
        "item_versions.disabled_targets",
      ])
      .where("item_versions.item_id", "=", itemId)
      .where(isVisibleItem(viewer, "item_versions.item_id"))
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
      artifactPath: row.artifact_path,
      publishedAt: fromDbDate(row.published_at),
      yankedAt: fromDbDate(row.yanked_at),
      yankReason: row.yank_reason,
      deprecatedMessage: row.deprecated_message,
      publishedBy: row.published_by,
      publishedByName: row.published_by_name,
      dependencies: Object.fromEntries(
        dependencies
          .filter((dependency) => dependency.version_id === row.id)
          .map((dependency) => [`@${dependency.scope_name}/${dependency.name}`, dependency.range]),
      ),
      disabledTargets: row.disabled_targets.split(" ").filter(Boolean),
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
        yank_reason: null,
        submission_id: version.submissionId,
        ...searchFieldsOf(version.manifest),
        disabled_targets: disabledTargetsField(version.manifest),
        risk_flags: encodeJson(version.riskFlags),
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
    await refreshListing(db, dialect, version.itemId);
    await bumpCatalogueRevision(db);
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
    await refreshListing(db, dialect, itemId);
    await bumpCatalogueRevision(db);
    return current?.version_id ?? null;
  },

  lockItem: async (itemId) => {
    await forUpdate(
      db.selectFrom("items").select("id").where("id", "=", itemId),
      dialect,
    ).execute();
  },

  tags: async (itemId) =>
    (
      await db
        .selectFrom("dist_tags")
        .select(["tag", "version_id"])
        .where("item_id", "=", itemId)
        .where(isVisibleItem(viewer, "dist_tags.item_id"))
        .execute()
    )
      .map((row) => ({ tag: row.tag, versionId: row.version_id }))
      .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)),

  removeTag: async (itemId, tag) => {
    await db.deleteFrom("dist_tags").where("item_id", "=", itemId).where("tag", "=", tag).execute();
    await refreshListing(db, dialect, itemId);
    await bumpCatalogueRevision(db);
  },

  setDeprecated: async (versionId, message) => {
    await db
      .updateTable("item_versions")
      .set({ deprecated_message: message })
      .where("id", "=", versionId)
      .execute();
    await bumpCatalogueRevision(db);
  },

  setYanked: async (versionId, yanked) => {
    await db
      .updateTable("item_versions")
      .set({
        yanked_at: yanked ? toDbDate(yanked.at, dialect) : null,
        yank_reason: yanked?.reason ?? null,
      })
      .where("id", "=", versionId)
      .execute();
    const version = await db
      .selectFrom("item_versions")
      .select("item_id")
      .where("id", "=", versionId)
      .executeTakeFirst();
    if (version) await refreshListing(db, dialect, version.item_id);
    await bumpCatalogueRevision(db);
  },

  recordAudit: async (event, now) => {
    await recordAudit(db, dialect, event, now);
  },

  versionDetail: async (versionId) => {
    const row = await db
      .selectFrom("item_versions")
      .select(["manifest", "readme", "files", "notes", "risk_flags", "submission_id"])
      .where("id", "=", versionId)
      .where(isVisibleItem(viewer, "item_versions.item_id"))
      .executeTakeFirst();
    return row
      ? {
          manifest: decodeJson<Record<string, unknown>>(row.manifest),
          readme: row.readme,
          files: decodeJson<VersionFile[]>(row.files),
          notes: row.notes,
          riskFlags: decodeJson<RiskFlag[]>(row.risk_flags) ?? [],
          submissionId: row.submission_id,
        }
      : null;
  },

  dependents: async (itemId) => {
    const rows = await db
      .selectFrom("version_dependencies")
      .innerJoin("items", "items.listed_version_id", "version_dependencies.version_id")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("item_versions", "item_versions.id", "items.listed_version_id")
      .select([
        "scopes.name as scope_name",
        "items.name",
        "items.type",
        "item_versions.version",
        "version_dependencies.range",
      ])
      .where("version_dependencies.depends_on_item_id", "=", itemId)
      // "Used by" lists only the dependents the viewer sees, of an item they see.
      .where(inVisibleWorkspace(viewer, "scopes.workspace_id"))
      .where(isVisibleItem(viewer, "version_dependencies.depends_on_item_id"))
      .orderBy("scopes.name")
      .orderBy("items.name")
      .execute();
    return rows.map((row) => ({
      scope: row.scope_name,
      name: row.name,
      type: row.type as ItemType,
      version: row.version,
      range: row.range,
    }));
  },

  approval: async (submissionId) => {
    const row = await db
      .selectFrom("review_events")
      .leftJoin("user", "user.id", "review_events.actor_id")
      .select(["review_events.kind", "review_events.created_at", "user.name"])
      .where("review_events.submission_id", "=", submissionId)
      .where(isVisibleSubmission(viewer, "review_events.submission_id"))
      .where("review_events.kind", "in", ["approve", "override"])
      .orderBy("review_events.created_at", "desc")
      .executeTakeFirst();
    return row
      ? { by: row.name ?? null, at: fromDbDate(row.created_at), override: row.kind === "override" }
      : null;
  },

  countDownload: async (itemId) => {
    await db
      .updateTable("items")
      .set((eb) => ({ download_count: eb("download_count", "+", 1) }))
      .where("id", "=", itemId)
      .execute();
  },

  userName: async (userId) =>
    (await db.selectFrom("user").select("name").where("id", "=", userId).executeTakeFirst())
      ?.name ?? null,
});
