import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { buildRegistry, type FakeIo, fakeIo, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);

const start = async (env: Record<string, string> = {}) => {
  const { routes, packed } = await buildRegistry();
  io = fakeIo(routes, { env });
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  mkdirSync(join(io.cwd, ".claude"));
  io.requests.length = 0;
  return packed;
};
const read = (path: string) => readFileSync(join(io.cwd, path), "utf8");

describe("rmk install", () => {
  it("resolves, downloads, checks, renders for the detected tool, and writes the lockfile, state and config", async () => {
    await start();
    const result = await rmk("install", "@team/secure");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Installed @team/gh@1.2.0, @team/secure@1.1.0 for claude-code.",
    );
    expect(result.stdout).toContain("wrote .claude/skills/secure");
    expect(result.stdout).toContain("wrote .mcp.json (a setting)");
    expect(result.stdout).toContain(
      "Set these environment variables before using the MCP servers: GITHUB_TOKEN.",
    );
    expect(read(".claude/skills/secure/SKILL.md")).toContain("Check inputs and secrets.");
    expect(JSON.parse(read(".mcp.json"))).toEqual({
      mcpServers: { gh: { command: "npx", env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } } },
    });
    expect(JSON.parse(read("rmk.config.json"))).toEqual({
      dependencies: { "@team/secure": "latest" },
      version: 1,
    });
    const lock = JSON.parse(read("rmk.lock"));
    expect(lock).toMatchObject({
      registry: REGISTRY,
      version: 1,
      items: {
        "@team/secure": { version: "1.1.0", type: "skill", dependencies: { "@team/gh": "1.2.0" } },
        "@team/gh": { version: "1.2.0" },
      },
    });
    const state = JSON.parse(read(".rmk/state.json"));
    expect(
      state.entries.map((e: { kind: string; path: string; targets: string[] }) => [
        e.kind,
        e.path,
        e.targets,
      ]),
    ).toEqual([
      ["dir", ".claude/skills/secure", ["claude-code"]],
      ["json-key", ".mcp.json", ["claude-code"]],
    ]);
    expect(io.requests.find((r) => r.path === "/api/v1/resolve")?.body).toEqual({
      dependencies: { "@team/secure": "latest" },
      locked: {},
    });
  });

  it("installs exactly the lockfile with no arguments, from the cache, and says when everything is in place", async () => {
    await start();
    await rmk("install", "@team/secure");
    const downloads = io.requests.filter((r) => r.path.endsWith("/tarball")).length;
    expect(downloads).toBe(2);
    writeFileSync(
      join(io.cwd, "rmk.config.json"),
      JSON.stringify({ version: 1, dependencies: { "@team/secure": "latest" } }),
    );
    const again = await rmk("install");
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain("Everything was already in place.");
    expect(io.requests.filter((r) => r.path === "/api/v1/resolve").at(-1)?.body).toMatchObject({
      locked: { "@team/secure": "1.1.0", "@team/gh": "1.2.0" },
    });
    expect(io.requests.filter((r) => r.path.endsWith("/tarball")).length).toBe(downloads);
    expect(existsSync(join(io.home, ".cache", "rmk", "artifacts"))).toBe(true);
  });

  it("stops before writing anything when a checksum doesn't match", async () => {
    const packed = await start();
    const bad = fakeIo({
      ...(await buildRegistry()).routes,
      "GET /items/team/gh/1.2.0/tarball": () => ({ bytes: new Uint8Array([1, 2, 3]), headers: {} }),
    });
    io.cleanup();
    io = bad;
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    mkdirSync(join(io.cwd, ".claude"));
    const result = await rmk("install", "@team/secure");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("checksum");
    expect(result.stderr).toContain(packed["@team/gh@1.2.0"].sha256);
    expect(existsSync(join(io.cwd, "rmk.lock"))).toBe(false);
    expect(existsSync(join(io.cwd, ".claude/skills"))).toBe(false);
  });

  it("warns about deprecated versions and unsupported types, and keeps going", async () => {
    await start();
    const result = await rmk("install", "@team/fmt", "--json");
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.deprecated).toEqual([
      { item: "@team/fmt", version: "1.0.0", code: "deprecated", message: "Use @team/fmt2." },
    ]);
    expect(json.written.map((w: { kind: string }) => w.kind)).toEqual(["json-array-item"]);
    expect(JSON.parse(read(".claude/settings.json")).hooks.PostToolUse).toHaveLength(1);
  });

  it("leaves conflicts in place with exit 3, and --force replaces them", async () => {
    await start();
    mkdirSync(join(io.cwd, ".claude/skills/secure"), { recursive: true });
    writeFileSync(join(io.cwd, ".claude/skills/secure/SKILL.md"), "mine\n");
    const result = await rmk("install", "@team/secure");
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toContain(".claude/skills/secure: not written by rmk (@team/secure)");
    expect(read(".claude/skills/secure/SKILL.md")).toBe("mine\n");
    expect(existsSync(join(io.cwd, "rmk.lock"))).toBe(false);
    const forced = await rmk("install", "@team/secure", "--force");
    expect(forced.exitCode).toBe(0);
    expect(read(".claude/skills/secure/SKILL.md")).toContain("Check inputs and secrets.");
  });

  it("needs a target it can find, and refuses unknown ones, bad refs and unknown items", async () => {
    await start();
    expect(await rmk("install", "@team/secure", "--target", "vim")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("rmk platforms"),
    });
    expect(await rmk("install", "secure")).toMatchObject({ exitCode: 2 });
    expect(await rmk("install", "@team/secure@not a range")).toMatchObject({ exitCode: 2 });
    expect(await rmk("install", "@team/nope")).toMatchObject({
      exitCode: 1,
      stderr: "@team/nope isn't a published item.\n",
    });
    const explicit = await rmk("install", "@team/secure@^1.0.0", "--target", "claude-code");
    expect(explicit.exitCode).toBe(0);
    expect(JSON.parse(read("rmk.config.json"))).toEqual({
      dependencies: { "@team/secure": "^1.0.0" },
      targets: ["claude-code"],
      version: 1,
    });
  });

  it("installs into the home folder with --scope user, with rmk's files under ~/.config/rmk", async () => {
    await start();
    const result = await rmk(
      "install",
      "@team/secure",
      "--scope",
      "user",
      "--target",
      "claude-code",
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(io.home, ".claude/skills/secure/SKILL.md"))).toBe(true);
    expect(existsSync(join(io.home, ".claude.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(io.home, ".config/rmk/user.lock"), "utf8"))).toMatchObject({
      dependencies: { "@team/secure": "latest" },
      items: { "@team/secure": { version: "1.1.0" } },
    });
    expect(existsSync(join(io.home, ".config/rmk/user-state.json"))).toBe(true);
    expect(existsSync(join(io.cwd, "rmk.lock"))).toBe(false);
  });
});
