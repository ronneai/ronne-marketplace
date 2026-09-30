import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { claudeCodeRenderer } from "../../render/claude-code/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { readRule, ruleName } from "./rule.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, content: string): PackageFile => ({
  path,
  bytes: encoder.encode(content),
});
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const read = (text: string) => readRule(file("style.md", text), { itemName: "@team/style" });

const rendered = (item: ReturnType<typeof loadItemDir>) => {
  const [change] = claudeCodeRenderer.render(item, { scope: "project" }).changes as Extract<
    Change,
    { kind: "file" }
  >[];
  if (!change) throw new Error("nothing rendered");
  return typeof change.content === "string" ? change.content : decoder.decode(change.content);
};

describe("readRule", () => {
  it("reads the example rule's rendered file back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}house-style`);
    const original = rendered(example);
    const read = readRule(file("house-style.md", original.replace(MARKER, "")), {
      itemName: "@examples/house-style",
    });
    expect(read.warnings).toEqual([]);
    expect(read.manifest.rule).toEqual({
      body: "rule.md",
      activation: "glob",
      globs: ["**/*.ts", "**/*.tsx"],
    });
    expect(parseManifest(read.manifestText).issues).toEqual([]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(
      rendered({
        name: "@examples/house-style",
        version: "1.0.0",
        manifest: { ...read.manifest, version: "1.0.0" },
        files: read.files,
      }),
    ).toBe(original);
  });

  it("reads paths as a list or a comma-separated string, and no paths as always", () => {
    expect(
      read('---\npaths: "src/**/*.ts, lib/**/*.ts"\n---\n# API rules\n').manifest.rule,
    ).toEqual({ body: "rule.md", activation: "glob", globs: ["src/**/*.ts", "lib/**/*.ts"] });
    expect(read("---\npaths:\n  - docs/**\n---\nWrite plainly.\n").manifest.rule).toMatchObject({
      activation: "glob",
      globs: ["docs/**"],
    });
    const always = read("# Use pnpm\n\nNever npm.\n");
    expect(always.manifest).toMatchObject({
      description: "Use pnpm",
      rule: { body: "rule.md", activation: "always" },
    });
    expect(always.warnings).toEqual([]);
    expect(checkPackage(always.manifest, always.files)).toEqual([]);
  });

  it("drops other fields, and reads frontmatter that doesn't parse as Claude Code does: always", () => {
    expect(read("---\npaths: [a/**]\nowner: me\n---\nBody.\n").warnings.map((w) => w.code)).toEqual(
      ["field_dropped"],
    );
    const broken = read("---\npaths: [unclosed\n---\nBody.\n");
    expect(broken.manifest.rule).toEqual({ body: "rule.md", activation: "always" });
    expect(broken.warnings[0]?.message).toContain("isn't valid YAML");
  });

  it("names a rule in a subfolder with it", () => {
    expect(ruleName("frontend/api.md")).toBe("frontend-api");
  });
});
