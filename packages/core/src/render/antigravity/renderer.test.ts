import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { TOOLS } from "./mappings.js";
import { antigravityRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  antigravityRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};
const rule = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
  antigravityRenderer.render(withBlock("house-style", "rule", block), { scope });

describe("the Antigravity renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(antigravityRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by Antigravity's own files, not by .agents or its skills", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    for (const path of [
      ".agents/rules",
      ".agents/agents",
      ".agents/hooks.json",
      ".agents/mcp_config.json",
    ])
      expect(await antigravityRenderer.detect(probe([".agents", path]))).toBe(true);
    expect(await antigravityRenderer.detect(probe([".agents", ".agents/skills"]))).toBe(false);
    expect(await antigravityRenderer.detect(probe([".gemini", "GEMINI.md", "AGENTS.md"]))).toBe(
      false,
    );
  });

  it("writes skills and commands byte for byte as the shared copy, in the home folder under .gemini/config", () => {
    for (const name of ["secure-coding", "review-diff"]) {
      const shared = codexRenderer.render(example(name), { scope: "project" }).changes;
      expect(render(name).changes).toEqual(shared);
      const user = codexRenderer.render(example(name), { scope: "user" }).changes;
      expect(render(name, { scope: "user" }).changes).toEqual(
        user.map((change) => ({
          ...change,
          path: change.path.replace(".agents/skills/", ".gemini/config/skills/"),
        })),
      );
    }
  });

  it("maps an agent's tools and model hint, and warns about an MCP tool", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".agents/agents/code-reviewer.md"]);
    expect(text(changes[0])).toContain(
      "tools:\n  - view_file\n  - grep_search\n  - find_by_name\n  - run_command\nmodel: pro\n",
    );
    expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
    expect(warnings[0]?.message).toContain("mcp:github-mcp");
    const user = render("code-reviewer", { scope: "user" });
    expect(user.changes.map((c) => c.path)).toEqual([".gemini/config/agents/code-reviewer.md"]);
  });

  it("maps every canonical tool once, and every model hint", () => {
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: [...Object.keys(TOOLS), "read", "teleport"],
      model: "fast",
    });
    const { changes, warnings } = antigravityRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain(
      "tools:\n  - view_file\n  - replace_file_content\n  - write_to_file\n  - grep_search\n  - find_by_name\n  - run_command\n  - read_url_content\n  - search_web\nmodel: flash\n",
    );
    expect(warnings.filter((w) => w.code === "unmapped_tool")).toHaveLength(1);
    const model = (hint: string) =>
      text(
        antigravityRenderer.render(
          withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: hint }),
          { scope: "project" },
        ).changes[0],
      );
    expect(model("default")).toContain("model: inherit\n");
    expect(model("strong")).toContain("model: pro\n");
  });

  it("leaves `tools` out when the manifest names none, and takes a model override", () => {
    const item = withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: "fast" });
    const overridden = {
      ...item,
      manifest: {
        ...item.manifest,
        targets: { antigravity: { overrides: { model: "gemini-3-pro", effort: "high" } } },
      },
    };
    const { changes, warnings } = antigravityRenderer.render(overridden, { scope: "project" });
    expect(text(changes[0])).not.toContain("tools:");
    expect(text(changes[0])).toContain("model: gemini-3-pro\n");
    expect(warnings.map((w) => w.code)).toEqual(["invalid_override"]);
  });

  it("pins each rule's trigger", () => {
    expect(text(rule({ body: "rule.md", activation: "always" }).changes[0])).toMatch(
      /^---\ntrigger: always_on\n/,
    );
    const glob = rule({ body: "rule.md", activation: "glob", globs: ["**/*.ts", "**/*.tsx"] });
    expect(glob.changes[0]?.path).toBe(".agents/rules/house-style.md");
    expect(text(glob.changes[0])).toContain("trigger: glob\n");
    expect(text(glob.changes[0])).toContain('globs: "**/*.ts, **/*.tsx"\n');
    expect(text(rule({ body: "rule.md", activation: "model" }).changes[0])).toMatch(
      /^---\ntrigger: model_decision\ndescription: /,
    );
    expect(rule({ body: "rule.md" }, "user").changes[0]?.path).toBe(
      ".gemini/config/rules/house-style.md",
    );
  });

  it("writes a manual rule as the same skill Codex writes", () => {
    const block = { body: "rule.md", activation: "manual" };
    const codex = codexRenderer.render(withBlock("house-style", "rule", block), {
      scope: "project",
    });
    expect(rule(block).changes).toEqual(codex.changes);
    expect(rule(block, "user").changes[0]?.path).toBe(".gemini/config/skills/house-style");
  });

  it("warns about a rule Antigravity would truncate", () => {
    const item = withBlock("house-style", "rule", { body: "big.md", activation: "always" });
    const big = {
      ...item,
      files: [
        ...item.files,
        { path: "big.md", bytes: new TextEncoder().encode("x".repeat(24_001)) },
      ],
    };
    const { changes, warnings } = antigravityRenderer.render(big, { scope: "project" });
    expect(changes).toHaveLength(1);
    expect(warnings[0]?.message).toContain("24,000 bytes");
  });
});
