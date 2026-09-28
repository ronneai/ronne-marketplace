import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import { claudeCodeRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, scope: "project" | "user" = "project") =>
  claudeCodeRenderer.render(example(name), { scope });
const text = (change: { kind: string } | undefined) =>
  change?.kind === "file" && "content" in change ? String(change.content) : "";

describe("the Claude Code renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(claudeCodeRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by .claude or CLAUDE.md", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    expect(await claudeCodeRenderer.detect(probe([".claude"]))).toBe(true);
    expect(await claudeCodeRenderer.detect(probe(["CLAUDE.md"]))).toBe(true);
    expect(await claudeCodeRenderer.detect(probe([".cursor"]))).toBe(false);
  });

  it("puts --- on line 1 and the marker after the frontmatter, and maps tools and the model", () => {
    const agent = text(render("code-reviewer").changes[0]);
    expect(agent.startsWith("---\nname: code-reviewer\n")).toBe(true);
    expect(agent).toContain("tools: Read, Grep, Glob, Bash, mcp__github-mcp\n");
    expect(agent).toContain("model: opus\n");
    expect(agent).toContain("---\n<!-- managed by rmk: @examples/code-reviewer@1.0.0 -->\n\n");
  });

  it("writes a glob rule with paths, and other activations as it should", () => {
    const rule = text(render("house-style").changes[0]);
    expect(rule).toContain('paths:\n  - "**/*.ts"\n  - "**/*.tsx"\n');
    const manual = { ...example("house-style") };
    manual.manifest = { ...manual.manifest, rule: { body: "rule.md", activation: "manual" } };
    const change = claudeCodeRenderer.render(manual, { scope: "project" }).changes[0];
    expect(change).toMatchObject({ kind: "dir", path: ".claude/skills/house-style" });
    expect(change?.kind === "dir" ? String(change.files[0]?.content) : "").toContain(
      "disable-model-invocation: true",
    );
  });

  it("renders a command as a skill people run, with its arguments", () => {
    const change = render("review-diff").changes[0];
    const skill = change?.kind === "dir" ? String(change.files[0]?.content) : "";
    // Quoted: bare [target] would read as a YAML list.
    expect(skill).toContain('argument-hint: "[target]"\n');
    expect(skill).toContain("arguments:\n  - target\n");
    expect(skill).toContain("disable-model-invocation: true\n");
    expect(skill).toContain("changes in $target ");
  });

  it("warns about unknown tools and overrides, and respects a disabled target", () => {
    const item = example("code-reviewer");
    const odd = {
      ...item,
      manifest: {
        ...item.manifest,
        agent: { prompt: "prompt.md", tools: ["read", "teleport"] },
        targets: { "claude-code": { overrides: { model: "sonnet", colour: "teal" } } },
      },
    };
    const result = claudeCodeRenderer.render(odd, { scope: "project" });
    expect(result.warnings.map((w) => w.code)).toEqual(["unmapped_tool", "invalid_override"]);
    expect(text(result.changes[0])).toContain("model: sonnet\n");
    const off = {
      ...item,
      manifest: { ...item.manifest, targets: { "claude-code": { enabled: false } } },
    };
    expect(claudeCodeRenderer.render(off, { scope: "project" })).toMatchObject({
      changes: [],
      warnings: [{ code: "disabled_by_manifest" }],
    });
  });

  it("writes a hook as one array element, mapping the event and the tool", () => {
    const result = render("format-on-edit");
    expect(result.changes).toEqual([
      {
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["hooks", "PostToolUse"],
        item: {
          matcher: "Edit",
          hooks: [
            {
              type: "command",
              command: "npx --no-install biome format --write $RMK_FILE_PATHS",
              timeout: 30,
            },
          ],
        },
      },
    ]);
    // The canonical variable isn't Claude Code's: the hook has to read stdin.
    expect(result.warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    const item = example("format-on-edit");
    const scripted = {
      ...item,
      files: [
        ...item.files,
        {
          path: "fmt.sh",
          bytes: new TextEncoder().encode("#!/bin/sh\necho hi\n"),
          executable: true,
        },
      ],
      manifest: { ...item.manifest, hook: { event: "session.start", run: { script: "fmt.sh" } } },
    };
    const user = claudeCodeRenderer.render(scripted, { scope: "user" });
    expect(user.changes[0]).toMatchObject({
      kind: "file",
      path: ".claude/hooks/format-on-edit/fmt.sh",
      executable: true,
    });
    expect(text(user.changes[0]).split("\n").slice(0, 2)).toEqual([
      "#!/bin/sh",
      "# managed by rmk: @examples/format-on-edit@1.0.0",
    ]);
    expect(user.changes[1]).toMatchObject({
      key: ["hooks", "SessionStart"],
      item: {
        hooks: [{ type: "command", command: '"$HOME"/.claude/hooks/format-on-edit/fmt.sh' }],
      },
    });
    expect(user.warnings).toEqual([]);
    const odd = {
      ...item,
      manifest: { ...item.manifest, hook: { event: "moon.rise", run: { command: "x" } } },
    };
    expect(claudeCodeRenderer.render(odd, { scope: "project" })).toMatchObject({
      changes: [],
      warnings: [{ code: "unsupported_field" }],
    });
  });

  it("writes an MCP server with env references only, in .mcp.json or ~/.claude.json", () => {
    const project = render("github-mcp").changes[0];
    expect(project).toEqual({
      kind: "json-key",
      path: ".mcp.json",
      key: ["mcpServers", "github-mcp"],
      value: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      },
    });
    expect(render("github-mcp", "user").changes[0]).toMatchObject({ path: ".claude.json" });
    expect(JSON.stringify(project)).not.toContain("ghp_");
  });

  it("writes each permission rule as a string in its decision's list, and warns about the rest", () => {
    expect(render("safe-git").changes).toEqual([
      {
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["permissions", "deny"],
        item: "Bash(git push --force*)",
      },
      {
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["permissions", "ask"],
        item: "Bash(git push*)",
      },
      {
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["permissions", "ask"],
        item: "Bash(git reset --hard*)",
      },
    ]);
    const item = example("safe-git");
    const more = {
      ...item,
      manifest: {
        ...item.manifest,
        "permission-policy": {
          rules: [
            { tool: "web-fetch", pattern: "*.example.com", decision: "allow" },
            { tool: "mcp:github/search", decision: "allow" },
            { tool: "mcp:github", pattern: "x", decision: "deny" },
            { tool: "web-search", decision: "deny" },
          ],
        },
      },
    };
    const result = claudeCodeRenderer.render(more, { scope: "project" });
    expect(result.changes.map((c) => (c.kind === "json-array-item" ? c.item : ""))).toEqual([
      "WebFetch(domain:*.example.com)",
      "mcp__github__search",
      "WebSearch",
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it("writes the status line script and points statusLine at it", () => {
    const result = render("git-branch");
    expect(result.changes[0]).toMatchObject({
      kind: "file",
      path: ".claude/statusline/git-branch/statusline.sh",
      executable: true,
    });
    expect(text(result.changes[0])).toContain(
      "#!/bin/sh\n# managed by rmk: @examples/git-branch@1.0.0\n",
    );
    expect(result.changes[1]).toEqual({
      kind: "json-key",
      path: ".claude/settings.json",
      key: ["statusLine"],
      value: {
        type: "command",
        command: '"$CLAUDE_PROJECT_DIR"/.claude/statusline/git-branch/statusline.sh',
      },
    });
  });

  it("writes a language server as a local plugin with its own marketplace, registered and enabled", () => {
    const result = render("typescript-lsp");
    expect(result.warnings).toEqual([]);
    expect(result.changes.map((c) => [c.kind, c.path, "key" in c ? c.key : null])).toEqual([
      ["dir", ".claude/rmk-plugins/typescript-lsp", null],
      ["json-key", ".claude/settings.json", ["extraKnownMarketplaces", "rmk-typescript-lsp"]],
      [
        "json-key",
        ".claude/settings.json",
        ["enabledPlugins", "typescript-lsp@rmk-typescript-lsp"],
      ],
    ]);
    const plugin = result.changes[0];
    const file = (path: string) =>
      plugin?.kind === "dir" ? String(plugin.files.find((f) => f.path === path)?.content) : "";
    expect(JSON.parse(file(".lsp.json"))).toEqual({
      "typescript-lsp": {
        command: "typescript-language-server",
        args: ["--stdio"],
        extensionToLanguage: {
          ".ts": "typescript",
          ".tsx": "typescript",
          ".js": "javascript",
          ".jsx": "javascript",
          ".mjs": "javascript",
          ".cjs": "javascript",
        },
      },
    });
    expect(JSON.parse(file(".claude-plugin/marketplace.json")).plugins).toEqual([
      { name: "typescript-lsp", source: "./" },
    ]);
    expect(claudeCodeRenderer.supports("lsp-server")).toBe("degraded");
  });

  it("writes nothing for a bundle, and is listed for rmk platforms", async () => {
    expect(render("starter-kit")).toEqual({ changes: [], warnings: [] });
    const { RENDERERS } = await import("../registry.js");
    expect(RENDERERS.map((r) => r.id)).toEqual(["claude-code"]);
  });
});
