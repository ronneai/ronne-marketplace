#!/usr/bin/env node
// Usage: node packages/repo-tools/src/trim-caches.js        (run by `pnpm build` and `pnpm dev`)
//        node packages/repo-tools/src/trim-caches.js --all  (`pnpm clean:cache`: empty them all)
// Trims the build caches listed in caches.js when they're over their limits. Never fails the
// command it runs before: a cache it can't read or delete is reported and left.
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHES, entriesToDelete, formatSize, turboEntries } from "./caches.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const all = process.argv.includes("--all");

const folderSize = (dir) => {
  let total = 0;
  for (const name of readdirSync(dir, { recursive: true })) {
    try {
      const stat = statSync(join(dir, name));
      if (stat.isFile()) total += stat.size;
    } catch {
      // removed while counting
    }
  }
  return total;
};

for (const cache of CACHES) {
  const dir = join(root, cache.path);
  try {
    if (cache.kind === "entries") {
      const files = readdirSync(dir).map((name) => {
        const stat = statSync(join(dir, name));
        return { name, size: stat.size, mtimeMs: stat.mtimeMs };
      });
      const entries = turboEntries(files);
      const remove = all ? entries : entriesToDelete(entries, cache.limit, cache.target);
      if (!remove.length) continue;
      for (const entry of remove)
        for (const name of entry.files) rmSync(join(dir, name), { force: true });
      const freed = remove.reduce((sum, entry) => sum + entry.size, 0);
      console.log(
        `Trimmed ${cache.path}: removed ${remove.length} old entries (${formatSize(freed)}).`,
      );
    } else {
      const size = folderSize(dir);
      if (!all && size <= cache.limit) continue;
      rmSync(dir, { recursive: true, force: true });
      console.log(
        `Trimmed ${cache.path}: removed it (${formatSize(size)}); the next run rebuilds it.`,
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`! Couldn't trim ${cache.path}: ${error.message}`);
  }
}
