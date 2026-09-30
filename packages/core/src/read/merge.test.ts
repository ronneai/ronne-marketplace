import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { checkPackage } from "../package-checks.js";
import type { PackageFile } from "../package-file.js";
import { claudeCodeRenderer } from "../render/claude-code/renderer.js";
import { codexRenderer } from "../render/codex/renderer.js";
import { loadItemDir } from "../render/harness.js";
import type { Change } from "../render/types.js";
import { readAgent } from "./claude-code/agent.js";
import { readMcpServer } from "./claude-code/mcp-server.js";
import { readRule } from "./claude-code/rule.js";
import { readCodexAgent } from "./codex/agent.js";
import { mergeChange } from "./merge.js";
import { readSkill } from "./skill.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const text = (files: readonly PackageFile[], path: string) =>
  decoder.decode(files.find((f) => f.path === path)?.bytes);
const file = (path: string, content: string): PackageFile => ({
  path,
  bytes: encoder.encode(content),
});

/** An example item as a proposal's base: its files, with `version` out of ronne.yaml. */
const base = (name: string) => loadItemDir(`${examplesDir}${name}`);
const renderedFile = (change: Change | undefined) => {
  if (change?.kind !== "file") throw new Error("not a file");
  return typeof change.content === "string" ? change.content : decoder.decode(change.content);
};

describe("mergeChange", () => {
  const agent = () => {
    const b = base("code-reviewer");
    const [change] = claudeCodeRenderer.render(b, { scope: "project" }).changes;
    const installed = renderedFile(change).replace(MARKER, "");
    const r = readAgent(file("code-reviewer.md", installed), {
      itemName: "@examples/code-reviewer",
    });
    return { b, installed, r };
  };

  it("takes an agent's edits and keeps what the round trip loses", () => {
    const { b, installed, r } = agent();
    const edited = installed
      .replace(/description: .*/, "description: Reviews diffs, and says why.")
      .replace(/\n\n([^\n]+)/, "\n\nAlways say why.\n\n$1");
    const l = readAgent(file("code-reviewer.md", edited), { itemName: "@examples/code-reviewer" });
    const merged = mergeChange({ type: "agent", base: b.files, rendered: r, local: l });
    expect(merged.unchanged).toBe(false);
    expect(merged.changes).toEqual({
      added: [],
      removed: [],
      changed: ["prompt.md"],
      fields: [
        {
          field: "description",
          from: b.manifest.description,
          to: "Reviews diffs, and says why.",
        },
      ],
    });
    // Unchanged locally, so the base's: keywords, license, dependencies, targets, tools, model.
    expect(merged.manifest).toMatchObject({
      name: "@examples/code-reviewer",
      keywords: ["review", "security"],
      license: "MIT",
      dependencies: b.manifest.dependencies,
      targets: { cursor: { enabled: false } },
      agent: {
        prompt: "prompt.md",
        tools: ["read", "grep", "glob", "shell", "mcp:github-mcp"],
        model: "strong",
      },
    });
    expect(merged.manifestText).not.toContain("version");
    expect(text(merged.files, "prompt.md")).toContain("Always say why.");
    expect(checkPackage(merged.manifest, merged.files)).toEqual([]);
  });

  it("sets a changed list whole, and removes a field the local copy dropped", () => {
    const { b, installed, r } = agent();
    const edited = installed.replace(/tools: .*/, "tools: Read, Grep").replace(/model: .*\n/, "");
    const l = readAgent(file("code-reviewer.md", edited), { itemName: "@examples/code-reviewer" });
    const merged = mergeChange({ type: "agent", base: b.files, rendered: r, local: l });
    expect(merged.manifest.agent).toEqual({ prompt: "prompt.md", tools: ["read", "grep"] });
    expect(merged.changes.fields.map((f) => f.field)).toEqual(["agent.tools", "agent.model"]);
  });

  it("says unchanged when the local copy is the install, and gives back the base", () => {
    const { b, r } = agent();
    const merged = mergeChange({ type: "agent", base: b.files, rendered: r, local: r });
    expect(merged.unchanged).toBe(true);
    expect(merged.files.map((f) => [f.path, decoder.decode(f.bytes)])).toEqual(
      b.files
        .map((f) => [f.path, decoder.decode(f.bytes)] as const)
        .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    );
  });

  it("merges a skill by file: added, removed and changed", () => {
    const b = base("secure-coding");
    const [dir] = claudeCodeRenderer.render(b, { scope: "project" }).changes as Extract<
      Change,
      { kind: "dir" }
    >[];
    const folder = (dir?.files ?? []).map((f) => ({
      path: f.path,
      bytes: typeof f.content === "string" ? encoder.encode(f.content) : f.content,
    }));
    const r = readSkill(folder, { itemName: "@examples/secure-coding" });
    const local = [
      ...folder.filter((f) => f.path !== "checklist.md"),
      file("notes.md", "Notes.\n"),
    ].map((f) =>
      f.path === "SKILL.md" ? file("SKILL.md", `${decoder.decode(f.bytes)}Also check logs.\n`) : f,
    );
    const l = readSkill(local, { itemName: "@examples/secure-coding" });
    const merged = mergeChange({ type: "skill", base: b.files, rendered: r, local: l });
    expect(merged.changes).toMatchObject({
      added: ["notes.md"],
      removed: ["checklist.md"],
      changed: ["SKILL.md"],
      fields: [],
    });
    expect(merged.manifest).toMatchObject({ keywords: ["security", "review"], license: "MIT" });
  });

  it("keeps a Codex agent's tools, which Codex can't express", () => {
    const b = base("code-reviewer");
    const [change] = codexRenderer.render(b, { scope: "project" }).changes;
    const installed = renderedFile(change);
    const read = (toml: string) =>
      readCodexAgent(parseToml(toml), {
        itemName: "@examples/code-reviewer",
        fileName: "code-reviewer.toml",
      });
    // The Codex renderer writes the instructions as a ''' multi-line literal string.
    const edited = installed.replace(
      "developer_instructions = '''",
      "developer_instructions = '''\nBe brief.",
    );
    const merged = mergeChange({
      type: "agent",
      base: b.files,
      rendered: read(installed),
      local: read(edited),
    });
    expect(merged.changes.changed).toEqual(["prompt.md"]);
    expect(merged.manifest.agent).toMatchObject({
      tools: ["read", "grep", "glob", "shell", "mcp:github-mcp"],
      model: "strong",
    });
  });

  it("takes an MCP server's changed address and keeps the base's variable descriptions", () => {
    const b = base("github-mcp");
    const [change] = claudeCodeRenderer.render(b, { scope: "project" }).changes as Extract<
      Change,
      { kind: "json-key" }
    >[];
    const value = change?.value as Record<string, unknown>;
    const read = (v: unknown) =>
      readMcpServer("github-mcp", v, {
        itemName: "@examples/github-mcp",
        description: String(b.manifest.description),
      });
    const merged = mergeChange({
      type: "mcp-server",
      base: b.files,
      rendered: read(value),
      local: read({ ...value, url: "https://api.github.example/mcp/" }),
    });
    expect(merged.changes.fields.map((f) => f.field)).toEqual(["mcp-server.url"]);
    expect(merged.manifest["mcp-server"]).toMatchObject({
      url: "https://api.github.example/mcp/",
      env: [
        { name: "GITHUB_TOKEN", description: expect.stringContaining("personal access token") },
      ],
    });
  });

  it("takes a rule's changed globs", () => {
    const b = base("house-style");
    const [change] = claudeCodeRenderer.render(b, { scope: "project" }).changes;
    const installed = renderedFile(change).replace(MARKER, "");
    const read = (t: string) =>
      readRule(file("house-style.md", t), { itemName: "@examples/house-style" });
    const merged = mergeChange({
      type: "rule",
      base: b.files,
      rendered: read(installed),
      local: read(installed.replace('"**/*.tsx"', '"src/**/*.tsx"')),
    });
    expect(merged.manifest.rule).toMatchObject({ globs: ["**/*.ts", "src/**/*.tsx"] });
    expect(merged.manifest.description).toBe(b.manifest.description);
  });
});
