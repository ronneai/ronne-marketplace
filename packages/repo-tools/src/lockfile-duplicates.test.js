import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duplicatedVersions } from "./lockfile-duplicates.js";

const lockfile = (...keys) =>
  [
    "lockfileVersion: '9.0'",
    "",
    "packages:",
    "",
    ...keys.map((key) => `  '${key}':\n    resolution: {}\n`),
  ]
    .concat(["snapshots:", "", "  '@codemirror/view@1.0.0(x@1)': {}"])
    .join("\n");

describe("duplicatedVersions", () => {
  it("reports a guarded package with two versions", () => {
    const text = lockfile(
      "@codemirror/view@6.43.14",
      "@codemirror/view@6.43.15",
      "@codemirror/state@6.7.6",
    );
    expect(duplicatedVersions(text)).toEqual({ "@codemirror/view": ["6.43.14", "6.43.15"] });
  });

  it("accepts one version of each package", () => {
    const text = lockfile("@codemirror/view@6.43.15", "@codemirror/state@6.7.6");
    expect(duplicatedVersions(text)).toEqual({});
  });

  it("ignores packages that are not guarded", () => {
    const text = lockfile("nanoid@3.3.7", "nanoid@5.1.0");
    expect(duplicatedVersions(text)).toEqual({});
  });

  it("reads the packages section only", () => {
    const text = lockfile("@codemirror/view@6.43.15");
    expect(duplicatedVersions(text)).toEqual({});
  });
});

describe("pnpm-lock.yaml", () => {
  it("has one version of each @codemirror package", () => {
    const text = readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
    expect(
      duplicatedVersions(text),
      "Two copies of a CodeMirror package break the editor's pickers. Run `pnpm dedupe` and commit the lockfile (docs/knowledge/duplicate-codemirror-packages.md).",
    ).toEqual({});
  });
});
