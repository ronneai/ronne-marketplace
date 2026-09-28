import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { buildRegistry, type FakeIo, fakeIo, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const read = (path: string) => readFileSync(join(io.cwd, path), "utf8");

/** A project with @team/secure installed at 1.0.0, pinned, while 1.1.0 is out. */
const start = async () => {
  const { routes } = await buildRegistry();
  io = fakeIo(routes);
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  mkdirSync(join(io.cwd, ".claude"));
  const first = await rmk("install", "@team/secure@^1.0.0", "--target", "claude-code");
  expect(first.exitCode, first.stderr).toBe(0);
  const lock = JSON.parse(read("rmk.lock"));
  lock.items["@team/secure"].version = "1.0.0";
  lock.items["@team/secure"].sha256 = (await buildRegistry()).packed["@team/secure@1.0.0"].sha256;
  writeFileSync(join(io.cwd, "rmk.lock"), JSON.stringify(lock));
  await rmk("install");
  expect(read(".claude/skills/secure/SKILL.md")).toContain("Check inputs.");
  io.requests.length = 0;
};

describe("rmk update, outdated and remove", () => {
  it("outdated shows what's locked, what the range allows, and the newest", async () => {
    await start();
    const result = await rmk("outdated");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("@team/secure  ^1.0.0  1.0.0  1.1.0  1.1.0\n");
    const json = JSON.parse((await rmk("outdated", "--json")).stdout);
    expect(json.items).toEqual([
      { item: "@team/secure", range: "^1.0.0", locked: "1.0.0", wanted: "1.1.0", latest: "1.1.0" },
    ]);
    expect(io.requests.filter((r) => r.path === "/api/v1/resolve").at(-1)?.body).toMatchObject({
      locked: {},
    });
  });

  it("update moves the named item within its range, keeping the rest locked, and re-renders it", async () => {
    await start();
    const result = await rmk("update", "@team/secure");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("@team/secure: 1.0.0 → 1.1.0\n");
    expect(read(".claude/skills/secure/SKILL.md")).toContain("Check inputs and secrets.");
    expect(JSON.parse(read("rmk.lock")).items["@team/secure"].version).toBe("1.1.0");
    expect(io.requests.find((r) => r.path === "/api/v1/resolve")?.body).toEqual({
      dependencies: { "@team/secure": "^1.0.0" },
      locked: { "@team/gh": "1.2.0" },
    });
    expect((await rmk("update")).stdout).toContain(
      "Everything is already at the newest version its range allows.",
    );
    expect(await rmk("update", "@team/other")).toMatchObject({ exitCode: 2 });
  });

  it("remove drops the item and the dependencies nothing else needs, and updates the config", async () => {
    await start();
    const result = await rmk("remove", "@team/secure");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Removed @team/gh, @team/secure.");
    expect(result.stdout).toContain("removed .claude/skills/secure");
    expect(existsSync(join(io.cwd, ".claude/skills/secure"))).toBe(false);
    expect(JSON.parse(read(".mcp.json"))).toEqual({});
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({});
    expect(JSON.parse(read("rmk.lock")).items).toEqual({});
    expect(JSON.parse(read(".rmk/state.json")).entries).toEqual([]);
    expect(await rmk("remove", "@team/secure")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("isn't in this project"),
    });
    expect(await rmk("remove")).toMatchObject({ exitCode: 2 });
  });

  it("remove keeps a dependency another item still needs", async () => {
    await start();
    // @team/fmt has no dependencies; removing it leaves @team/secure and its @team/gh alone.
    expect((await rmk("install", "@team/fmt")).exitCode).toBe(0);
    const result = await rmk("remove", "@team/fmt");
    expect(result.stdout).toContain("Removed @team/fmt.");
    expect(existsSync(join(io.cwd, ".claude/skills/secure"))).toBe(true);
    expect(JSON.parse(read(".mcp.json")).mcpServers.gh).toBeDefined();
    expect(JSON.parse(read(".claude/settings.json"))).toEqual({});
  });
});
