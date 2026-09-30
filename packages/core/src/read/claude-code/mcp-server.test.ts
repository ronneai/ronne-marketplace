import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import { claudeCodeRenderer } from "../../render/claude-code/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { ReadError } from "../types.js";
import { mcpServerName, readMcpServer } from "./mcp-server.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const read = (value: unknown, description = "A server.") =>
  readMcpServer("tools", value, { itemName: "@team/tools", description });
const everything = (result: ReturnType<typeof read>) =>
  JSON.stringify({
    manifest: result.manifest,
    text: result.manifestText,
    warnings: result.warnings,
    files: result.files.map((f) => new TextDecoder().decode(f.bytes)),
  });

// The fixture's secrets: never in the output.
const SECRETS = {
  anthropic: `sk-ant-${"a1B2c3D4".repeat(4)}`,
  github: `ghp_${"a1B2".repeat(9)}`,
  slack: "xoxb-1234567890-abcdefghij",
  plain: "hunter2-not-a-pattern",
  default: `sk-proj-${"Z9y8X7w6".repeat(4)}`,
};

describe("readMcpServer", () => {
  it("reads the example server's rendered entry back into an item that renders the same entry", () => {
    const example = loadItemDir(`${examplesDir}github-mcp`);
    const [change] = claudeCodeRenderer.render(example, { scope: "project" }).changes as Extract<
      Change,
      { kind: "json-key" }
    >[];
    const result = readMcpServer("github-mcp", change?.value, {
      itemName: "@examples/github-mcp",
      description: String(example.manifest.description),
    });
    expect(result.warnings).toEqual([]);
    expect(result.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
      env: [{ name: "GITHUB_TOKEN", required: true, secret: true }],
    });
    expect(result.files.map((f) => f.path)).toEqual(["ronne.yaml"]);
    expect(parseManifest(result.manifestText).issues).toEqual([]);
    expect(checkPackage(result.manifest, result.files)).toEqual([]);
    const [again] = claudeCodeRenderer.render(
      {
        name: "@examples/github-mcp",
        version: "1.0.0",
        manifest: { ...result.manifest, version: "1.0.0" },
        files: result.files,
      },
      { scope: "project" },
    ).changes;
    expect(again).toEqual(change);
  });

  it("keeps env names only, marks credentials secret, and never a value", () => {
    const result = read({
      command: "npx",
      args: ["-y", "@acme/mcp"],
      env: {
        ANTHROPIC_API_KEY: SECRETS.anthropic,
        LOG_LEVEL: "debug",
        WEIRD: SECRETS.slack,
        API_KEY: "${OTHER_KEY}",
        "lower-case": "x",
      },
    });
    expect(result.manifest["mcp-server"]).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@acme/mcp"],
      env: [
        { name: "ANTHROPIC_API_KEY", required: true, secret: true },
        { name: "LOG_LEVEL", required: true },
        { name: "WEIRD", required: true, secret: true },
        { name: "API_KEY", required: true, secret: true },
      ],
    });
    expect(result.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining("API_KEY takes its value from OTHER_KEY"),
      expect.stringContaining("lower-case was left out"),
    ]);
    for (const secret of [SECRETS.anthropic, SECRETS.slack, "debug"])
      expect(everything(result)).not.toContain(secret);
    expect(checkPackage(result.manifest, result.files)).toEqual([]);
  });

  it("replaces literal credentials in headers, arguments and the address with declared variables", () => {
    const http = read({
      type: "streamable-http",
      url: `https://mcp.example.com/mcp?key=${SECRETS.github}`,
      headers: {
        Authorization: `Bearer ${SECRETS.plain}`,
        "X-Api-Key": SECRETS.anthropic,
        "X-Region": "eu-west-1",
        "X-Fallback": `\${REGION_TOKEN:-${SECRETS.default}}`,
      },
    });
    expect(http.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://mcp.example.com/mcp?key=${TOOLS_TOKEN}",
      headers: {
        Authorization: "Bearer ${TOOLS_TOKEN_2}",
        "X-Api-Key": "${TOOLS_TOKEN_3}",
        "X-Region": "eu-west-1",
        "X-Fallback": "${REGION_TOKEN}",
      },
      env: [
        { name: "TOOLS_TOKEN", required: true, secret: true },
        { name: "TOOLS_TOKEN_2", required: true, secret: true },
        { name: "TOOLS_TOKEN_3", required: true, secret: true },
      ],
    });
    expect(http.warnings.filter((w) => w.code === "secret_replaced").map((w) => w.message)).toEqual(
      [
        expect.stringContaining("mcpServers.tools.url"),
        expect.stringContaining("mcpServers.tools.headers.Authorization"),
        expect.stringContaining("mcpServers.tools.headers.X-Api-Key"),
      ],
    );

    const stdio = read({
      command: "server",
      args: ["--token", SECRETS.slack, `--key=${SECRETS.github}`],
    });
    expect(stdio.manifest["mcp-server"]).toMatchObject({
      args: ["--token", "${TOOLS_TOKEN}", "--key=${TOOLS_TOKEN_2}"],
    });

    for (const result of [http, stdio]) {
      for (const secret of Object.values(SECRETS)) expect(everything(result)).not.toContain(secret);
      expect(
        checkPackage(result.manifest, result.files).filter((i) => i.code === "secret_literal"),
      ).toEqual([]);
    }
  });

  it("stops a value whose credential can't be told apart from the text around it", () => {
    // Random enough to look like a secret whole, but cut by "/" into runs too short to flag.
    const glued = "Xk9pQ2mZ7rT4vB8nL1wE/Hs6dF3gJ0yU5aC2qN8x";
    expect(() =>
      read({ type: "http", url: "https://x.example", headers: { "X-Data": glued } }),
    ).toThrow(ReadError);
  });

  it("refuses sse and ws, and a server without a command or url", () => {
    for (const type of ["sse", "ws"]) {
      const error = (() => {
        try {
          read({ type, url: "https://x.example" });
        } catch (e) {
          return e as ReadError;
        }
      })();
      expect(error?.code).toBe("unsupported_transport");
    }
    expect(() => read({ type: "http" })).toThrow(ReadError);
    expect(() => read({ args: [] })).toThrow(ReadError);
    expect(() => read("npx")).toThrow(ReadError);
  });

  it("drops oauth, headersHelper, timeout and other keys, one warning each", () => {
    const result = read({
      type: "http",
      url: "https://x.example/mcp",
      oauth: { clientId: "abc" },
      headersHelper: "./h.sh",
      timeout: 600000,
      alwaysLoad: true,
    });
    expect(result.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual([
      "oauth",
      "headersHelper",
      "timeout",
      "alwaysLoad",
    ]);
    expect(everything(result)).not.toContain("abc");
  });

  it("arrives without a description when none is given, and names servers as items", () => {
    const result = readMcpServer("x", { command: "x" }, { itemName: "@team/x" });
    expect(result.manifest).not.toHaveProperty("description");
    expect(mcpServerName("GitHub_MCP")).toBe("github-mcp");
    const digits = readMcpServer(
      "9lives",
      { type: "http", url: `https://x.example/${SECRETS.github}` },
      {
        itemName: "@team/9lives",
      },
    );
    expect(digits.manifest["mcp-server"]).toMatchObject({
      url: "https://x.example/${MCP_9LIVES_TOKEN}",
    });
  });

  it("reads ${VAR:-default} in linear time, even on crafted input", () => {
    const started = performance.now();
    const crafted = "${A:-".repeat(100_000);
    const result = read({ command: "server", args: [crafted, `a\${B:-x}b\${C}\${:-y}`] });
    expect(result.manifest["mcp-server"]).toMatchObject({
      args: [crafted, "a${B}b${C}${:-y}"],
    });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
