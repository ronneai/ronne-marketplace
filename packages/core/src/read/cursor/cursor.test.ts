import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { cursorRenderer } from "../../render/cursor/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change, RenderInput } from "../../render/types.js";
import { cursorAgentName, readCursorAgent } from "./agent.js";
import { cursorCommandName, readCursorCommand } from "./command.js";
import { readCursorMcpServer } from "./mcp-server.js";
import { readCursorRule } from "./rule.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, text: string): PackageFile => ({ path, bytes: encoder.encode(text) });
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const render = (item: RenderInput) => cursorRenderer.render(item, { scope: "project" }).changes;
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

describe("readCursorAgent", () => {
  it("reads the example agent rendered for Cursor back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}code-reviewer`);
    // The example turns Cursor off; without that, it renders.
    const { targets: _off, ...manifest } = example.manifest;
    const [change] = render({ ...example, manifest });
    const read = readCursorAgent(
      file("code-reviewer.md", textOfChange(change).replace(MARKER, "")),
      {
        itemName: "@examples/code-reviewer",
      },
    );
    expect(read.warnings).toEqual([]);
    expect(read.manifest.agent).toEqual({ prompt: "prompt.md" });
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(readBack("@examples/code-reviewer", read)).toEqual([change]);
  });

  it("reads readonly as tools that change nothing, keeps a model as an override, and drops the rest", () => {
    const read = readCursorAgent(
      file(
        "a.md",
        "---\nname: auditor\ndescription: Audits.\nmodel: gpt-5\nreadonly: true\nis_background: true\n---\nAudit.\n",
      ),
      { itemName: "@team/auditor" },
    );
    expect(read.manifest.agent).toEqual({ prompt: "prompt.md", tools: ["read", "grep", "glob"] });
    expect(read.manifest.targets).toEqual({ cursor: { overrides: { model: "gpt-5" } } });
    expect(read.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual(["is_background"]);
    const inherit = readCursorAgent(
      file("b.md", "---\nname: b\ndescription: B.\nmodel: inherit\n---\nB.\n"),
      {
        itemName: "@team/b",
      },
    );
    expect(inherit.manifest.targets).toBeUndefined();
    expect(cursorAgentName(file("x.md", "---\ndescription: D.\n---\n"), "Code Review.md")).toBe(
      "code-review",
    );
  });
});

describe("readCursorRule", () => {
  it("reads the example rule rendered for Cursor, unquoted globs and all, and renders the same file", () => {
    const [change] = render(loadItemDir(`${examplesDir}house-style`));
    expect(textOfChange(change)).toContain("globs: **/*.ts, **/*.tsx");
    const read = readCursorRule(file("house-style.mdc", textOfChange(change).replace(MARKER, "")), {
      itemName: "@examples/house-style",
    });
    expect(read.warnings).toEqual([]);
    expect(read.manifest.rule).toEqual({
      body: "rule.md",
      activation: "glob",
      globs: ["**/*.ts", "**/*.tsx"],
    });
    expect(parseManifest(read.manifestText).issues).toEqual([]);
    expect(readBack("@examples/house-style", read)).toEqual([change]);
  });

  it("reads each activation from alwaysApply, globs and description", () => {
    const rule = (front: string) =>
      readCursorRule(file("r.mdc", `---\n${front}---\n# The rule\n\nDo it.\n`), {
        itemName: "@team/r",
      });
    expect(rule("alwaysApply: true\n").manifest.rule).toEqual({
      body: "rule.md",
      activation: "always",
    });
    const both = rule("globs: src/**\nalwaysApply: true\n");
    expect(both.manifest.rule).toMatchObject({ activation: "always" });
    expect(both.warnings[0]?.message).toContain("globs were left out");
    expect(rule('globs:\n  - src/**\n  - "lib/**"\nalwaysApply: false\n').manifest.rule).toEqual({
      body: "rule.md",
      activation: "glob",
      globs: ["src/**", "lib/**"],
    });
    const model = rule("description: When writing SQL.\nalwaysApply: false\n");
    expect(model.manifest).toMatchObject({
      description: "When writing SQL.",
      rule: { activation: "model" },
    });
    const manual = rule("alwaysApply: false\n");
    expect(manual.manifest).toMatchObject({
      description: "The rule",
      rule: { activation: "manual" },
    });
    expect(manual.warnings).toEqual([]);
    for (const read of [model, manual]) expect(checkPackage(read.manifest, read.files)).toEqual([]);
  });
});

describe("readCursorCommand", () => {
  it("reads the body, the frontmatter's name and description, or the first line and the path", () => {
    const read = readCursorCommand(
      file("deploy.md", "---\nname: deploy-staging\ndescription: Deploys.\n---\nDeploy it.\n"),
      {
        itemName: "@team/deploy-staging",
      },
    );
    expect(read.manifest).toMatchObject({
      description: "Deploys.",
      command: { body: "command.md" },
    });
    expect(read.warnings).toEqual([]);
    const bare = readCursorCommand(file("lint.txt", "Run the linter and fix what it finds.\n"), {
      itemName: "@team/lint",
    });
    expect(bare.manifest.description).toBe("Run the linter and fix what it finds.");
    expect(cursorCommandName(file("x.md", "---\nname: Ship It\n---\n"), "x.md")).toBe("ship-it");
    expect(cursorCommandName(file("c.mdc", "Go."), "release/cut.mdc")).toBe("release-cut");
    expect(checkPackage(bare.manifest, bare.files)).toEqual([]);
  });
});

describe("readCursorMcpServer", () => {
  const SECRETS = { env: `sk-ant-${"a1B2c3D4".repeat(4)}`, header: `ghp_${"a1B2".repeat(9)}` };
  const everything = (read: ReturnType<typeof readCursorMcpServer>) =>
    JSON.stringify({ ...read, files: read.files.map((f) => decoder.decode(f.bytes)) });

  it("reads the example server rendered for Cursor back into an item that renders the same entry", () => {
    const example = loadItemDir(`${examplesDir}github-mcp`);
    const [change] = render(example) as Extract<Change, { kind: "json-key" }>[];
    const read = readCursorMcpServer("github-mcp", change?.value, {
      itemName: "@examples/github-mcp",
      description: String(example.manifest.description),
    });
    expect(read.warnings).toEqual([]);
    expect(read.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
      env: [{ name: "GITHUB_TOKEN", required: true, secret: true }],
    });
    expect(readBack("@examples/github-mcp", read)).toEqual([change]);
  });

  it("reads ${env:NAME} as ${NAME}, keeps Cursor's own variables with a warning, and no value", () => {
    const read = readCursorMcpServer(
      "tools",
      {
        type: "stdio",
        command: "${userHome}/bin/tools",
        args: ["--token", SECRETS.header],
        env: { API_KEY: SECRETS.env, REGION: "${env:REGION}" },
        envFile: ".env.tools",
      },
      { itemName: "@team/tools" },
    );
    expect(read.manifest["mcp-server"]).toEqual({
      transport: "stdio",
      command: "${userHome}/bin/tools",
      args: ["--token", "${TOOLS_TOKEN}"],
      env: [
        { name: "API_KEY", required: true, secret: true },
        { name: "REGION", required: true },
        { name: "TOOLS_TOKEN", required: true, secret: true },
      ],
    });
    expect(read.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining("Cursor's ${userHome}"),
      expect.stringContaining("A credential in .cursor/mcp.json mcpServers.tools.args[1]"),
      expect.stringContaining("`envFile` was left out"),
    ]);
    for (const secret of Object.values(SECRETS)) expect(everything(read)).not.toContain(secret);
  });

  it("reads a remote server as http, and drops auth", () => {
    const read = readCursorMcpServer(
      "remote",
      {
        url: "https://r.example/sse",
        headers: { "X-Key": "${env:REMOTE_KEY}" },
        auth: { CLIENT_ID: "x" },
      },
      { itemName: "@team/remote", description: "Remote." },
    );
    expect(read.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://r.example/sse",
      headers: { "X-Key": "${REMOTE_KEY}" },
      env: [{ name: "REMOTE_KEY", required: true, secret: true }],
    });
    expect(read.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual(["auth"]);
    expect(() => readCursorMcpServer("x", "nope", { itemName: "@team/x" })).toThrow();
  });
});
