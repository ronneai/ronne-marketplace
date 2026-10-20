import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// How the app's dialogs ask for a size (123, docs/knowledge/dialog-sizes.md): read from the
// sources, since a dialog's props only show when it is open and its parents are rendered.
const SRC = new URL("../..", import.meta.url).pathname;

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });

/** The opening tag of each `<Dialog …>` in a file. */
const dialogTags = (text: string): string[] =>
  [...text.matchAll(/<Dialog\b[^>]*>/g)].map((match) => match[0]);

describe("dialog sizes in use (123)", () => {
  it("only name sizes on the scale, or the side sheet", () => {
    const sizes = new Set<string>();
    for (const file of sources(SRC))
      for (const tag of dialogTags(readFileSync(file, "utf8")))
        for (const m of tag.matchAll(/\bsize="([a-z]+)"/g)) sizes.add(m[1] ?? "");
    expect([...sizes].sort()).toEqual(
      [...sizes].filter((s) => ["small", "medium", "large", "xlarge", "side"].includes(s)).sort(),
    );
    // And the ones that exist: Move scope, the bulk dialogs, Erase user and the phone menu.
    expect(sizes.has("large")).toBe(true);
    expect(sizes.has("xlarge")).toBe(true);
    expect(sizes.has("side")).toBe(true);
  });

  it("keeps the bulk dialogs in a fixed-height frame, which they scroll inside", () => {
    for (const file of ["features/releases/BulkRelease.tsx", "features/reviews/BulkApprove.tsx"]) {
      const tags = dialogTags(readFileSync(join(SRC, file), "utf8"));
      expect(tags, file).toHaveLength(1);
      expect(tags[0], file).toMatch(/\bfixedHeight\b/);
      expect(tags[0], file).toMatch(/size="large"/);
    }
  });

  it("makes Erase user extra large", () => {
    const tags = dialogTags(
      readFileSync(join(SRC, "features/admin-users/EraseUserDialog.tsx"), "utf8"),
    );
    expect(tags.join(" ")).toMatch(/size="xlarge"/);
  });
});
