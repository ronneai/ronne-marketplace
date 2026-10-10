import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Item names have two forms since 118, `@scope/name` and `@workspace/scope/name`, so splitting one
 * by hand gets the three-part form wrong. Every package reads them with `parseItemName`,
 * `shortItemName` or `formatItemName` from `@ronneai/core` (`packages/core/src/names.ts`).
 */
const root = new URL("../../../", import.meta.url).pathname;
const SOURCES = ["packages/core/src", "packages/cli/src", "packages/mcp/src", "apps/web/src"];
/**
 * Files that read names on purpose, each for a reason: core's names.ts is the one reader; core's
 * frontmatter.ts finds an unquoted name in YAML before it's parsed (097); a zip's top folder is a
 * file path, not a name.
 */
const ALLOWED = {
  "packages/core/src/names.ts": "all",
  "packages/core/src/frontmatter.ts": "a regular expression for item names",
  "apps/web/src/server/domains/submissions/models/zip.ts": 'split("/")[n]',
};

/** Ways of splitting a name by hand that 118 replaced. */
const SPLITS = [
  { what: '.slice(1).split("/")', pattern: /\.slice\(1\)\.split\("\/"\)/ },
  // The first slash: an item name's first slash is no longer before its own name.
  { what: '.indexOf("/")', pattern: /(?<!last)\.indexOf\("\/"\)/i },
  { what: 'split("/")[n]', pattern: /\.split\("\/"\)\[\d\]/ },
  {
    what: "a regular expression for item names",
    pattern: /\^@\(?\[\^\/\]|@\(?\[a-z0-9/,
  },
];

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

describe("item names (118)", () => {
  it("are never split by hand outside names.ts", () => {
    const found = [];
    for (const dir of SOURCES)
      for (const path of sourceFiles(join(root, dir))) {
        const at = relative(root, path);
        if (ALLOWED[at] === "all") continue;
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, index) => {
            for (const split of SPLITS)
              if (ALLOWED[at] !== split.what && split.pattern.test(line))
                found.push(`${at}:${index + 1} ${split.what}`);
          });
      }
    expect(found).toEqual([]);
  });

  it("catches each way of splitting", () => {
    const lines = [
      'const [scope, name] = item.slice(1).split("/");',
      'const short = item.name.slice(item.name.indexOf("/") + 1);',
      'const slash = words.indexOf("/");',
      'const short = name?.split("/")[1];',
      "const match = /^@([^/]+)\\/([^/]+)$/.exec(value);",
      "if (!/^@[^/]+\\/[^/@]+$/.test(name))",
      "const MARKER = /managed by rmk: (@[a-z0-9-]+\\/[a-z0-9-]+)@([^\\s>]+)/;",
    ];
    for (const line of lines)
      expect(
        SPLITS.some((split) => split.pattern.test(line)),
        line,
      ).toBe(true);
  });

  it("leaves the last slash and other paths alone", () => {
    const lines = [
      'const short = name.slice(name.lastIndexOf("/") + 1);',
      'const source = file.path.split("/").at(-1) ?? file.path;',
    ];
    for (const line of lines)
      expect(
        SPLITS.some((split) => split.pattern.test(line)),
        line,
      ).toBe(false);
  });
});
