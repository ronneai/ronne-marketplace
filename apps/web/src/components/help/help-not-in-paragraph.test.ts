import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `<Help>` and `<HelpTip>` render blocks (a `<div>`, a popover, a `<noscript>`), which HTML doesn't
// allow inside a `<p>`: React fails to hydrate (docs/knowledge/help-tips-and-paragraphs.md). Unit
// tests render static markup, which doesn't validate nesting, so this reads the sources: all of
// `src`, not only this folder.
const SRC = new URL("../..", import.meta.url).pathname;

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });

/** The line of each `<p>` in `text` that holds a helper. */
export const helpersInParagraphs = (text: string): number[] =>
  [...text.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .filter((match) => /<Help(Tip)?\b/.test(match[1] ?? ""))
    .map((match) => text.slice(0, match.index).split("\n").length);

/**
 * The line of each `title={…}` in `text` that holds a helper: a Notice's title is a `<p>` (the
 * guide says to put the helper in its body instead).
 */
export const helpersInTitles = (text: string): number[] =>
  [...text.matchAll(/\btitle=\{([\s\S]*?)\}(?=\s*(?:>|\/>|\w+=))/g)]
    .filter((match) => /<Help(Tip)?\b/.test(match[1] ?? ""))
    .map((match) => text.slice(0, match.index).split("\n").length);

describe("inline helpers (033)", () => {
  it("finds a helper inside a title prop, and not one in the body", () => {
    expect(
      helpersInTitles("<Notice\n  title={\n    <>\n      text <Help id='y' />\n    </>\n  }\n>"),
    ).toEqual([2]);
    expect(helpersInTitles("<Notice title={t('a')}>\n  <Help id='y' />\n</Notice>")).toEqual([]);
  });

  it("finds a helper inside a paragraph, and not one beside it", () => {
    expect(helpersInParagraphs("a\n<p className='x'>\n  text <Help id='y' />\n</p>")).toEqual([2]);
    expect(helpersInParagraphs("<p>text <HelpTip question='q'>a</HelpTip></p>")).toEqual([1]);
    expect(helpersInParagraphs("<div><p>text</p>\n<Help id='y' /></div>")).toEqual([]);
  });

  it("reads all of src, so the features' dialogs are in it", () => {
    const files = sources(SRC).map((file) => file.replace(SRC, ""));
    for (const file of [
      "features/admin-users/DownloadDataDialog.tsx",
      "features/admin-users/UserActionDialogs.tsx",
      "components/ui/HelpTip.tsx",
      "app/(app)/admin/users/[id]/page.tsx",
    ])
      expect(files, file).toContain(file);
  });

  it("are beside the text, never inside a <p>", () => {
    const inside = sources(SRC).flatMap((file) =>
      helpersInParagraphs(readFileSync(file, "utf8")).map(
        (line) => `${file.replace(SRC, "")}:${line}`,
      ),
    );
    expect(inside).toEqual([]);
  });

  it("are in a Notice's body, never in its title", () => {
    const inside = sources(SRC).flatMap((file) =>
      helpersInTitles(readFileSync(file, "utf8")).map((line) => `${file.replace(SRC, "")}:${line}`),
    );
    expect(inside).toEqual([]);
  });
});
