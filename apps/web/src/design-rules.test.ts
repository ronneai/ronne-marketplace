import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Design system rules (feature 032), checked over components/ and features/: colours come only from
// tokens.css, and the UI is flat, with no red, yellow or green.
const ROOTS = ["components", "features"].map((d) => new URL(`./${d}/`, import.meta.url).pathname);

const files = (dir: string): string[] => {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
};

const RULES: [string, RegExp][] = [
  ["raw hex colour (use a token utility)", /#[0-9a-fA-F]{3,8}\b/],
  // A Tailwind shadow class token (not the word in prose), or a CSS box-shadow declaration.
  [
    "shadow (the design is flat)",
    /(?<=["'`\s])(?:drop-)?shadow(?:-[\w/[\].-]+)?(?=["'`\s])|box-shadow\s*:/,
  ],
  ["gradient (the design is flat)", /\b(?:bg-gradient|bg-linear|bg-radial|bg-conic|gradient)\b/],
  [
    "red, yellow or green colour",
    /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:red|rose|orange|amber|yellow|lime|green|emerald)-\d/,
  ],
];

describe("design system rules", () => {
  const sources = ROOTS.flatMap(files);

  it("finds the component files", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  // Comments are ignored, so explaining a rule ("no shadow") doesn't break it.
  const code = (file: string) =>
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it.each(RULES)("no %s in components/ or features/", (_label, pattern) => {
    const offenders = sources.filter((file) => pattern.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
