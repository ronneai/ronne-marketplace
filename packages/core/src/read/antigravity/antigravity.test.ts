import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { antigravityRenderer } from "../../render/antigravity/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change, RenderInput } from "../../render/types.js";
import { antigravityAgentName, readAntigravityAgent } from "./agent.js";
import { readAntigravityMcpServer } from "./mcp-server.js";
import { readAntigravityRule } from "./rule.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, text: string): PackageFile => ({ path, bytes: encoder.encode(text) });
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const render = (item: RenderInput) =>
  antigravityRenderer.render(item, { scope: "project" }).changes;
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

describe("readAntigravityAgent", () => {
  it("reads the example agent rendered for Antigravity back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}code-reviewer`);
    const [change] = render(example);
    const read = readAntigravityAgent(
      file("code-reviewer.md", textOfChange(change).replace(MARKER, "")),
      { itemName: "@examples/code-reviewer" },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["read", "grep", "glob", "shell"],
      model: "strong",
    });
    expect(read.warnings).toEqual([]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(readBack("@examples/code-reviewer", read)).toEqual([change]);
  });

  it("reads the CLI's and the app's tool names, models, and drops the rest", () => {
    const read = readAntigravityAgent(
      file(
        "a.md",
        "---\nname: helper\ndescription: Helps.\ntools: [read_file, view_file, edit_file, write_to_file, run_command, read_url_content, search_web, ask_question]\nmodel: gemini-3-pro\nmainAgent: false\n---\nHelp.\n",
      ),
      { itemName: "@me/helper" },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["read", "edit", "write", "shell", "web-fetch", "web-search"],
    });
    expect(read.manifest.targets).toEqual({
      antigravity: { overrides: { model: "gemini-3-pro" } },
    });
    expect(read.warnings.map((w) => w.code).sort()).toEqual(["field_dropped", "tool_dropped"]);
    const flash = readAntigravityAgent(
      file("f.md", "---\ndescription: F.\nmodel: flash\n---\nF.\n"),
      {
        itemName: "@me/f",
      },
    );
    expect(flash.manifest.agent).toEqual({ prompt: "prompt.md", model: "fast" });
    const inherit = readAntigravityAgent(
      file("i.md", "---\ndescription: I.\nmodel: inherit\n---\nI.\n"),
      { itemName: "@me/i" },
    );
    expect(inherit.manifest.targets).toBeUndefined();
  });

  it("names an agent by its name, its file, or its folder for agent.md", () => {
    expect(antigravityAgentName(file("x.md", "---\nname: Code Helper\n---\n"), "x.md")).toBe(
      "code-helper",
    );
    expect(antigravityAgentName(file("reviewer.md", "Hi.\n"), "reviewer.md")).toBe("reviewer");
    expect(antigravityAgentName(file(".agents/agents/fixer/agent.md", "Hi.\n"), "agent.md")).toBe(
      "fixer",
    );
  });
});

describe("readAntigravityRule", () => {
  it("reads each trigger the renderer writes back into the same rule", () => {
    for (const block of [
      { body: "rule.md", activation: "always" },
      { body: "rule.md", activation: "glob", globs: ["**/*.ts", "**/*.tsx"] },
      { body: "rule.md", activation: "model" },
    ]) {
      const example = loadItemDir(`${examplesDir}house-style`);
      const item = { ...example, manifest: { ...example.manifest, rule: block } };
      const [change] = render(item);
      const read = readAntigravityRule(
        file("house-style.md", textOfChange(change).replace(MARKER, "")),
        { itemName: "@examples/house-style" },
      );
      expect(read.manifest.rule).toEqual(block);
      expect(read.warnings).toEqual([]);
      expect(readBack("@examples/house-style", read)).toEqual([change]);
    }
  });

  it("reads manual, and a missing or unknown trigger as manual with a warning", () => {
    const manual = readAntigravityRule(
      file("m.md", "---\ntrigger: manual\ndescription: M.\n---\nM.\n"),
      {
        itemName: "@me/m",
      },
    );
    expect(manual.manifest.rule).toEqual({ body: "rule.md", activation: "manual" });
    for (const head of ["---\ndescription: X.\n---\n", "---\ntrigger: alwaysOn\n---\n"]) {
      const read = readAntigravityRule(file("x.md", `${head}X.\n`), { itemName: "@me/x" });
      expect(read.manifest.rule).toEqual({ body: "rule.md", activation: "manual" });
      expect(read.warnings[0]?.message).toContain("Antigravity doesn't load it");
    }
    const one = readAntigravityRule(file("g.md", "---\ntrigger: glob\nglob: '*.py'\n---\nG.\n"), {
      itemName: "@me/g",
    });
    expect(one.manifest.rule).toEqual({ body: "rule.md", activation: "glob", globs: ["*.py"] });
  });
});

describe("readAntigravityMcpServer", () => {
  it("reads serverUrl as http and a stdio server, keeping every env value out", () => {
    const http = readAntigravityMcpServer(
      "github-mcp",
      { serverUrl: "https://api.githubcopilot.com/mcp/" },
      { itemName: "@examples/github-mcp" },
    );
    expect(http.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
    });
    const stdio = readAntigravityMcpServer(
      "db",
      {
        command: "npx",
        args: ["-y", "db"],
        env: { DB_TOKEN: "sk-live-abcdefghijklmnop1234" },
        cwd: "/x",
      },
      { itemName: "@me/db" },
    );
    expect(stdio.manifest["mcp-server"]).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "db"],
      env: [{ name: "DB_TOKEN", required: true, secret: true }],
    });
    expect(JSON.stringify(stdio)).not.toContain("sk-live");
    expect(stdio.warnings.map((w) => w.message).join("\n")).toContain("`cwd` was left out");
  });
});
