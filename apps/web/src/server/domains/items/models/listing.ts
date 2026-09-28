/**
 * How the catalogue lists an item (feature 018), kept on the item's row so listing stays one simple
 * query on every database. Recomputed whenever a release, a tag or a yank changes it.
 */
export type Listing = {
  /** The version the catalogue shows: the one `latest` points to, else the newest release. */
  listedVersionId: string | null;
  /** Whether any version is not yanked; an item with none is listed last. */
  installable: boolean;
  /** When its newest version was released, for "most recently published". */
  lastPublishedAt: Date | null;
};

type ListedVersion = { id: string; publishedAt: Date; yankedAt: Date | null };

const newestFirst = (a: ListedVersion, b: ListedVersion) =>
  b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export const listingOf = (
  versions: readonly ListedVersion[],
  latestVersionId: string | null,
): Listing => {
  const newest = [...versions].sort(newestFirst)[0] ?? null;
  const latest = versions.find((v) => v.id === latestVersionId) ?? null;
  return {
    listedVersionId: (latest ?? newest)?.id ?? null,
    installable: versions.some((v) => v.yankedAt === null),
    lastPublishedAt: newest?.publishedAt ?? null,
  };
};

/** What search reads from a version's manifest: its description, and its keywords as one string. */
export const searchFieldsOf = (manifest: unknown): { description: string; keywords: string } => {
  const m = (manifest && typeof manifest === "object" ? manifest : {}) as Record<string, unknown>;
  const keywords = Array.isArray(m.keywords)
    ? m.keywords.filter((k): k is string => typeof k === "string")
    : [];
  return {
    description: typeof m.description === "string" ? m.description.slice(0, 300) : "",
    keywords: keywords.join(" ").slice(0, 400),
  };
};
