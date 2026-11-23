import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { TOOLS, toolOf } from "./mappings.js";
import { geminiRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  geminiRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};
const withFile = (item: ReturnType<typeof example>, path: string, content: string) => ({
  ...item,
  files: [...item.files, { path, bytes: new TextEncoder().encode(content) }],
});

describe("the Gemini CLI renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(geminiRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by .gemini or GEMINI.md", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    expect(await geminiRenderer.detect(probe([".gemini"]))).toBe(true);
    expect(await geminiRenderer.detect(probe(["GEMINI.md"]))).toBe(true);
    expect(await geminiRenderer.detect(probe([".agents", ".agents/rules", "AGENTS.md"]))).toBe(
      false,
    );
  });

  it("writes skills byte for byte as the shared copy, in both scopes", () => {
    for (const scope of ["project", "user"] as const)
      expect(render("secure-coding", { scope }).changes).toEqual(
        codexRenderer.render(example("secure-coding"), { scope }).changes,
      );
  });

  it("writes a command as TOML, its one argument as {{args}}", () => {
    const { changes, warnings } = render("review-diff");
    expect(changes.map((c) => c.path)).toEqual([".gemini/commands/review-diff.toml"]);
    const toml = text(changes[0]);
    expect(toml).toMatch(/^# managed by rmk: @examples\/review-diff@1\.0\.0\ndescription = "/);
    expect(toml).toContain("prompt = '''\nReview the uncommitted changes in {{args}} ");
    expect(toml).not.toContain("{{target}}");
    expect(warnings).toEqual([]);
    expect(render("review-diff", { scope: "user" }).changes[0]?.path).toBe(
      ".gemini/commands/review-diff.toml",
    );
  });

  it("keeps several arguments' placeholders with a note and a warning", () => {
    const item = withFile(
      withBlock("review-diff", "command", {
        body: "two.md",
        args: [
          { name: "from", required: true, description: "Base ref." },
          { name: "to", description: "Head ref." },
        ],
      }),
      "two.md",
      "Compare {{from}} with {{to}}.",
    );
    const { changes, warnings } = geminiRenderer.render(item, { scope: "project" });
    const toml = text(changes[0]);
    expect(toml).toContain("Compare {{from}} with {{to}}.");
    expect(toml).toContain("What the person typed after the command is in {{args}}.");
    expect(toml).toContain("- `from`: Base ref.\n- `to` (optional): Head ref.");
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
  });

  it("warns about text Gemini CLI would run as a shell command or read as a file", () => {
    for (const body of ["Run !{git status} first.", "Read @{src/index.ts}."]) {
      const item = withFile(withBlock("review-diff", "command", { body: "x.md" }), "x.md", body);
      const { warnings } = geminiRenderer.render(item, { scope: "project" });
      expect(warnings[0]?.message).toContain("runs as a shell command or reads as a file");
    }
  });

  it("writes a prompt TOML can't hold as a literal block as a basic string", () => {
    const item = withFile(
      withBlock("review-diff", "command", { body: "q.md" }),
      "q.md",
      "Say '''hi''' then stop.",
    );
    const toml = text(geminiRenderer.render(item, { scope: "project" }).changes[0]);
    expect(toml).toContain(`prompt = "Say '''hi''' then stop.\\n"`);
  });

  it("maps an agent's tools, and takes a model only from the override", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".gemini/agents/code-reviewer.md"]);
    expect(text(changes[0])).toContain(
      'tools:\n  - read_file\n  - grep_search\n  - glob\n  - run_shell_command\n  - "mcp_github-mcp_*"\n---\n',
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    expect(warnings[0]?.message).toContain("targets.gemini.overrides.model");
    const item = withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: "fast" });
    const overridden = {
      ...item,
      manifest: {
        ...item.manifest,
        targets: { gemini: { overrides: { model: "gemini-3-pro", temperature: 0.2 } } },
      },
    };
    const result = geminiRenderer.render(overridden, { scope: "user" });
    expect(result.changes[0]?.path).toBe(".gemini/agents/code-reviewer.md");
    expect(text(result.changes[0])).not.toContain("tools:");
    expect(text(result.changes[0])).toContain("model: gemini-3-pro\n");
    expect(result.warnings.map((w) => w.code)).toEqual(["invalid_override"]);
  });

  it("maps every canonical tool, and only MCP names Gemini CLI can parse", () => {
    const expected = {
      read: "read_file",
      edit: "replace",
      write: "write_file",
      grep: "grep_search",
      glob: "glob",
      shell: "run_shell_command",
      "web-fetch": "web_fetch",
      "web-search": "google_web_search",
    };
    expect(TOOLS).toEqual(expected);
    for (const [canonical, name] of Object.entries(expected)) expect(toolOf(canonical)).toBe(name);
    expect(toolOf("mcp:github-mcp")).toBe("mcp_github-mcp_*");
    expect(toolOf("mcp:github-mcp/search_issues")).toBe("mcp_github-mcp_search_issues");
    for (const bad of ["mcp:git_hub", "mcp:github/___", "mcp:github/a b", "teleport", "__proto__"])
      expect(toolOf(bad)).toBeNull();
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: ["read", "mcp:git_hub", "read"],
    });
    const { changes, warnings } = geminiRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain("tools:\n  - read_file\n---\n");
    expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
  });

  it("writes always and glob rules as GEMINI.md sections, the rest as the shared skills", () => {
    const rule = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
      geminiRenderer.render(withBlock("house-style", "rule", block), { scope });
    expect(rule({ body: "rule.md", activation: "always" }).changes[0]).toMatchObject({
      kind: "section",
      path: "GEMINI.md",
      key: "@examples/house-style",
    });
    const glob = rule({ body: "rule.md", activation: "glob", globs: ["**/*.ts"] });
    expect(glob.changes[0]).toMatchObject({ kind: "section", path: "GEMINI.md" });
    expect(glob.changes[0]?.kind === "section" ? glob.changes[0].text : "").toMatch(
      /^These rules apply to files matching `\*\*\/\*\.ts`\.\n\n/,
    );
    expect(rule({ body: "rule.md" }, "user").changes[0]?.path).toBe(".gemini/GEMINI.md");
    for (const activation of ["model", "manual"]) {
      const block = { body: "rule.md", activation };
      expect(rule(block).changes).toEqual(
        codexRenderer.render(withBlock("house-style", "rule", block), { scope: "project" }).changes,
      );
    }
  });

  it("says which types it can't take, and which only in part", () => {
    expect(geminiRenderer.supports("statusline")).toBe("none");
    expect(geminiRenderer.supports("output-style")).toBe("none");
    expect(geminiRenderer.supports("lsp-server")).toBe("none");
    expect(geminiRenderer.supports("permission-policy")).toBe("degraded");
    for (const type of [
      "skill",
      "agent",
      "rule",
      "command",
      "hook",
      "mcp-server",
      "bundle",
    ] as const)
      expect(geminiRenderer.supports(type)).toBe("native");
  });
});
