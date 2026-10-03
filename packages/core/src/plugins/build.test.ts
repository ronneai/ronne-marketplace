import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin, PluginError } from "./build.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const paths = (plugin: ReturnType<typeof buildPlugin>) => plugin.files.map((f) => f.path);

describe("buildPlugin", () => {
  it("puts a bundle's members in its plugin, named after the bundle", () => {
    const item = example("starter-kit");
    const members = [example("secure-coding"), example("review-diff")];
    const plugin = buildPlugin("claude-code", { item, members });
    expect(plugin.name).toBe("examples.starter-kit");
    expect(plugin.empty).toBe(false);
    expect(paths(plugin)).toEqual([
      ".claude-plugin/plugin.json",
      "skills/review-diff/SKILL.md",
      "skills/secure-coding/SKILL.md",
      "skills/secure-coding/checklist.md",
      "skills/secure-coding/ronne.yaml",
    ]);
  });

  it("puts an item's dependencies in its plugin, next to the item", () => {
    const item = example("code-reviewer");
    const members = [example("secure-coding"), example("github-mcp"), item];
    const plugin = buildPlugin("claude-code", { item, members });
    expect(paths(plugin)).toEqual(
      expect.arrayContaining([
        ".mcp.json",
        "agents/code-reviewer.md",
        "skills/secure-coding/SKILL.md",
      ]),
    );
  });

  it("is empty when nothing of the item itself has a place, whatever its dependencies add", () => {
    const item = example("safe-git");
    const plugin = buildPlugin("claude-code", { item, members: [example("secure-coding"), item] });
    expect(plugin.empty).toBe(true);
    const bundle = example("starter-kit");
    const nothing = buildPlugin("claude-code", { item: bundle, members: [example("safe-git")] });
    expect(nothing.empty).toBe(true);
  });

  it("refuses two members that write the same thing", () => {
    const item = example("secure-coding");
    const twin = { ...example("secure-coding"), name: "@other/secure-coding" };
    expect(() => buildPlugin("claude-code", { item, members: [item, twin] })).toThrow(PluginError);
    try {
      buildPlugin("claude-code", { item, members: [item, twin] });
    } catch (error) {
      expect((error as PluginError).code).toBe("plugin_conflict");
    }
  });

  it("refuses an item whose type doesn't install in the tool", () => {
    const item = example("concise");
    expect(() => buildPlugin("codex", { item, members: [item] })).toThrow(
      /doesn't install in Codex/,
    );
  });

  it("collects hooks from several members into one file", () => {
    const one = example("format-on-edit");
    const two = { ...one, name: "@examples/format-again" };
    const bundle = example("starter-kit");
    const plugin = buildPlugin("claude-code", { item: bundle, members: [one, two] });
    const hooks = JSON.parse(
      new TextDecoder().decode(plugin.files.find((f) => f.path === "hooks/hooks.json")?.bytes),
    );
    expect(hooks.hooks.PostToolUse).toHaveLength(2);
  });
});
