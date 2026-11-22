import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { copilotRenderer } from "../../render/copilot/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change, RenderInput } from "../../render/types.js";
import { copilotAgentName, readCopilotAgent } from "./agent.js";
import { readCopilotMcpServer } from "./mcp-server.js";
import { readCopilotRule } from "./rule.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, text: string): PackageFile => ({ path, bytes: encoder.encode(text) });
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const render = (item: RenderInput) => copilotRenderer.render(item, { scope: "project" }).changes;
const readBack = (
  name: string,
  read: { manifest: Record<string, unknown>; files: PackageFile[] },
) =>
  render({
    name,
    version: "1.0.0",
    manifest: { ...read.manifest, version: "1.0.0" },
    files: read.files,
  });
const textOfChange = (change: Change | undefined) =>
  change && change.kind === "file"
    ? typeof change.content === "string"
      ? change.content
      : decoder.decode(change.content)
    : "";

describe("readCopilotAgent", () => {
  it("reads the example agent rendered for Copilot back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}code-reviewer`);
    const [change] = render(example);
    const read = readCopilotAgent(
      file("code-reviewer.agent.md", textOfChange(change).replace(MARKER, "")),
      { itemName: "@examples/code-reviewer" },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["read", "grep", "glob", "shell", "mcp:github-mcp"],
    });
    expect(read.references).toEqual([{ kind: "mcp-server", name: "github-mcp", from: "tools" }]);
    expect(read.warnings.map((w) => w.message)).toEqual([
      "Copilot's `search` stands for `grep` and `glob`, so the agent gets all of them.",
    ]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(readBack("@examples/code-reviewer", read)).toEqual([change]);
  });

  it("reads every alias, a server's own tool, a model as an override, and drops the rest", () => {
    const read = readCopilotAgent(
      file(
        "a.agent.md",
        "---\nname: auditor\ndescription: Audits.\ntools: ['read', 'edit', 'execute', 'web', 'gh/create_issue', 'todo']\nmodel: claude-sonnet-4.6\ntarget: vscode\n---\nAudit.\n",
      ),
      { itemName: "@team/auditor" },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["read", "edit", "write", "shell", "web-fetch", "web-search", "mcp:gh/create_issue"],
    });
    expect(read.manifest.targets).toEqual({
      copilot: { overrides: { model: "claude-sonnet-4.6" } },
    });
    expect(read.warnings.map((w) => w.code)).toEqual([
      "field_dropped",
      "field_dropped",
      "field_dropped",
      "tool_dropped",
    ]);
    expect(read.warnings[0]?.message).toContain("`target`");
    expect(
      copilotAgentName(file("x.agent.md", "---\ndescription: D.\n---\n"), "Code Review.agent.md"),
    ).toBe("code-review");
    expect(copilotAgentName(file("x.md", "---\nname: Planner\n---\n"), "x.md")).toBe("planner");
  });
});

describe("readCopilotRule", () => {
  it("reads the example rule rendered for Copilot and renders the same file", () => {
    const [change] = render(loadItemDir(`${examplesDir}house-style`));
    const read = readCopilotRule(
      file("house-style.instructions.md", textOfChange(change).replace(MARKER, "")),
      { itemName: "@examples/house-style" },
    );
    expect(read.manifest.rule).toEqual({
      body: "rule.md",
      activation: "glob",
      globs: ["**/*.ts", "**/*.tsx"],
    });
    expect(read.warnings).toEqual([]);
    const { description: _d, ...manifest } = read.manifest;
    expect(
      readBack("@examples/house-style", {
        ...read,
        manifest: { ...manifest, description: "TypeScript conventions for this codebase." },
      }),
    ).toEqual([change]);
  });

  it("reads `**` as always, no applyTo as manual, and drops what a rule can't carry", () => {
    const always = readCopilotRule(
      file("a.instructions.md", '---\napplyTo: "**"\nexcludeAgent: code-review\n---\nAlways.\n'),
      { itemName: "@team/a" },
    );
    expect(always.manifest.rule).toEqual({ body: "rule.md", activation: "always" });
    expect(always.warnings.map((w) => w.message)).toEqual([
      "a.instructions.md's `excludeAgent` was left out: a rule in Ronne has no such setting.",
    ]);
    const manual = readCopilotRule(file("m.instructions.md", "By hand.\n"), {
      itemName: "@team/m",
    });
    expect(manual.manifest.rule).toEqual({ body: "rule.md", activation: "manual" });
    expect(manual.descriptionSource).toBe("body");
  });
});

describe("readCopilotMcpServer", () => {
  it("reads a server as Copilot writes it, `local` as stdio and `tools` left out", () => {
    const read = readCopilotMcpServer(
      "gh",
      {
        type: "local",
        command: "npx",
        args: ["-y", "server"],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Copilot's own reference syntax
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        tools: ["*"],
      },
      { itemName: "@team/gh" },
    );
    expect(read.manifest["mcp-server"]).toMatchObject({
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      env: [expect.objectContaining({ name: "GITHUB_TOKEN" })],
    });
    expect(read.warnings.filter((w) => w.message.includes("tools"))).toEqual([]);
    const picked = readCopilotMcpServer(
      "gh",
      { type: "http", url: "https://x.example/mcp", tools: ["search"] },
      { itemName: "@team/gh" },
    );
    expect(picked.warnings[0]?.message).toContain("only some of its tools");
  });

  it("reads the example server rendered for Copilot back into the same key", () => {
    const [change] = render(loadItemDir(`${examplesDir}github-mcp`));
    const value = change?.kind === "json-key" ? change.value : null;
    const read = readCopilotMcpServer("github-mcp", value, {
      itemName: "@examples/github-mcp",
      description: "Connects to GitHub's MCP server for issues, pull requests and code search.",
    });
    expect(readBack("@examples/github-mcp", read)).toEqual([change]);
  });
});
