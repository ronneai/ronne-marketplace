import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { exampleRenderer } from "./example/renderer.js";
import {
  checkGolden,
  describeDifferences,
  exampleItems,
  goldenFiles,
  loadItemDir,
} from "./harness.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./example/__golden__/", import.meta.url));
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the golden-file harness", () => {
  it("renders every example item with the reference renderer as the committed golden files say", () => {
    const differences = checkGolden(exampleRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("covers every item type and every change kind", () => {
    const items = exampleItems(examplesDir).map((item) => loadItemDir(item.dir));
    expect(new Set(items.map((item) => item.manifest.type)).size).toBe(11);
    const kinds = new Set(
      items.flatMap((item) =>
        exampleRenderer.render(item, { scope: "project" }).changes.map((c) => c.kind),
      ),
    );
    expect([...kinds].sort()).toEqual([
      "dir",
      "file",
      "json-array-item",
      "json-key",
      "section",
      "toml-key",
    ]);
  });

  it("fails with a readable difference when the output changes, and UPDATE_GOLDEN rewrites it", () => {
    const temp = mkdtempSync(join(tmpdir(), "ronne-golden-"));
    temps.push(temp);
    expect(
      checkGolden(exampleRenderer, examplesDir, temp, { update: false }).length,
    ).toBeGreaterThan(0);
    expect(checkGolden(exampleRenderer, examplesDir, temp, { update: true })).toEqual([]);
    expect(checkGolden(exampleRenderer, examplesDir, temp, { update: false })).toEqual([]);
    const changed = join(temp, "concise", "project", "changes.json");
    writeFileSync(changed, `${readFileSync(changed, "utf8")}\n`);
    writeFileSync(join(temp, "concise", "project", "extra.txt"), "x");
    const differences = checkGolden(exampleRenderer, examplesDir, temp, { update: false });
    expect(differences).toEqual([
      { item: "concise", scope: "project", path: "changes.json", problem: "differs" },
      { item: "concise", scope: "project", path: "extra.txt", problem: "unexpected" },
    ]);
    expect(describeDifferences(differences)).toContain("UPDATE_GOLDEN=1");
  });

  it("refuses a renderer that writes outside the folder", () => {
    const escaping = {
      ...exampleRenderer,
      render: () => ({
        changes: [{ kind: "file" as const, path: "../etc/x", content: "" }],
        warnings: [],
      }),
    };
    expect(() => checkGolden(escaping, examplesDir, goldenDir, { update: false })).toThrow(
      /must not leave/,
    );
  });

  it("lays a result out as files, numbering keys in order", () => {
    const paths = goldenFiles({
      changes: [
        { kind: "json-key", path: "s.json", key: ["a"], value: 1 },
        { kind: "dir", path: "d", files: [{ path: "x.md", content: "" }] },
        { kind: "section", path: "AGENTS.md", key: "@t/x", text: "hi" },
      ],
      warnings: [],
    }).map((file) => file.path);
    expect(paths).toEqual([
      "changes.json",
      "files/d/x.md",
      "keys/01-json-key.json",
      "keys/03-section.md",
      "warnings.json",
    ]);
  });
});
