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
});
