import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";
import { pluginNameProblem } from "./names.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/antigravity/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const fileOf = (plugin: ReturnType<typeof buildPlugin>, path: string) =>
  plugin.files.find((f) => f.path === path)?.bytes;

describe("Antigravity plugins", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("antigravity", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("have a plugin.json named scope-name, and the renderer's files at the root", () => {
    const agent = example("code-reviewer");
    const plugin = buildPlugin("antigravity", { item: agent, members: [agent] });
    expect(JSON.parse(text(fileOf(plugin, "plugin.json")))).toEqual({
      $schema: "https://antigravity.google/schemas/v1/plugin.json",
      name: "examples-code-reviewer",
      version: "1.0.0",
      description: agent.manifest.description,
      author: { name: "examples" },
    });
    expect(plugin.files.map((f) => f.path)).toContain("agents/code-reviewer.md");
    const rule = example("house-style");
    expect(
      buildPlugin("antigravity", { item: rule, members: [rule] }).files.map((f) => f.path),
    ).toContain("rules/house-style.md");
    expect(pluginNameProblem("antigravity", "a.b--c")).toBe("double_hyphen");
    expect(pluginNameProblem("antigravity", "examples.code-reviewer")).toBeNull();
  });

  it("key hooks by name, run scripts from the plugin root, and keep MCP servers apart", () => {
    const hook = example("format-on-edit");
    const withScript = {
      ...hook,
      manifest: {
        ...hook.manifest,
        hook: { event: "tool.after", run: { script: "fmt.sh" } },
      },
      files: [...hook.files, { path: "fmt.sh", bytes: new TextEncoder().encode("#!/bin/sh\n") }],
    };
    const plugin = buildPlugin("antigravity", { item: withScript, members: [withScript] });
    expect(JSON.parse(text(fileOf(plugin, "hooks.json")))).toEqual({
      "format-on-edit": {
        PostToolUse: [{ hooks: [{ type: "command", command: "./hooks/format-on-edit/fmt.sh" }] }],
      },
    });
    expect(plugin.files.map((f) => f.path)).toContain("hooks/format-on-edit/fmt.sh");
    const command = buildPlugin("antigravity", { item: hook, members: [hook] });
    expect(text(fileOf(command, "hooks.json"))).not.toContain("cd ..");
    const mcp = example("github-mcp");
    expect(
      JSON.parse(
        text(fileOf(buildPlugin("antigravity", { item: mcp, members: [mcp] }), "mcp_config.json")),
      ),
    ).toEqual({
      mcpServers: { "github-mcp": { serverUrl: "https://api.githubcopilot.com/mcp/" } },
    });
  });
});
