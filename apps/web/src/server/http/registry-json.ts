import type { CatalogueEntry } from "../domains/items/actions/catalogue";
import type { ItemPage, VersionRow } from "../domains/items/actions/versions";

/**
 * The JSON `/api/v1` answers for items and versions (spec 019). Names are `@scope/name`, times ISO
 * 8601 in UTC, and `deprecated` is the message or null.
 */
const nameOf = (item: { scope: string | { name: string }; name: string }) =>
  `@${typeof item.scope === "string" ? item.scope : item.scope.name}/${item.name}`;

export const itemSummaryJson = (entry: CatalogueEntry) => ({
  name: nameOf(entry),
  type: entry.type,
  description: entry.description,
  keywords: entry.keywords,
  version: entry.version,
  publishedAt: entry.publishedAt.toISOString(),
  deprecated: entry.deprecatedMessage,
  installable: entry.installable,
  risky: entry.risky,
  downloads: entry.downloadCount,
});

const versionRowJson = (v: VersionRow) => ({
  version: v.version,
  publishedAt: v.publishedAt.toISOString(),
  sha256: v.sha256,
  size: v.size,
  deprecated: v.deprecatedMessage,
  yanked: v.yankedAt !== null,
  dependencies: v.dependencies,
});

/** An item, its tags and its versions, newest first, yanked ones included. */
export const itemJson = (page: ItemPage) => ({
  name: nameOf(page.item),
  type: page.item.type,
  description: page.item.description,
  owner: page.ownerName,
  downloads: page.item.downloadCount,
  tags: Object.fromEntries(page.tags.map((t) => [t.tag, t.version])),
  versions: page.versions.map(versionRowJson),
});

/** One version, with what its page shows: manifest, README, files, risk flags, notes, yank. */
export const versionJson = (page: ItemPage) => {
  const v = page.shown;
  return {
    name: nameOf(page.item),
    type: page.item.type,
    ...versionRowJson(v),
    tags: v.tags,
    yankedAt: v.yankedAt?.toISOString() ?? null,
    yankReason: v.yankReason,
    manifest: v.manifest,
    readme: v.readme,
    files: v.files,
    riskFlags: v.riskFlags,
    notes: v.notes,
  };
};
