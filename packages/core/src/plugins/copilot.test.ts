import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";
import { MARKETPLACE_PATHS, marketplaceFor } from "./marketplace.js";
import { pluginNameProblem } from "./names.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/copilot/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const fileOf = (plugin: ReturnType<typeof buildPlugin>, path: string) =>
  plugin.files.find((f) => f.path === path)?.bytes;

describe("GitHub Copilot plugins", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("copilot", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("are Agent Plugins, with Copilot's own parts under com.github.copilot/", () => {
    const agent = example("code-reviewer");
    const plugin = buildPlugin("copilot", { item: agent, members: [agent] });
    expect(JSON.parse(text(fileOf(plugin, "plugin.json")))).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "examples.code-reviewer",
      version: "1.0.0",
    });
    expect(plugin.files.map((f) => f.path)).toContain(
      "com.github.copilot/agents/code-reviewer.agent.md",
    );
    const rule = example("house-style");
    expect(
      buildPlugin("copilot", { item: rule, members: [rule] }).files.map((f) => f.path),
    ).toContain("com.github.copilot/rules/house-style.instructions.md");
    const always = {
      ...rule,
      manifest: { ...rule.manifest, rule: { body: "rule.md", activation: "always" } },
    };
    const alwaysPlugin = buildPlugin("copilot", { item: always, members: [always] });
    expect(
      text(fileOf(alwaysPlugin, "com.github.copilot/rules/house-style.instructions.md")),
    ).toMatch(/^---\napplyTo: "\*\*"\n---\n/);
    const lsp = example("typescript-lsp");
    const servers = JSON.parse(
      text(
        fileOf(
          buildPlugin("copilot", { item: lsp, members: [lsp] }),
          "com.github.copilot/lsp.json",
        ),
      ),
    );
    expect(servers.lspServers["typescript-lsp"].command).toBe("typescript-language-server");
  });

  it("write MCP servers in the portable shape, and hooks run from the plugin", () => {
    const mcp = example("github-mcp");
    const servers = JSON.parse(
      text(fileOf(buildPlugin("copilot", { item: mcp, members: [mcp] }), "mcp.json")),
    );
    expect(servers.mcpServers["github-mcp"]).toEqual({
      type: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an environment variable reference, on purpose.
      headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
    });
    const base = example("format-on-edit");
    const hook = base.manifest.hook as Record<string, unknown>;
    const item = {
      ...base,
      manifest: { ...base.manifest, hook: { ...hook, run: { script: "my format.sh" } } },
      files: [
        ...base.files,
        { path: "my format.sh", bytes: new TextEncoder().encode("#!/bin/sh\n"), executable: true },
      ],
    };
    const plugin = buildPlugin("copilot", { item, members: [item] });
    expect(plugin.files.map((f) => f.path)).toContain(
      "com.github.copilot/hooks/format-on-edit/my format.sh",
    );
    expect(JSON.parse(text(fileOf(plugin, "com.github.copilot/hooks/hooks.json")))).toEqual({
      version: 1,
      hooks: {
        postToolUse: [
          {
            type: "command",
            bash: `"$COPILOT_PLUGIN_ROOT"/com.github.copilot/hooks/'format-on-edit/my format.sh'`,
            timeoutSec: 30,
            matcher: "edit",
          },
        ],
      },
    });
    expect(plugin.files.some((f) => f.path.startsWith(".github/"))).toBe(false);
  });

  it("leave out what a plugin can't carry, and take Agent Plugins' names", () => {
    const policy = example("safe-git");
    expect(() => buildPlugin("copilot", { item: policy, members: [policy] })).toThrow(
      "@examples/safe-git (permission-policy) doesn't install in GitHub Copilot.",
    );
    expect(pluginNameProblem("copilot", "a".repeat(65))).toBe("too_long");
    expect(pluginNameProblem("copilot", "team.a--b")).toBe("double_hyphen");
  });

  it("are listed in .github/plugin/marketplace.json, by folder", () => {
    const file = marketplaceFor(
      "copilot",
      [
        {
          name: "team.b",
          version: "1.0.0",
          description: "B.",
          source: { kind: "path", path: "plugins/copilot/team.b" },
        },
      ],
      { name: "ronne-example", owner: "Ronne at example", description: "Items." },
    );
    expect(MARKETPLACE_PATHS.copilot).toBe(".github/plugin/marketplace.json");
    expect(JSON.parse(text(file.bytes))).toEqual({
      name: "ronne-example",
      owner: { name: "Ronne at example" },
      metadata: { description: "Items." },
      plugins: [
        { name: "team.b", version: "1.0.0", description: "B.", source: "./plugins/copilot/team.b" },
      ],
    });
  });
});
