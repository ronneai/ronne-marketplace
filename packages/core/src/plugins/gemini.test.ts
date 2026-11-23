import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/gemini/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const fileOf = (plugin: ReturnType<typeof buildPlugin>, path: string) =>
  plugin.files.find((f) => f.path === path)?.bytes;

describe("Gemini CLI extensions", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("gemini", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("carry MCP servers in gemini-extension.json, named scope-name", () => {
    const mcp = example("github-mcp");
    const plugin = buildPlugin("gemini", { item: mcp, members: [mcp] });
    expect(JSON.parse(text(fileOf(plugin, "gemini-extension.json")))).toEqual({
      name: "examples-github-mcp",
      version: "1.0.0",
      description: mcp.manifest.description,
      mcpServers: {
        "github-mcp": {
          httpUrl: "https://api.githubcopilot.com/mcp/",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Gemini CLI's reference syntax
          headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
        },
      },
    });
    const agent = example("code-reviewer");
    const noMcp = buildPlugin("gemini", { item: agent, members: [agent] });
    expect(JSON.parse(text(fileOf(noMcp, "gemini-extension.json")))).not.toHaveProperty(
      "mcpServers",
    );
    expect(noMcp.files.map((f) => f.path)).toContain("agents/code-reviewer.md");
  });

  it("collect rules in GEMINI.md, commands as TOML, and run hook scripts from the extension", () => {
    const rule = example("house-style");
    const always = {
      ...rule,
      manifest: { ...rule.manifest, rule: { body: "rule.md", activation: "always" } },
    };
    const rules = buildPlugin("gemini", { item: always, members: [always] });
    expect(text(fileOf(rules, "GEMINI.md"))).toMatch(
      /^<!-- rmk:begin @examples\/house-style -->\n/,
    );
    const command = example("review-diff");
    expect(
      buildPlugin("gemini", { item: command, members: [command] }).files.map((f) => f.path),
    ).toContain("commands/review-diff.toml");
    const hook = example("format-on-edit");
    const withScript = {
      ...hook,
      manifest: { ...hook.manifest, hook: { event: "tool.after", run: { script: "fmt.sh" } } },
      files: [...hook.files, { path: "fmt.sh", bytes: new TextEncoder().encode("#!/bin/sh\n") }],
    };
    const plugin = buildPlugin("gemini", { item: withScript, members: [withScript] });
    expect(JSON.parse(text(fileOf(plugin, "hooks/hooks.json")))).toEqual({
      hooks: {
        AfterTool: [
          {
            hooks: [
              // biome-ignore lint/suspicious/noTemplateCurlyInString: Gemini CLI's extension variable
              {
                type: "command",
                command: '"${extensionPath}"/hooks/format-on-edit/fmt.sh',
                name: "format-on-edit",
              },
            ],
          },
        ],
      },
    });
    expect(plugin.files.map((f) => f.path)).toContain("hooks/format-on-edit/fmt.sh");
  });
});
