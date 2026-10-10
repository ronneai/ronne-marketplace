import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { exampleItems, loadItemDir } from "../render/harness.js";
import { shortName } from "../render/helpers.js";
import { installsIn, supportOf } from "../render/support.js";
import type { RenderInput } from "../render/types.js";
import { buildPlugin } from "./build.js";
import type { PluginTool } from "./types.js";

/**
 * The plugins' golden files (076), like the renderers' (021): every example item that installs in
 * a tool is built as its plugin, with its dependencies from the other examples, and compared with
 * `goldenDir/<item>/`: the plugin's files under `files/`, and `result.json` with its name, whether
 * it's empty, its executable files and its warnings. `UPDATE_GOLDEN=1` rewrites them. Node only:
 * tests.
 */

/** The item and its dependencies among the examples, dependencies first, each once. */
export const exampleMembers = (examples: Map<string, RenderInput>, item: RenderInput) => {
  const out: RenderInput[] = [];
  const visit = (input: RenderInput) => {
    if (out.includes(input)) return;
    const dependencies = (input.manifest.dependencies ?? {}) as Record<string, unknown>;
    for (const name of Object.keys(dependencies).sort()) {
      const dependency = examples.get(name);
      if (dependency) visit(dependency);
    }
    out.push(input);
  };
  visit(item);
  return item.manifest.type === "bundle" ? out.filter((member) => member !== item) : out;
};

const walk = (root: string, dir = root): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(root, join(dir, entry.name))
      : [relative(root, join(dir, entry.name)).split("\\").join("/")],
  );

export type PluginGoldenDifference = { item: string; path: string; problem: string };

export const checkPluginGolden = (
  tool: PluginTool,
  examplesDir: string,
  goldenDir: string,
  { update = process.env.UPDATE_GOLDEN === "1" } = {},
): PluginGoldenDifference[] => {
  const examples = new Map(
    exampleItems(examplesDir).map(({ dir }) => {
      const input = loadItemDir(dir);
      return [input.name, input] as const;
    }),
  );
  const differences: PluginGoldenDifference[] = [];
  if (update) rmSync(goldenDir, { recursive: true, force: true });
  for (const item of examples.values()) {
    const short = shortName(item.name);
    if (!installsIn(supportOf(item.manifest, String(item.manifest.type))[tool])) continue;
    const plugin = buildPlugin(tool, { item, members: exampleMembers(examples, item) });
    const expected = new Map<string, Uint8Array | string>(
      plugin.files.map((file) => [`files/${file.path}`, file.bytes]),
    );
    const result = {
      name: plugin.name,
      empty: plugin.empty,
      executables: plugin.files.filter((file) => file.executable).map((file) => file.path),
      warnings: plugin.warnings,
    };
    expected.set("result.json", `${JSON.stringify(result, null, 2)}\n`);
    const dir = join(goldenDir, short);
    if (update) {
      for (const [path, content] of expected) {
        mkdirSync(join(dir, path, ".."), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
      continue;
    }
    let actual: string[] = [];
    try {
      actual = walk(dir);
    } catch {
      // No golden files yet: every expected file is missing.
    }
    for (const [path, content] of expected) {
      if (!actual.includes(path)) differences.push({ item: short, path, problem: "missing" });
      else if (
        Buffer.compare(readFileSync(join(dir, path)), Buffer.from(content as Uint8Array)) !== 0
      )
        differences.push({ item: short, path, problem: "differs" });
    }
    for (const path of actual)
      if (!expected.has(path)) differences.push({ item: short, path, problem: "unexpected" });
  }
  return differences;
};

export const describePluginDifferences = (differences: PluginGoldenDifference[]): string =>
  `${differences.map((d) => `${d.item}: ${d.path} ${d.problem}`).join("\n")}\n` +
  "If the new output is right, run the tests with UPDATE_GOLDEN=1 and review the diff.";
