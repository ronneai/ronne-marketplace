import { type RiskFlag, riskFlags } from "@ronneai/core";
import type { Kysely } from "kysely";
import { listingOf, searchFieldsOf } from "../../domains/items/models/listing";
import { columnTypes } from "../column-types";
import { fromDbDate, toDbBoolean, toDbDate } from "../dates";
import { decodeJson, encodeJson } from "../json";
import type { Database } from "../schema";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

const bytesOf = (file: { encoding: string; content: string }) =>
  file.encoding === "utf8"
    ? new TextEncoder().encode(file.content)
    : Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));

/**
 * Fills in what 0009 adds for versions and items released before it: each version's description,
 * keywords and risk flags (from the revision it was released from), and each item's listing.
 */
export const backfillCatalogue = async (db: Kysely<Database>, dialect: DatabaseDialect) => {
  const items = await db.selectFrom("items").select("id").execute();
  for (const item of items) {
    const versions = await db
      .selectFrom("item_versions")
      .select(["id", "manifest", "files", "submission_id", "published_at", "yanked_at"])
      .where("item_id", "=", item.id)
      .execute();
    for (const version of versions) {
      const manifest = decodeJson<Record<string, unknown>>(version.manifest);
      const revision = version.submission_id
        ? await db
            .selectFrom("submission_revisions")
            .select("id")
            .where("submission_id", "=", version.submission_id)
            .orderBy("number", "desc")
            .limit(1)
            .executeTakeFirst()
        : undefined;
      const files = revision
        ? (
            await db
              .selectFrom("submission_revision_files")
              .select(["path", "encoding", "content", "executable"])
              .where("revision_id", "=", revision.id)
              .execute()
          ).map((f) => ({ path: f.path, bytes: bytesOf(f), executable: Boolean(f.executable) }))
        : decodeJson<{ path: string; executable: boolean }[]>(version.files).map((f) => ({
            path: f.path,
            bytes: new Uint8Array(),
            executable: f.executable,
          }));
      const flags: RiskFlag[] = riskFlags(manifest as never, files);
      await db
        .updateTable("item_versions")
        .set({ ...searchFieldsOf(manifest), risk_flags: encodeJson(flags) })
        .where("id", "=", version.id)
        .execute();
    }
    const latest = await db
      .selectFrom("dist_tags")
      .select("version_id")
      .where("item_id", "=", item.id)
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
      .where("id", "=", item.id)
      .execute();
  }
};

/**
 * The catalogue and the home page (feature 018): what an item lists (its shown version, whether it
 * can be installed, when it was last released), its download count, and each version's search
 * fields and risk flags, computed once at release instead of on every page.
 */
export const catalogue: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("items")
      .addColumn("download_count", "integer", (c) => c.notNull().defaultTo(0))
      .execute();
    await db.schema.alterTable("items").addColumn("listed_version_id", t.id()).execute();
    await db.schema
      .alterTable("items")
      .addColumn("installable", t.boolean(), (c) => c.notNull().defaultTo(false))
      .execute();
    await db.schema.alterTable("items").addColumn("last_published_at", t.timestamp()).execute();
    await db.schema
      .alterTable("item_versions")
      .addColumn("description", t.string(300), (c) => c.notNull().defaultTo(""))
      .execute();
    await db.schema
      .alterTable("item_versions")
      .addColumn("keywords", t.string(400), (c) => c.notNull().defaultTo(""))
      .execute();
    await db.schema.alterTable("item_versions").addColumn("risk_flags", t.longText()).execute();
    await db.schema
      .createIndex("items_listing_recent")
      .on("items")
      .columns(["installable", "last_published_at"])
      .execute();
    await db.schema
      .createIndex("items_download_count")
      .on("items")
      .column("download_count")
      .execute();
    await backfillCatalogue(db as Kysely<Database>, dialect);
  },
});
