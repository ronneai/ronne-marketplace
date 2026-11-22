import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { copilotRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  copilotRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};

describe("the GitHub Copilot renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(copilotRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by Copilot's own files, not by .github alone", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    for (const path of [
      ".github/copilot-instructions.md",
      ".github/copilot",
      ".github/agents",
      ".github/instructions",
      ".github/prompts",
      ".github/hooks",
      ".github/skills",
      ".github/lsp.json",
    ])
      expect(await copilotRenderer.detect(probe([".github", path]))).toBe(true);
    expect(await copilotRenderer.detect(probe([".github", ".github/workflows"]))).toBe(false);
    expect(await copilotRenderer.detect(probe([".vscode", ".mcp.json", ".agents"]))).toBe(false);
  });

  it("writes skills and commands with the same bytes as the shared copy, under .github/skills", () => {
    for (const name of ["secure-coding", "review-diff"])
      for (const scope of ["project", "user"] as const) {
        const root = scope === "project" ? ".github/skills/" : ".copilot/skills/";
        const shared = codexRenderer.render(example(name), { scope }).changes;
        expect(render(name, { scope }).changes).toEqual(
          shared.map((change) => ({
            ...change,
            path: change.path.replace(".agents/skills/", root),
          })),
        );
      }
  });

  it("writes a command as a skill the model doesn't start on its own", () => {
    const [change] = render("review-diff").changes;
    expect(change?.kind).toBe("dir");
    const skill = change?.kind === "dir" ? String(change.files[0]?.content) : "";
    expect(skill).toContain("disable-model-invocation: true");
    expect(skill).toMatch(/^---\nname: review-diff\n/);
  });

  it("maps an agent's tools to Copilot's aliases, once each", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".github/agents/code-reviewer.agent.md"]);
    expect(text(changes[0])).toContain(
      'tools:\n  - read\n  - search\n  - execute\n  - "github-mcp/*"\n',
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    expect(warnings[0]?.message).toContain("targets.copilot.overrides.model");
    const user = copilotRenderer.render(example("code-reviewer"), { scope: "user" });
    expect(user.changes.map((c) => c.path)).toEqual([".copilot/agents/code-reviewer.agent.md"]);
  });

  it("maps every canonical tool", () => {
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: [
        "read",
        "edit",
        "write",
        "grep",
        "glob",
        "shell",
        "web-fetch",
        "web-search",
        "mcp:github",
        "mcp:github/create_issue",
      ],
    });
    const { changes, warnings } = copilotRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain(
      'tools:\n  - read\n  - edit\n  - search\n  - execute\n  - web\n  - "github/*"\n  - "github/create_issue"\n',
    );
    expect(warnings).toEqual([]);
  });

  it("writes the model only from targets.copilot.overrides, and refuses other overrides", () => {
    const item = example("code-reviewer");
    const manifest = {
      ...item.manifest,
      targets: { copilot: { overrides: { model: "claude-sonnet-4.6", tools: ["read"] } } },
    };
    const { changes, warnings } = copilotRenderer.render(
      { ...item, manifest },
      { scope: "project" },
    );
    expect(text(changes[0])).toContain("model: claude-sonnet-4.6\n");
    expect(warnings).toEqual([
      {
        code: "invalid_override",
        message: "Copilot takes no override `tools` for an agent; only `model`.",
      },
    ]);
  });

  it("says an agent's skills aren't preloaded", () => {
    const item = {
      ...example("code-reviewer"),
      dependencies: [
        { name: "@examples/secure-coding", type: "skill" as const, preload: true },
        { name: "@examples/review-diff", type: "skill" as const, preload: false },
      ],
    };
    const { warnings } = copilotRenderer.render(item, { scope: "project" });
    expect(warnings.map((w) => w.message).join("\n")).toContain("not preloaded");
  });

  it("writes always and glob rules as instructions, and model and manual rules as skills", () => {
    const rule = (activation: string, scope: RenderContext["scope"] = "project") =>
      copilotRenderer.render(
        withBlock("house-style", "rule", {
          body: "rule.md",
          activation,
          globs: ["**/*.ts", "**/*.tsx"],
        }),
        { scope },
      ).changes;
    const [glob] = rule("glob");
    expect(glob?.path).toBe(".github/instructions/house-style.instructions.md");
    expect(text(glob)).toMatch(/^---\napplyTo: "\*\*\/\*\.ts,\*\*\/\*\.tsx"\n---\n/);
    const [always] = rule("always", "user");
    expect(always?.path).toBe(".copilot/instructions/house-style.instructions.md");
    expect(text(always)).toMatch(/^---\napplyTo: "\*\*"\n---\n/);
    const [model] = rule("model");
    expect(model).toMatchObject({ kind: "dir", path: ".github/skills/house-style" });
    const [manual] = rule("manual", "user");
    expect(manual).toMatchObject({ kind: "dir", path: ".copilot/skills/house-style" });
    expect(manual?.kind === "dir" ? String(manual.files[0]?.content) : "").toContain(
      "disable-model-invocation: true",
    );
  });

  it("says it can't take permission policies or output styles", () => {
    expect(copilotRenderer.supports("permission-policy")).toBe("none");
    expect(copilotRenderer.supports("output-style")).toBe("none");
    expect(copilotRenderer.supports("statusline")).toBe("degraded");
    expect(copilotRenderer.supports("lsp-server")).toBe("native");
  });

  it("writes nothing for an item turned off for Copilot", () => {
    const item = example("secure-coding");
    const manifest = { ...item.manifest, targets: { copilot: { enabled: false } } };
    const { changes, warnings } = copilotRenderer.render(
      { ...item, manifest },
      { scope: "project" },
    );
    expect(changes).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(["disabled_by_manifest"]);
  });
});
