import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import { codexRenderer } from "../../render/codex/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { codexAgentName, readCodexAgent } from "./agent.js";
import { readCodexMcpServer } from "./mcp-server.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const render = (item: ReturnType<typeof loadItemDir>) =>
  codexRenderer.render(item, { scope: "project" }).changes;
const again = (name: string, read: ReturnType<typeof readCodexAgent>) =>
  render({
    name,
    version: "1.0.0",
    manifest: { ...read.manifest, version: "1.0.0" },
    files: read.files,
  });
const SECRETS = { env: `sk-ant-${"a1B2c3D4".repeat(4)}`, header: `ghp_${"a1B2".repeat(9)}` };
const everything = (read: ReturnType<typeof readCodexMcpServer>) =>
  JSON.stringify({ ...read, files: read.files.map((f) => new TextDecoder().decode(f.bytes)) });

describe("readCodexAgent", () => {
  it("reads the example agent rendered for Codex back into an item that renders the same file", () => {
    const [change] = render(loadItemDir(`${examplesDir}code-reviewer`)) as Extract<
      Change,
      { kind: "file" }
    >[];
    const read = readCodexAgent(parseToml(String(change?.content)), {
      itemName: "@examples/code-reviewer",
      fileName: "code-reviewer.toml",
    });
    expect(read.warnings).toEqual([]);
    expect(read.manifest).toEqual({
      name: "@examples/code-reviewer",
      type: "agent",
      description: expect.stringMatching(/^Reviews diffs/),
      agent: { prompt: "prompt.md" },
    });
    expect(parseManifest(read.manifestText).issues).toEqual([]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(again("@examples/code-reviewer", read)).toEqual([change]);
  });

  it("keeps the model for Codex as an override, and drops other keys one warning each", () => {
    const read = readCodexAgent(
      {
        name: "planner",
        description: "Plans.",
        developer_instructions: "Plan it.\n\n",
        model: "gpt-5.1-codex",
        model_reasoning_effort: "high",
        sandbox_mode: "read-only",
        mcp_servers: { docs: { url: "https://d.example" } },
      },
      { itemName: "@team/planner", fileName: "planner.toml" },
    );
    expect(read.manifest.targets).toEqual({ codex: { overrides: { model: "gpt-5.1-codex" } } });
    expect(read.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual([
      "model_reasoning_effort",
      "sandbox_mode",
      "mcp_servers",
    ]);
    expect(new TextDecoder().decode(read.files.find((f) => f.path === "prompt.md")?.bytes)).toBe(
      "Plan it.\n",
    );
    const rendered = again("@team/planner", read);
    expect(String((rendered[0] as { content: string }).content)).toContain(
      'model = "gpt-5.1-codex"',
    );
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
  });

  it("uses the file's name without a name, and refuses what isn't a table", () => {
    const read = readCodexAgent(
      { description: "D.", developer_instructions: "Do." },
      { itemName: "@team/helper", fileName: "helper.toml" },
    );
    expect(read.warnings.map((w) => w.code)).toEqual(["name_changed"]);
    expect(codexAgentName({ description: "D." }, "Helper Bot.toml")).toBe("helper-bot");
    expect(codexAgentName({ name: "planner" }, "x.toml")).toBe("planner");
    expect(() => readCodexAgent("text", { itemName: "@team/x", fileName: "x.toml" })).toThrow();
  });
});

describe("readCodexMcpServer", () => {
  it("reads the example server rendered for Codex back into an item that renders the same entry", () => {
    const example = loadItemDir(`${examplesDir}github-mcp`);
    const [change] = render(example) as Extract<Change, { kind: "toml-key" }>[];
    const read = readCodexMcpServer("github-mcp", change?.value, {
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
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(
      render({
        name: "@examples/github-mcp",
        version: "1.0.0",
        manifest: { ...read.manifest, version: "1.0.0" },
        files: read.files,
      }),
    ).toEqual([change]);
  });

  it("keeps stdio variables by name only, and never a value", () => {
    const read = readCodexMcpServer(
      "tools",
      {
        command: "npx",
        args: ["-y", "tools"],
        env: { API_KEY: SECRETS.env, LOG_LEVEL: "debug" },
        env_vars: ["HOME_TOKEN", { name: "REMOTE_KEY", source: "remote" }],
        cwd: "/srv",
        startup_timeout_sec: 20,
      },
      { itemName: "@team/tools" },
    );
    expect(read.manifest["mcp-server"]).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "tools"],
      env: [
        { name: "API_KEY", required: true, secret: true },
        { name: "LOG_LEVEL", required: true },
        { name: "HOME_TOKEN", required: true, secret: true },
        { name: "REMOTE_KEY", required: true, secret: true },
      ],
    });
    expect(read.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual([
      "cwd",
      "startup_timeout_sec",
    ]);
    expect(read.warnings[0]?.message).toContain("mcp_servers.tools");
    expect(everything(read)).not.toContain(SECRETS.env);
    expect(everything(read)).not.toContain("debug");
  });

  it("reads http's bearer and env headers as variables, and takes literal credentials out", () => {
    const read = readCodexMcpServer(
      "tracker",
      {
        url: "https://t.example/mcp",
        bearer_token_env_var: "TRACKER_TOKEN",
        http_headers: {
          Authorization: `Bearer ${SECRETS.header}`,
          "X-Api-Key": SECRETS.env,
          "X-Region": "eu",
        },
        env_http_headers: { "X-Org": "TRACKER_ORG" },
        enabled: false,
        oauth: { client_id: "abc" },
      },
      { itemName: "@team/tracker", description: "Tracks." },
    );
    expect(read.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://t.example/mcp",
      headers: {
        "X-Api-Key": "${TRACKER_TOKEN_2}",
        "X-Region": "eu",
        "X-Org": "${TRACKER_ORG}",
        Authorization: "Bearer ${TRACKER_TOKEN}",
      },
      env: [
        { name: "TRACKER_ORG", required: true },
        { name: "TRACKER_TOKEN", required: true, secret: true },
        { name: "TRACKER_TOKEN_2", required: true, secret: true },
      ],
    });
    expect(read.warnings.map((w) => w.code)).toEqual([
      "field_dropped",
      "field_dropped",
      "field_dropped",
      "secret_replaced",
    ]);
    for (const secret of Object.values(SECRETS)) expect(everything(read)).not.toContain(secret);
    expect(
      checkPackage(read.manifest, read.files).filter((i) => i.code === "secret_literal"),
    ).toEqual([]);
  });
});
