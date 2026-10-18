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

describe("rmk mcp-setup without a token (107)", () => {
  const CODE = {
    device_code: "dev-code",
    user_code: "WDJB-MJHT",
    verification_uri: `${REGISTRY}/device`,
    verification_uri_complete: `${REGISTRY}/device?user_code=WDJB-MJHT`,
    expires_in: 600,
    interval: 5,
  };
  const startSignedOut = async (options: { interactive?: boolean } = {}) => {
    const { routes } = await buildRegistry();
    io = fakeIo(
      {
        ...routes,
        "POST /auth/device/code": () => ({ json: CODE }),
        "POST /auth/device/token": () => ({
          json: { token: "rmk_test_token", id: "t9", name: "rmk on laptop", expiresAt: null },
        }),
      },
      { env: { RMK_REGISTRY: REGISTRY, HOSTNAME: "laptop" }, ...options },
    );
    mkdirSync(join(io.cwd, ".claude"));
  };
  const devicePolls = () => io.requests.filter((r) => r.path.startsWith("/api/v1/auth/device/"));
  const saved = () =>
    JSON.parse(readFileSync(join(io.home, ".config", "rmk", "config.json"), "utf8"));

  it("offers the web login first, then registers the server", async () => {
    await startSignedOut();
    io.answers.push("");
    const setup = await rmk("mcp-setup");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(io.questions[0]).toContain("Sign in in the browser now? [Y/n]");
    expect(io.notices).toContain("and enter the code  WDJB-MJHT   (it expires in 10 minutes)");
    expect(setup.stdout).toContain(`Logged in to ${REGISTRY} as dev@example.com.`);
    expect(setup.stdout).toContain("Registered the registry MCP server (rmk-mcp)");
    expect(saved().registries[REGISTRY].token).toBe("rmk_test_token");
  });

  it("signs in without asking with --yes", async () => {
    await startSignedOut();
    expect((await rmk("mcp-setup", "--yes")).exitCode).toBe(0);
    expect(io.questions).toEqual([]);
    expect(devicePolls()).toHaveLength(2);
  });

  it("only says what to run when declined, or without a terminal, and registers anyway", async () => {
    await startSignedOut();
    io.answers.push("n");
    const declined = await rmk("mcp-setup");
    expect(declined.stdout).toContain("Run `rmk login --web`");
    expect(declined.stdout).toContain("Registered the registry MCP server");
    expect(devicePolls()).toEqual([]);

    io.cleanup();
    await startSignedOut({ interactive: false });
    const unattended = await rmk("mcp-setup");
    expect(unattended.exitCode).toBe(0);
    expect(io.questions).toEqual([]);
    expect(unattended.stdout).toContain("Run `rmk login --web`");
    expect(devicePolls()).toEqual([]);
  });

  it("doesn't offer it with a token, or when removing", async () => {
    await start();
    await rmk("mcp-setup");
    expect(io.questions).toEqual([]);
    expect(devicePolls()).toEqual([]);

    io.cleanup();
    await startSignedOut();
    await rmk("mcp-setup", "--remove");
    expect(io.questions).toEqual([]);
    expect(devicePolls()).toEqual([]);
  });
});
