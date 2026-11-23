import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { geminiRenderer } from "../../render/gemini/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change, RenderInput } from "../../render/types.js";
import { geminiAgentName, readGeminiAgent } from "./agent.js";
import { geminiCommandName, readGeminiCommand } from "./command.js";
import { readGeminiMcpServer } from "./mcp-server.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, text: string): PackageFile => ({ path, bytes: encoder.encode(text) });
const MARKER = /<!-- managed by rmk: [^>]+ -->\n\n?/;
const render = (item: RenderInput) => geminiRenderer.render(item, { scope: "project" }).changes;
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

describe("readGeminiAgent", () => {
  it("reads the example agent rendered for Gemini CLI back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}code-reviewer`);
    const [change] = render(example);
    const read = readGeminiAgent(
      file("code-reviewer.md", textOfChange(change).replace(MARKER, "")),
      {
        itemName: "@examples/code-reviewer",
      },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["read", "grep", "glob", "shell", "mcp:github-mcp"],
    });
    expect(read.references).toEqual([{ kind: "mcp-server", name: "github-mcp", from: "tools" }]);
    expect(read.warnings).toEqual([]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(readBack("@examples/code-reviewer", read)).toEqual([change]);
  });

  it("reads MCP tools, a model as an override, drops the rest, and refuses a remote agent", () => {
    const read = readGeminiAgent(
      file(
        "a.md",
        "---\nname: helper\ndescription: Helps.\ntools: [replace, write_file, web_fetch, google_web_search, mcp_gh_create_issue, write_todos]\nmodel: gemini-3-pro\ntemperature: 0.2\n---\nHelp.\n",
      ),
      { itemName: "@me/helper" },
    );
    expect(read.manifest.agent).toEqual({
      prompt: "prompt.md",
      tools: ["edit", "write", "web-fetch", "web-search", "mcp:gh/create_issue"],
    });
    expect(read.manifest.targets).toEqual({ gemini: { overrides: { model: "gemini-3-pro" } } });
    expect(read.warnings.map((w) => w.code).sort()).toEqual(["field_dropped", "tool_dropped"]);
    expect(() =>
      readGeminiAgent(
        file("r.md", "---\nname: r\nkind: remote\nagent_card_url: https://x\n---\n"),
        {
          itemName: "@me/r",
        },
      ),
    ).toThrow("remote agent");
    expect(geminiAgentName(file("x.md", "Hi.\n"), "x.md")).toBe("x");
  });
});

describe("readGeminiCommand", () => {
  it("reads the example command rendered for Gemini CLI back into an item that renders the same file", () => {
    const example = loadItemDir(`${examplesDir}review-diff`);
    const [change] = render(example);
    const read = readGeminiCommand(file("review-diff.toml", textOfChange(change)), {
      itemName: "@examples/review-diff",
    });
    expect(read.manifest.command).toEqual({
      body: "command.md",
      args: [{ name: "args", required: false }],
    });
    expect(read.manifest.description).toBe(example.manifest.description);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(textOfChange(readBack("@examples/review-diff", read)[0])).toBe(textOfChange(change));
  });

  it("names a namespaced command, warns about injections, and refuses bad TOML", () => {
    expect(geminiCommandName("git/commit.toml")).toBe("git-commit");
    const read = readGeminiCommand(
      file("s.toml", 'prompt = "Status: !{git status}"\nname = "x"\n'),
      {
        itemName: "@me/s",
      },
    );
    expect(read.manifest.command).toEqual({ body: "command.md" });
    expect(read.warnings.map((w) => w.message).join("\n")).toMatch(/`name` was left out[\s\S]*!\{/);
    expect(() => readGeminiCommand(file("b.toml", "prompt = "), { itemName: "@me/b" })).toThrow(
      "isn't valid TOML",
    );
    expect(() =>
      readGeminiCommand(file("n.toml", 'description = "x"\n'), { itemName: "@me/n" }),
    ).toThrow("no prompt");
  });
});

describe("readGeminiMcpServer", () => {
  it("reads httpUrl, url as SSE with a warning, and $NAME as a reference, keeping values out", () => {
    const http = readGeminiMcpServer(
      "github-mcp",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Gemini CLI's reference syntax
      {
        httpUrl: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
      },
      { itemName: "@examples/github-mcp" },
    );
    expect(http.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
      headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
      env: [{ name: "GITHUB_TOKEN", required: true, secret: true }],
    });
    const sse = readGeminiMcpServer("s", { url: "https://x.example/sse" }, { itemName: "@me/s" });
    expect(sse.warnings[0]?.message).toContain("SSE");
    const stdio = readGeminiMcpServer(
      "db",
      {
        command: "npx",
        env: { API_KEY: "$API_KEY", PLAIN: "sk-live-abcdefghijklmnop1234" },
        trust: true,
      },
      { itemName: "@me/db" },
    );
    expect(stdio.manifest["mcp-server"]).toMatchObject({
      transport: "stdio",
      env: [
        { name: "API_KEY", required: true, secret: true },
        { name: "PLAIN", required: true, secret: true },
      ],
    });
    expect(JSON.stringify(stdio)).not.toContain("sk-live");
    expect(stdio.warnings.map((w) => w.message).join("\n")).toContain("`trust` was left out");
  });

  it("never uploads a literal mixed with a variable in a credential", () => {
    const read = readGeminiMcpServer(
      "glit",
      {
        httpUrl: "https://g.example/$TENANT/mcp",
        headers: { "X-Api-Key": "s3cr3tP4ss$Word", Authorization: "Bearer hunter2hunter2$X" },
      },
      { itemName: "@me/glit" },
    );
    const text = JSON.stringify(read);
    expect(text).not.toContain("s3cr3t");
    expect(text).not.toContain("hunter2");
    const block = read.manifest["mcp-server"] as Record<string, unknown>;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
    expect(block.url).toBe("https://g.example/${TENANT}/mcp");
    expect(block.headers).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
      "X-Api-Key": "${GLIT_TOKEN}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
      Authorization: "Bearer ${GLIT_TOKEN_2}",
    });
    expect((block.env as { name: string }[]).map((e) => e.name)).toEqual(
      expect.arrayContaining(["TENANT", "GLIT_TOKEN", "GLIT_TOKEN_2"]),
    );
  });

  it("reads $NAME in a command and its arguments as ${NAME}, and type http with url as plain http", () => {
    const stdio = readGeminiMcpServer(
      "s",
      { command: "$HOME/bin/srv", args: ["--region", "$REGION"] },
      { itemName: "@me/s" },
    );
    expect(stdio.manifest["mcp-server"]).toMatchObject({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
      command: "${HOME}/bin/srv",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the manifest's syntax
      args: ["--region", "${REGION}"],
    });
    const http = readGeminiMcpServer(
      "h",
      { url: "https://h.example", type: "http" },
      { itemName: "@me/h" },
    );
    expect(http.manifest["mcp-server"]).toEqual({ transport: "http", url: "https://h.example" });
    expect(http.warnings).toEqual([]);
    const sse = readGeminiMcpServer(
      "e",
      { url: "https://e.example", type: "sse" },
      { itemName: "@me/e" },
    );
    expect(sse.manifest["mcp-server"]).toMatchObject({ transport: "http" });
    expect(sse.warnings[0]?.message).toContain("SSE");
  });

  it("declares a variable referenced with a default", () => {
    const read = readGeminiMcpServer(
      "d",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      { httpUrl: "https://d.example", headers: { "X-Api-Key": "${D_KEY:-hunter2hunter2}" } },
      { itemName: "@me/d" },
    );
    expect(JSON.stringify(read)).not.toContain("hunter2");
    expect(
      (read.manifest["mcp-server"] as { env: { name: string }[] }).env.map((e) => e.name),
    ).toContain("D_KEY");
  });
});
