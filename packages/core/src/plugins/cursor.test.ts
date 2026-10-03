import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/cursor/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("Cursor plugins", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("cursor", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("carry rules, which Claude Code and Codex plugins can't", () => {
    const item = example("house-style");
    const plugin = buildPlugin("cursor", { item, members: [item] });
    expect(plugin.empty).toBe(false);
    expect(plugin.files.map((f) => f.path)).toContain("rules/house-style.mdc");
  });

  it("write hooks without the version key, with scripts relative to the plugin", () => {
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
    const plugin = buildPlugin("cursor", { item, members: [item] });
    const hooks = JSON.parse(text(plugin.files.find((f) => f.path === "hooks/hooks.json")?.bytes));
    expect(hooks.version).toBeUndefined();
    expect(JSON.stringify(hooks)).toContain('"command":"./hooks/format-on-edit/format.sh"');
  });
});
