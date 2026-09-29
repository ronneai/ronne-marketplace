import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { cursorRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  cursorRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};

describe("the Cursor renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(cursorRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by .cursor", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    expect(await cursorRenderer.detect(probe([".cursor"]))).toBe(true);
    expect(await cursorRenderer.detect(probe([".claude", ".codex"]))).toBe(false);
  });

  it("writes skills and commands byte for byte as Codex does", () => {
    for (const name of ["secure-coding", "review-diff"])
      for (const scope of ["project", "user"] as const)
        expect(render(name, { scope }).changes).toEqual(
          codexRenderer.render(example(name), { scope }).changes,
        );
  });

  it("leaves skills and commands to Claude Code's copy when both are targets, unless Codex is too", () => {
    const both = { scope: "project" as const, targets: ["claude-code", "cursor"] };
    expect(render("secure-coding", both)).toEqual({
      changes: [],
      warnings: [
        {
          code: "covered_by_target",
          message:
            "Cursor reads Claude Code's copy of @examples/secure-coding (.claude/skills/secure-coding/), so no second one was written.",
        },
      ],
    });
    expect(render("review-diff", both).changes).toEqual([]);
    const all = { ...both, targets: ["claude-code", "codex", "cursor"] };
    expect(render("secure-coding", all).changes).toHaveLength(1);
    // An item kept away from Claude Code still gets Cursor's copy.
    const item = example("secure-coding");
    const noClaude = {
      ...item,
      manifest: { ...item.manifest, targets: { "claude-code": { enabled: false } } },
    };
    expect(cursorRenderer.render(noClaude, both).changes).toHaveLength(1);
  });

  it("writes agents with Cursor's fields, and read-only when no tool changes anything", () => {
    const item = example("code-reviewer");
    const on = { ...item, manifest: { ...item.manifest, targets: {} } };
    const { changes, warnings } = cursorRenderer.render(on, { scope: "project" });
    expect(changes[0]).toMatchObject({ kind: "file", path: ".cursor/agents/code-reviewer.md" });
    const agent = text(changes[0]);
    expect(agent.startsWith("---\nname: code-reviewer\ndescription: ")).toBe(true);
    expect(agent).not.toContain("readonly");
    expect(agent).toContain("---\n<!-- managed by rmk: @examples/code-reviewer@1.0.0 -->\n\n");
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field", "unsupported_field"]);

    const reader = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: ["read", "grep"],
    });
    reader.manifest.targets = { cursor: { overrides: { model: "composer-2", colour: "teal" } } };
    const result = cursorRenderer.render(reader, { scope: "user" });
    expect(text(result.changes[0])).toContain("model: composer-2\nreadonly: true\n");
    expect(result.warnings.map((w) => w.code)).toEqual(["unsupported_field", "invalid_override"]);
  });

  it("respects the example's disabled Cursor target", () => {
    expect(render("code-reviewer")).toMatchObject({
      changes: [],
      warnings: [{ code: "disabled_by_manifest" }],
    });
  });

  it("writes rules as .mdc by activation, and skips them in user scope", () => {
    expect(render("house-style").changes[0]).toMatchObject({
      path: ".cursor/rules/house-style.mdc",
    });
    expect(text(render("house-style").changes[0])).toMatch(
      /^---\nglobs: \*\*\/\*\.ts, \*\*\/\*\.tsx\nalwaysApply: false\n---\n<!-- managed by rmk: @examples\/house-style@1\.0\.0 -->\n\n- Prefer/,
    );
    const as = (activation: string) =>
      text(
        cursorRenderer.render(withBlock("house-style", "rule", { body: "rule.md", activation }), {
          scope: "project",
        }).changes[0],
      );
    expect(as("always")).toMatch(/^---\nalwaysApply: true\n---\n/);
    expect(as("model")).toMatch(
      /^---\ndescription: TypeScript conventions for this codebase\.\nalwaysApply: false\n---\n/,
    );
    expect(as("manual")).toMatch(/^---\nalwaysApply: false\n---\n/);
    expect(render("house-style", { scope: "user" })).toMatchObject({
      changes: [],
      warnings: [{ code: "unsupported_type" }],
    });
  });

  it("writes a hook with Cursor's event and matcher, and the file's version", () => {
    expect(render("format-on-edit").changes).toEqual([
      { kind: "json-key", path: ".cursor/hooks.json", key: ["version"], value: 1 },
      {
        kind: "json-array-item",
        path: ".cursor/hooks.json",
        key: ["hooks", "postToolUse"],
        item: {
          command: "npx --no-install biome format --write $RMK_FILE_PATHS",
          timeout: 30,
          matcher: "Write",
        },
      },
    ]);
    const scripted = withBlock("format-on-edit", "hook", {
      event: "tool.before",
      matcher: { tool: "mcp:github-mcp/create_issue" },
      run: { script: "go.sh" },
    });
    scripted.files = [
      ...scripted.files,
      { path: "go.sh", bytes: new TextEncoder().encode("#!/bin/sh\necho hi\n"), executable: true },
    ];
    const project = cursorRenderer.render(scripted, { scope: "project" });
    expect(project.changes[0]).toMatchObject({
      path: ".cursor/hooks/format-on-edit/go.sh",
      content: "#!/bin/sh\n# managed by rmk: @examples/format-on-edit@1.0.0\necho hi\n",
    });
    expect(project.changes[2]).toMatchObject({
      key: ["hooks", "preToolUse"],
      item: { command: ".cursor/hooks/format-on-edit/go.sh", matcher: "MCP:create_issue" },
    });
    expect(cursorRenderer.render(scripted, { scope: "user" }).changes[2]).toMatchObject({
      item: { command: "hooks/format-on-edit/go.sh" },
    });
    const odd = cursorRenderer.render(
      withBlock("format-on-edit", "hook", {
        event: "tool.after",
        matcher: { tool: "web-search" },
        run: { command: "x" },
      }),
      { scope: "project" },
    );
    expect(odd.warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
    const permission = cursorRenderer.render(
      withBlock("format-on-edit", "hook", { event: "permission.request", run: { command: "x" } }),
      { scope: "project" },
    );
    expect(permission).toMatchObject({ changes: [], warnings: [{ code: "unsupported_field" }] });
  });

  it("leaves a hook to Claude Code's copy when both are targets", () => {
    expect(
      render("format-on-edit", { scope: "project", targets: ["claude-code", "cursor"] }),
    ).toMatchObject({ changes: [], warnings: [{ code: "covered_by_target" }] });
  });

  it("writes MCP servers with ${env:NAME} references only", () => {
    expect(render("github-mcp", { scope: "user" }).changes).toEqual([
      {
        kind: "json-key",
        path: ".cursor/mcp.json",
        key: ["mcpServers", "github-mcp"],
        value: {
          url: "https://api.githubcopilot.com/mcp/",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor's own reference syntax
          headers: { Authorization: "Bearer ${env:GITHUB_TOKEN}" },
        },
      },
    ]);
    const stdio = cursorRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "TOKEN", secret: true }],
      }),
      { scope: "project" },
    );
    expect(stdio.changes[0]).toMatchObject({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor's own reference syntax
      value: { command: "npx", args: ["-y", "server"], env: { TOKEN: "${env:TOKEN}" } },
    });
  });

  it("writes CLI permissions, with arguments, and leaves out ask rules", () => {
    const { changes, warnings } = render("safe-git");
    expect(changes).toEqual([
      {
        kind: "json-array-item",
        path: ".cursor/cli.json",
        key: ["permissions", "deny"],
        item: "Shell(git:push --force*)",
      },
    ]);
    expect(warnings).toHaveLength(2);
    const other = cursorRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [
          { tool: "read", pattern: ".env*", decision: "deny" },
          { tool: "write", decision: "allow" },
          { tool: "shell", pattern: "ls", decision: "allow" },
          { tool: "web-fetch", pattern: "*.github.com", decision: "allow" },
          { tool: "mcp:datadog", decision: "allow" },
          { tool: "glob", decision: "allow" },
        ],
      }),
      { scope: "user" },
    );
    expect(other.changes.map((c) => (c.kind === "json-array-item" ? c.item : null))).toEqual([
      "Read(.env*)",
      "Write(**)",
      "Shell(ls)",
      "WebFetch(*.github.com)",
      "Mcp(datadog:*)",
    ]);
    expect(other.changes[0]).toMatchObject({ path: ".cursor/cli-config.json" });
    expect(other.warnings).toHaveLength(1);
  });
});
