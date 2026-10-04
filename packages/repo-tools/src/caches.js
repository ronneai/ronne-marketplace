// Keeps the build caches from growing without end. Plain JavaScript with no dependencies.
//
// Turborepo's local cache (.turbo/cache) keeps every task output it has ever stored and never
// removes one; Next.js's Turbopack keeps its own on-disk caches for `next dev` (.next/dev/cache)
// and `next build` (.next/cache). Deleting any of them is always safe: the next run rebuilds.

const GB = 1024 ** 3;

/**
 * The caches and their limits. Over `limit`, Turborepo's cache loses its oldest entries until it's
 * under `target`; a Turbopack cache is deleted whole (it can't be trimmed entry by entry).
 */
export const CACHES = [
  { path: ".turbo/cache", kind: "entries", limit: 5 * GB, target: 2 * GB },
  { path: "apps/web/.next/dev/cache", kind: "folder", limit: 2 * GB },
  { path: "apps/web/.next/cache", kind: "folder", limit: 2 * GB },
];

/**
 * Turborepo stores each output as `<hash>.tar.zst` with `<hash>-meta.json` and
 * `<hash>-manifest.json`. Groups the files into entries: their hash, total size and newest time.
 * @param {{ name: string, size: number, mtimeMs: number }[]} files
 */
export const turboEntries = (files) => {
  const entries = new Map();
  for (const file of files) {
    const hash = file.name.match(/^([0-9a-f]+)(?:-meta\.json|-manifest\.json|\.tar\.zst)$/)?.[1];
    if (!hash) continue;
    const entry = entries.get(hash) ?? { hash, files: [], size: 0, mtimeMs: 0 };
    entry.files.push(file.name);
    entry.size += file.size;
    entry.mtimeMs = Math.max(entry.mtimeMs, file.mtimeMs);
    entries.set(hash, entry);
  }
  return [...entries.values()];
};

/**
 * Which entries to delete: none while the total is within `limit`; otherwise the oldest first,
 * until what's left fits in `target`. The newest entry is always kept.
 * @param {{ hash: string, size: number, mtimeMs: number }[]} entries
 * @param {number} limit
 * @param {number} target
 */
export const entriesToDelete = (entries, limit, target) => {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= limit) return [];
  const oldestFirst = [...entries].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const remove = [];
  for (const entry of oldestFirst.slice(0, -1)) {
    if (total <= target) break;
    remove.push(entry);
    total -= entry.size;
  }
  return remove;
};

/** A size for people: 2.3 GB, 540 MB. */
export const formatSize = (bytes) =>
  bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
