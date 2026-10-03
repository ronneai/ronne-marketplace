import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/claude-code/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("Claude Code plugins", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("claude-code", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("run a hook's script from the plugin root, and keep it executable", () => {
    const base = example("format-on-edit");
    const hook = base.manifest.hook as Record<string, unknown>;
    const item = {
      ...base,
      manifest: { ...base.manifest, hook: { ...hook, run: { script: "format.sh" } } },
      files: [
        ...base.files,
        { path: "format.sh", bytes: new TextEncoder().encode("#!/bin/sh\n"), executable: true },
      ],
    };
    const plugin = buildPlugin("claude-code", { item, members: [item] });
    const hooks = text(plugin.files.find((f) => f.path === "hooks/hooks.json")?.bytes);
    expect(hooks).toContain('"\\"${CLAUDE_PLUGIN_ROOT}\\"/hooks/format-on-edit/format.sh"');
    expect(plugin.files.find((f) => f.path === "hooks/format-on-edit/format.sh")?.executable).toBe(
      true,
    );
  });

  it("leave out what a plugin can't carry, and say so", () => {
    const item = example("safe-git");
    const plugin = buildPlugin("claude-code", { item, members: [item] });
    expect(plugin.empty).toBe(true);
    expect(plugin.warnings.map((w) => w.code)).toContain("not_in_plugin");
  });

  it("have no version in plugin.json", () => {
    const item = example("secure-coding");
    const plugin = buildPlugin("claude-code", { item, members: [item] });
    const manifest = JSON.parse(
      text(plugin.files.find((f) => f.path === ".claude-plugin/plugin.json")?.bytes),
    );
    expect(manifest).toEqual({
      name: "examples.secure-coding",
      description: item.manifest.description,
      author: { name: "examples" },
    });
  });
});
