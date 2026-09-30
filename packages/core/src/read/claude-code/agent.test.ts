import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { claudeCodeRenderer } from "../../render/claude-code/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { agentName, readAgent } from "./agent.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, content: string): PackageFile => ({
  path,
  bytes: encoder.encode(content),
});
const MARKER = /<!-- managed by rmk: [^>]+ -->\n/;

/** An item rendered for Claude Code: the one file it writes, and its text. */
const rendered = (item: ReturnType<typeof loadItemDir>) => {
  const [change] = claudeCodeRenderer.render(item, { scope: "project" }).changes as Extract<
    Change,
    { kind: "file" }
  >[];
  if (!change) throw new Error("nothing rendered");
  return {
    path: change.path,
    text: typeof change.content === "string" ? change.content : decoder.decode(change.content),
  };
};

describe("readAgent", () => {
  it("reads the example agent's rendered file back into an item that renders the same file", () => {
    const original = rendered(loadItemDir(`${examplesDir}code-reviewer`));
    // As the person would have it: the same file, without rmk's marker.
    const read = readAgent(file("code-reviewer.md", original.text.replace(MARKER, "")), {
      itemName: "@examples/code-reviewer",
    });
    expect(read.warnings).toEqual([]);
    expect(read.references).toEqual([{ kind: "mcp-server", name: "github-mcp", from: "tools" }]);
    expect(read.manifest).toEqual({
      name: "@examples/code-reviewer",
      type: "agent",
      description: expect.stringMatching(/^Reviews diffs/),
      agent: {
        prompt: "prompt.md",
        tools: ["read", "grep", "glob", "shell", "mcp:github-mcp"],
        model: "strong",
      },
    });
    const { manifest, issues } = parseManifest(read.manifestText);
    expect(issues).toEqual([]);
    expect(checkPackage(manifest ?? {}, read.files)).toEqual([]);

    const again = rendered({
      name: "@examples/code-reviewer",
      version: "1.0.0",
      manifest: { ...read.manifest, version: "1.0.0" },
      files: read.files,
    });
    expect(again).toEqual(original);
  });

  it("drops each field the manifest can't carry, with one warning naming it", () => {
    const read = readAgent(
      file(
        "a.md",
        "---\nname: helper\ndescription: Helps.\npermissionMode: plan\ncolor: blue\nhooks:\n  Stop: []\nmaxTurns: 5\n---\nHelp.\n",
      ),
      { itemName: "@team/helper" },
    );
    expect(read.warnings.map((w) => [w.code, w.message.match(/`(\w+)`/)?.[1]])).toEqual([
      ["field_dropped", "permissionMode"],
      ["field_dropped", "color"],
      ["field_dropped", "hooks"],
      ["field_dropped", "maxTurns"],
    ]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
  });

  it("reads tools as a string or a list, drops the unnamed ones, and has none when none are given", () => {
    const tools = (value: string) =>
      readAgent(file("a.md", `---\nname: a\ndescription: A.\n${value}---\nBody.\n`), {
        itemName: "@team/a",
      });
    const fromString = tools("tools: Read, Grep, Skill, mcp__github__search_code\n");
    expect(fromString.manifest.agent).toMatchObject({
      tools: ["read", "grep", "mcp:github/search_code"],
    });
    expect(fromString.warnings.map((w) => w.code)).toEqual(["tool_dropped"]);
    expect(fromString.warnings[0]?.message).toContain("`Skill`");
    expect(fromString.references).toEqual([{ kind: "mcp-server", name: "github", from: "tools" }]);
    expect(tools("tools: [Bash, WebFetch]\n").manifest.agent).toMatchObject({
      tools: ["shell", "web-fetch"],
    });
    expect(tools("").manifest.agent).toEqual({ prompt: "prompt.md" });
  });

  it("reads haiku and opus, as aliases or full ids, and anything else as default with a warning", () => {
    const model = (value: string) =>
      readAgent(file("a.md", `---\nname: a\ndescription: A.\nmodel: ${value}\n---\nB.\n`), {
        itemName: "@team/a",
      });
    expect(model("haiku").manifest.agent).toMatchObject({ model: "fast" });
    expect(model("claude-opus-5-5").manifest.agent).toMatchObject({ model: "strong" });
    for (const other of ["sonnet", "inherit", "claude-sonnet-5"]) {
      const read = model(other);
      expect(read.manifest.agent).not.toHaveProperty("model");
      expect(read.warnings.map((w) => w.code)).toEqual(["model_default"]);
    }
  });

  it("collects skills and MCP servers as references, and names the agent by its name", () => {
    const text =
      "---\nname: Deploy Helper\ndescription: Deploys.\nskills: [deploy-check]\nmcpServers: [aws, {inline: {command: x}}]\n---\nGo.\n";
    const read = readAgent(file("whatever.md", text), { itemName: "@team/deploy-helper" });
    expect(read.references).toEqual([
      { kind: "skill", name: "deploy-check", from: "skills" },
      { kind: "mcp-server", name: "aws", from: "mcpServers" },
    ]);
    expect(read.warnings.map((w) => w.code)).toEqual([
      "name_changed",
      "field_dropped",
      "field_dropped",
    ]);
    expect(agentName(file("whatever.md", text), "whatever.md")).toBe("deploy-helper");
    expect(agentName(file("x.md", "---\ndescription: D.\n---\n"), "Code Review.md")).toBe(
      "code-review",
    );
  });

  it("arrives with the checks' issue when there's no description", () => {
    const read = readAgent(file("a.md", "---\nname: a\n---\nBody.\n"), { itemName: "@team/a" });
    expect(read.manifest).not.toHaveProperty("description");
    expect(parseManifest(read.manifestText).issues.map((i) => i.path)).toContain("/description");
  });
});
