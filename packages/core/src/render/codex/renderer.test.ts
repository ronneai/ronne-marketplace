import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change } from "../types.js";
import { codexRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, scope: "project" | "user" = "project") =>
  codexRenderer.render(example(name), { scope });
const text = (change: { kind: string } | undefined) =>
  change?.kind === "file" && "content" in change ? String(change.content) : "";
const skillText = (change: Change | undefined) =>
  change?.kind === "dir" ? String(change.files[0]?.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};

describe("the Codex renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(codexRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by .codex", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    expect(await codexRenderer.detect(probe([".codex"]))).toBe(true);
    expect(await codexRenderer.detect(probe(["AGENTS.md", ".claude"]))).toBe(false);
  });

  it("puts skills in the cross-tool folder, in both scopes", () => {
    expect(render("secure-coding").changes[0]).toMatchObject({
      kind: "dir",
      path: ".agents/skills/secure-coding",
    });
    expect(render("secure-coding", "user").changes[0]).toMatchObject({
      path: ".agents/skills/secure-coding",
    });
  });

  it("writes an agent as TOML Codex can read, and warns about what it can't take", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes[0]).toMatchObject({ kind: "file", path: ".codex/agents/code-reviewer.toml" });
    const agent = text(changes[0]);
    expect(agent.startsWith("# managed by rmk: @examples/code-reviewer@1.0.0\n")).toBe(true);
    const parsed = parseToml(agent);
    expect(parsed).toMatchObject({ name: "code-reviewer" });
    const prompt = example("code-reviewer").files.find((f) => f.path === "prompt.md");
    expect(parsed.developer_instructions).toBe(
      `${new TextDecoder().decode(prompt?.bytes).trimEnd()}\n`,
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field", "unsupported_field"]);
  });

  it("takes a model override, and keeps awkward instructions valid TOML", () => {
    const item = withBlock("code-reviewer", "agent", { prompt: "prompt.md" });
    const odd = {
      ...item,
      manifest: {
        ...item.manifest,
        targets: { codex: { overrides: { model: "gpt-5-codex", colour: "teal" } } },
      },
      files: item.files.map((f) =>
        f.path === "prompt.md"
          ? { ...f, bytes: new TextEncoder().encode("Say ''' and \"\"\" and a \\ here.\n") }
          : f,
      ),
    };
    const result = codexRenderer.render(odd, { scope: "project" });
    const parsed = parseToml(text(result.changes[0]));
    expect(parsed.model).toBe("gpt-5-codex");
    expect(parsed.developer_instructions).toBe("Say ''' and \"\"\" and a \\ here.\n");
    expect(result.warnings.map((w) => w.code)).toEqual(["invalid_override"]);
  });

  it("writes rules into AGENTS.md as a section, or as skills", () => {
    const glob = render("house-style").changes[0];
    expect(glob).toMatchObject({
      kind: "section",
      path: "AGENTS.md",
      key: "@examples/house-style",
    });
    expect(glob?.kind === "section" ? glob.text : "").toMatch(
      /^These rules apply to files matching `\*\*\/\*\.ts`, `\*\*\/\*\.tsx`\.\n\n/,
    );
    expect(render("house-style", "user").changes[0]).toMatchObject({ path: ".codex/AGENTS.md" });
    const always = codexRenderer.render(
      withBlock("house-style", "rule", { body: "rule.md", activation: "always" }),
      { scope: "project" },
    ).changes[0];
    expect(always?.kind === "section" ? always.text : "").not.toContain("apply to files");
    const manual = codexRenderer.render(
      withBlock("house-style", "rule", { body: "rule.md", activation: "manual" }),
      { scope: "project" },
    ).changes[0];
    expect(manual).toMatchObject({ kind: "dir", path: ".agents/skills/house-style" });
    expect(skillText(manual)).toContain("disable-model-invocation: true\n");
    const model = codexRenderer.render(
      withBlock("house-style", "rule", { body: "rule.md", activation: "model" }),
      { scope: "project" },
    ).changes[0];
    expect(skillText(model)).toContain("description: TypeScript conventions");
    expect(skillText(model)).not.toContain("disable-model-invocation");
  });

  it("renders a command as a skill, with a note for its arguments", () => {
    const { changes, warnings } = render("review-diff");
    const skill = skillText(changes[0]);
    expect(changes[0]).toMatchObject({ path: ".agents/skills/review-diff" });
    expect(skill).toContain("disable-model-invocation: true\n");
    expect(skill).toContain("{{target}}");
    expect(skill).toContain("- `target` (optional): File or folder to review.");
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
  });

  it("respects a disabled target", () => {
    const item = example("secure-coding");
    const off = { ...item, manifest: { ...item.manifest, targets: { codex: { enabled: false } } } };
    expect(codexRenderer.render(off, { scope: "project" })).toMatchObject({
      changes: [],
      warnings: [{ code: "disabled_by_manifest" }],
    });
  });

  it("writes a hook as one element of hooks.json, with no matcher", () => {
    const { changes } = render("format-on-edit", "user");
    expect(changes).toEqual([
      {
        kind: "json-array-item",
        path: ".codex/hooks.json",
        key: ["hooks", "PostToolUse"],
        item: {
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
    const scripted = withBlock("format-on-edit", "hook", {
      event: "session.start",
      run: { script: "go.sh" },
    });
    scripted.files = [
      ...scripted.files,
      { path: "go.sh", bytes: new TextEncoder().encode("#!/bin/sh\necho hi\n"), executable: true },
    ];
    const result = codexRenderer.render(scripted, { scope: "project" });
    expect(result.changes[0]).toMatchObject({
      kind: "file",
      path: ".codex/hooks/format-on-edit/go.sh",
      executable: true,
      content: "#!/bin/sh\n# managed by rmk: @examples/format-on-edit@1.0.0\necho hi\n",
    });
    expect(result.changes[1]).toMatchObject({
      key: ["hooks", "SessionStart"],
      item: {
        hooks: [
          {
            type: "command",
            command: '"$(git rev-parse --show-toplevel)"/.codex/hooks/format-on-edit/go.sh',
          },
        ],
      },
    });
    expect(result.warnings).toEqual([]);
    const unknown = codexRenderer.render(
      withBlock("format-on-edit", "hook", { event: "file.saved", run: { command: "x" } }),
      { scope: "project" },
    );
    expect(unknown).toMatchObject({ changes: [], warnings: [{ code: "unsupported_field" }] });
  });

  it("writes MCP servers with secrets by name only", () => {
    expect(render("github-mcp").changes).toEqual([
      {
        kind: "toml-key",
        path: ".codex/config.toml",
        key: ["mcp_servers", "github-mcp"],
        value: { url: "https://api.githubcopilot.com/mcp/", bearer_token_env_var: "GITHUB_TOKEN" },
      },
    ]);
    const http = codexRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "http",
        url: "https://x.example/mcp",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's own ${NAME} references
        headers: { "X-Key": "${KEY}", "X-Team": "core", "X-Mixed": "id ${ID}" },
      }),
      { scope: "project" },
    );
    expect(http.changes[0]).toMatchObject({
      value: {
        url: "https://x.example/mcp",
        http_headers: { "X-Team": "core" },
        env_http_headers: { "X-Key": "KEY" },
      },
    });
    expect(http.warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    const stdio = codexRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "TOKEN", secret: true }],
      }),
      { scope: "user" },
    );
    expect(stdio.changes[0]).toMatchObject({
      path: ".codex/config.toml",
      value: { command: "npx", args: ["-y", "server"], env_vars: ["TOKEN"] },
    });
    expect(JSON.stringify(stdio.changes)).not.toContain("${");
  });

  it("writes shell rules as prefix rules, and leaves out what Codex can't say", () => {
    const { changes, warnings } = render("safe-git");
    expect(text(changes[0])).toBe(
      [
        "# managed by rmk: @examples/safe-git@1.0.0",
        'prefix_rule(pattern = ["git", "push", "--force"], decision = "forbidden")',
        'prefix_rule(pattern = ["git", "push"], decision = "prompt")',
        'prefix_rule(pattern = ["git", "reset", "--hard"], decision = "prompt")',
        "",
      ].join("\n"),
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field", "unsupported_field"]);
    const other = codexRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [
          { tool: "read", pattern: "**/.env", decision: "deny" },
          { tool: "shell", pattern: "rm -rf *", decision: "deny" },
          { tool: "shell", pattern: "git * --force", decision: "deny" },
        ],
      }),
      { scope: "project" },
    );
    expect(text(other.changes[0])).toContain('prefix_rule(pattern = ["rm", "-rf"]');
    expect(other.warnings).toHaveLength(2);
  });

  it("skips what Codex has no place for, writes nothing for a bundle, and is listed", async () => {
    for (const name of ["concise", "git-branch", "typescript-lsp"]) {
      const type = String(example(name).manifest.type);
      expect(codexRenderer.supports(type as never)).toBe("none");
      expect(render(name).warnings.map((w) => w.code)).toEqual(["unsupported_type"]);
    }
    expect(codexRenderer.supports("permission-policy")).toBe("degraded");
    expect(render("starter-kit")).toEqual({ changes: [], warnings: [] });
    const { RENDERERS } = await import("../registry.js");
    expect(RENDERERS.map((r) => r.id)).toEqual(["claude-code", "codex"]);
  });
});
