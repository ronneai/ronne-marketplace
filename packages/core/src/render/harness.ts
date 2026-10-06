import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseManifest } from "../manifest.js";
import type { PackageFile } from "../package-file.js";
import { changePaths, pathProblem } from "./helpers.js";
import { renderDependencyOf, withDependencies } from "./skill-frontmatter.js";
import type { Change, PlatformRenderer, RenderInput, RenderScope } from "./types.js";

/**
 * The golden-file harness (feature 021): renders every example item with a renderer, in both
 * scopes, and compares the result with the files committed next to the renderer, so a change to
 * what it writes is reviewed as a file diff. `UPDATE_GOLDEN=1` rewrites them. Node only: tests.
 */

const SCOPES: RenderScope[] = ["project", "user"];

const byPath = <T extends { path: string }>(a: T, b: T) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

const walk = (root: string, dir = root): PackageFile[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(root, full);
      const executable = (statSync(full).mode & 0o111) !== 0;
      return [
        {
          path: relative(root, full).split("\\").join("/"),
          bytes: new Uint8Array(readFileSync(full)),
          executable,
        },
      ];
    })
    .sort(byPath);

/** An item folder (such as one under `examples/items/`) as a renderer's input, at `version`. */
export const loadItemDir = (dir: string, version = "1.0.0"): RenderInput => {
  const files = walk(dir);
  const manifestFile = files.find((file) => file.path === "ronne.yaml");
  if (!manifestFile) throw new Error(`${dir} has no ronne.yaml`);
  const { manifest } = parseManifest(new TextDecoder().decode(manifestFile.bytes));
  if (!manifest) throw new Error(`${dir}/ronne.yaml doesn't parse`);
  return { name: String(manifest.name), version, manifest: { ...manifest, version }, files };
};

type GoldenFile = { path: string; content: Uint8Array | string };

const describe = (change: Change) => {
  switch (change.kind) {
    case "file":
      return { kind: change.kind, path: change.path, executable: change.executable ?? false };
    case "dir":
      return {
        kind: change.kind,
        path: change.path,
        files: change.files.map((file) => ({
          path: file.path,
          executable: file.executable ?? false,
        })),
      };
    case "section":
      return { kind: change.kind, path: change.path, key: change.key };
    default:
      return { kind: change.kind, path: change.path, key: change.key };
  }
};

/**
 * A render result as files: `changes.json` (every change's kind, path, key and executable bits, in
 * order), `warnings.json`, each file or folder's content under `files/`, and each key, array item
 * or section's value under `keys/`, numbered in order.
 */
export const goldenFiles = (result: ReturnType<PlatformRenderer["render"]>): GoldenFile[] => {
  const out: GoldenFile[] = [
    { path: "changes.json", content: `${JSON.stringify(result.changes.map(describe), null, 2)}\n` },
    { path: "warnings.json", content: `${JSON.stringify(result.warnings, null, 2)}\n` },
  ];
  result.changes.forEach((change, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (change.kind === "file") out.push({ path: `files/${change.path}`, content: change.content });
    else if (change.kind === "dir")
      for (const file of change.files)
        out.push({ path: `files/${change.path}/${file.path}`, content: file.content });
    else if (change.kind === "section")
      out.push({ path: `keys/${n}-${change.kind}.md`, content: change.text });
    else
      out.push({
        path: `keys/${n}-${change.kind}.json`,
        content: `${JSON.stringify(change.kind === "json-array-item" ? change.item : change.value, null, 2)}\n`,
      });
  });
  return out.sort(byPath);
};

const encoder = new TextEncoder();
const bytes = (content: Uint8Array | string) =>
  typeof content === "string" ? encoder.encode(content) : content;
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/** The example item folders, by name. */
export const exampleItems = (examplesDir: string): { name: string; dir: string }[] =>
  readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: join(examplesDir, entry.name) }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));

export type GoldenDifference = { item: string; scope: RenderScope; path: string; problem: string };

/**
 * Renders every example item in both scopes and compares with `goldenDir/<item>/<scope>/`.
 * Returns the differences, or rewrites the golden files and returns none when `update` is set.
 * A change whose path would leave the folder is refused before anything is compared.
 */
export const checkGolden = (
  renderer: PlatformRenderer,
  examplesDir: string,
  goldenDir: string,
  { update = process.env.UPDATE_GOLDEN === "1" } = {},
): GoldenDifference[] => {
  const differences: GoldenDifference[] = [];
  // Every example as a dependency of the others (097), as `rmk` would resolve it.
  const examples = exampleItems(examplesDir).map((item) => ({
    item,
    input: loadItemDir(item.dir),
  }));
  const known = new Map(
    examples.flatMap(({ input }) => {
      const dependency = renderDependencyOf(input);
      return dependency ? [[input.name, dependency] as const] : [];
    }),
  );
  for (const { item, input: loaded } of examples) {
    const input = withDependencies(loaded, known);
    for (const scope of SCOPES) {
      const result = renderer.render(input, { scope });
      for (const change of result.changes)
        for (const path of changePaths(change)) {
          const problem = pathProblem(path);
          if (problem) throw new Error(`${renderer.id} wrote ${path} for ${item.name}: ${problem}`);
        }
      const expected = goldenFiles(result);
      const dir = join(goldenDir, item.name, scope);
      if (update) {
        rmSync(dir, { recursive: true, force: true });
        for (const file of expected) {
          mkdirSync(join(dir, file.path, ".."), { recursive: true });
          writeFileSync(join(dir, file.path), bytes(file.content));
        }
        continue;
      }
      let actual: PackageFile[] = [];
      try {
        actual = walk(dir);
      } catch {
        // No golden files yet: every expected file is missing.
      }
      const actualByPath = new Map(actual.map((file) => [file.path, file.bytes]));
      for (const file of expected) {
        const found = actualByPath.get(file.path);
        if (!found)
          differences.push({ item: item.name, scope, path: file.path, problem: "missing" });
        else if (!same(found, bytes(file.content)))
          differences.push({ item: item.name, scope, path: file.path, problem: "differs" });
        actualByPath.delete(file.path);
      }
      for (const path of actualByPath.keys())
        differences.push({ item: item.name, scope, path, problem: "unexpected" });
    }
  }
  return differences;
};

/** The differences as one message, with how to accept them. */
export const describeDifferences = (differences: GoldenDifference[]): string =>
  `${differences.map((d) => `${d.item} (${d.scope}): ${d.path} ${d.problem}`).join("\n")}\n` +
  "If the new output is right, run the tests with UPDATE_GOLDEN=1 and review the diff.";
