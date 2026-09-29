import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { buildRegistry, type FakeIo, fakeIo, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const json = (path: string) => JSON.parse(readFileSync(join(io.cwd, path), "utf8"));

const start = async () => {
  const { routes } = await buildRegistry();
  io = fakeIo(routes);
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  mkdirSync(join(io.cwd, ".claude"));
};

describe("rmk mcp-setup", () => {
  it("registers the server through the renderer, keeps it through installs, and removes only it", async () => {
    await start();
    writeFileSync(
      join(io.cwd, ".mcp.json"),
      JSON.stringify({ mcpServers: { mine: { command: "mine" } } }),
    );
    const setup = await rmk("mcp-setup");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(setup.stdout).toContain("Registered the registry MCP server (rmk-mcp) for claude-code:");
    expect(setup.stdout).toContain("  wrote .mcp.json (a setting)");
    expect(setup.stdout).toContain("approve ronne-registry");
    expect(json(".mcp.json").mcpServers).toEqual({
      mine: { command: "mine" },
      "ronne-registry": { command: "rmk-mcp" },
    });
    expect(json(".rmk/state.json").entries).toMatchObject([
      { item: "rmk mcp-setup", kind: "json-key", key: ["mcpServers", "ronne-registry"] },
    ]);
    expect((await rmk("mcp-setup")).stdout).toContain("already registered");

    // An install, and removing everything it installed, leave the registration alone.
    expect((await rmk("install", "@team/secure")).exitCode).toBe(0);
    expect(json(".mcp.json").mcpServers["ronne-registry"]).toEqual({ command: "rmk-mcp" });
    expect((await rmk("remove", "@team/secure")).exitCode).toBe(0);
    expect(json(".mcp.json").mcpServers).toEqual({
      mine: { command: "mine" },
      "ronne-registry": { command: "rmk-mcp" },
    });

    const removed = await rmk("mcp-setup", "--remove");
    expect(removed.stdout).toBe("Removed the registry MCP server from .mcp.json.\n");
    expect(json(".mcp.json").mcpServers).toEqual({ mine: { command: "mine" } });
    expect(json(".rmk/state.json").entries).toEqual([]);
  });

  it("uses the command given, writes for every target, and never overwrites an entry it didn't write", async () => {
    await start();
    mkdirSync(join(io.cwd, ".codex"));
    const setup = await rmk(
      "mcp-setup",
      "--target",
      "claude-code,codex",
      "--command",
      "node /opt/ronne/packages/mcp/dist/bin.js",
    );
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(json(".mcp.json").mcpServers["ronne-registry"]).toEqual({
      command: "node",
      args: ["/opt/ronne/packages/mcp/dist/bin.js"],
    });
    expect(readFileSync(join(io.cwd, ".codex/config.toml"), "utf8")).toContain(
      '[mcp_servers.ronne-registry]\ncommand = "node"',
    );
    expect(setup.stdout).toContain("Note: Codex reads .codex/config.toml");

    io.cleanup();
    await start();
    writeFileSync(
      join(io.cwd, ".mcp.json"),
      JSON.stringify({ mcpServers: { "ronne-registry": { command: "someone-else" } } }),
    );
    const refused = await rmk("mcp-setup");
    expect(refused.exitCode).toBe(3);
    expect(refused.stdout).toContain(".mcp.json (mcpServers.ronne-registry): not written by rmk");
    expect(json(".mcp.json").mcpServers["ronne-registry"]).toEqual({ command: "someone-else" });
  });

  it("registers in the home folder with --scope user", async () => {
    await start();
    const setup = await rmk("mcp-setup", "--scope", "user", "--target", "claude-code");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(
      JSON.parse(readFileSync(join(io.home, ".claude.json"), "utf8")).mcpServers["ronne-registry"],
    ).toEqual({ command: "rmk-mcp" });
    expect(setup.stdout).not.toContain("approve");
  });
});
