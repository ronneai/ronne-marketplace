import { describe, expect, it } from "vitest";
import { CACHES, entriesToDelete, formatSize, turboEntries } from "./caches.js";

const GB = 1024 ** 3;
const entry = (hash, gb, mtimeMs) => ({ hash, size: gb * GB, mtimeMs });

describe("build cache limits", () => {
  it("groups Turborepo's files into entries, ignoring anything else", () => {
    expect(
      turboEntries([
        { name: "a1-meta.json", size: 10, mtimeMs: 1 },
        { name: "a1-manifest.json", size: 20, mtimeMs: 3 },
        { name: "a1.tar.zst", size: 1000, mtimeMs: 2 },
        { name: "b2.tar.zst", size: 5, mtimeMs: 9 },
        { name: "notes.txt", size: 99, mtimeMs: 9 },
      ]),
    ).toEqual([
      {
        hash: "a1",
        files: ["a1-meta.json", "a1-manifest.json", "a1.tar.zst"],
        size: 1030,
        mtimeMs: 3,
      },
      { hash: "b2", files: ["b2.tar.zst"], size: 5, mtimeMs: 9 },
    ]);
  });

  it("deletes nothing while the cache is within its limit", () => {
    expect(entriesToDelete([entry("a", 2, 1), entry("b", 2, 2)], 5 * GB, 2 * GB)).toEqual([]);
  });

  it("deletes the oldest entries until what's left fits the target", () => {
    const entries = [
      entry("new", 1, 30),
      entry("old", 2, 10),
      entry("mid", 2, 20),
      entry("older", 1, 5),
    ];
    expect(entriesToDelete(entries, 5 * GB, 2 * GB).map((e) => e.hash)).toEqual([
      "older",
      "old",
      "mid",
    ]);
  });

  it("always keeps the newest entry, even when it alone is over the target", () => {
    expect(
      entriesToDelete([entry("big", 6, 2), entry("old", 1, 1)], 5 * GB, 2 * GB).map((e) => e.hash),
    ).toEqual(["old"]);
  });

  it("covers Turborepo's cache and both Turbopack caches, each with a limit", () => {
    expect(CACHES.map((c) => c.path)).toEqual([
      ".turbo/cache",
      "apps/web/.next/dev/cache",
      "apps/web/.next/cache",
    ]);
    for (const cache of CACHES) expect(cache.limit).toBeGreaterThan(0);
    expect(formatSize(2.34 * GB)).toBe("2.3 GB");
    expect(formatSize(540 * 1024 ** 2)).toBe("540 MB");
  });
});
