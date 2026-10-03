import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { configDir } from "./config.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const userSettings = () => join(io.home, ".claude", "settings.json");
const projectSettings = () => join(io.cwd, ".claude", "settings.json");

const NAME = "ronne-ronne-example";
const MARKETPLACE = `${REGISTRY}/api/v1/feeds/claude-code/marketplace.json`;

const start = async () => {
  io = fakeIo(identityRoutes("rmk_secret"));
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_secret");
};

describe("rmk plugin-setup claude-code (077)", () => {
  it("adds the marketplace to the user's settings with rmk auth headers, keeps the rest, and --remove takes only it out", async () => {
    await start();
    mkdirSync(join(io.home, ".claude"));
    writeFileSync(userSettings(), JSON.stringify({ theme: "dark" }));
    const setup = await rmk("plugin-setup", "claude-code");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(setup.stdout).toContain(
      `Added the plugin marketplace ${NAME} to Claude Code (~/.claude/settings.json).`,
    );
    expect(setup.stdout).toContain("run /plugin in Claude Code");
    expect(json(userSettings())).toEqual({
      theme: "dark",
      extraKnownMarketplaces: {
        [NAME]: {
          source: {
            source: "url",
            url: MARKETPLACE,
            headersHelper: `rmk auth headers --registry ${REGISTRY}`,
          },
        },
      },
    });
    // Tracked in the user's state, without the token.
    const state = readFileSync(join(configDir(io), "user-state.json"), "utf8");
    expect(JSON.parse(state).entries).toMatchObject([
      { item: "rmk plugin-setup", kind: "json-key", key: ["extraKnownMarketplaces", NAME] },
    ]);
    expect((await rmk("plugin-setup", "claude-code")).stdout).toContain(
      "is already in Claude Code",
    );

    const removed = await rmk("plugin-setup", "claude-code", "--remove");
    expect(removed.stdout).toBe(
      "Removed the registry's plugin marketplace from Claude Code (~/.claude/settings.json).\n",
    );
    expect(json(userSettings())).toEqual({ theme: "dark" });
    expect((await rmk("plugin-setup", "claude-code", "--remove")).stdout).toContain(
      "wasn't set up here",
    );
  });

  it("writes the project's settings with --scope project, for the project's registry", async () => {
    await start();
    writeFileSync(
      join(io.cwd, "rmk.config.json"),
      JSON.stringify({ version: 1, registry: REGISTRY, dependencies: {} }),
    );
    const setup = await rmk("plugin-setup", "claude-code", "--scope", "project");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(setup.stdout).toContain("(.claude/settings.json)");
    expect(setup.stdout).toContain("only once you trust the folder");
    expect(json(projectSettings()).extraKnownMarketplaces[NAME].source.url).toBe(MARKETPLACE);
    expect(existsSync(userSettings())).toBe(false);
    expect(
      (await rmk("plugin-setup", "claude-code", "--scope", "project", "--remove")).exitCode,
    ).toBe(0);
    expect(json(projectSettings())).toEqual({});
  });

  it("never overwrites a marketplace entry it didn't write, or one edited since", async () => {
    await start();
    mkdirSync(join(io.home, ".claude"));
    writeFileSync(
      userSettings(),
      JSON.stringify({
        extraKnownMarketplaces: { [NAME]: { source: { source: "url", url: "x" } } },
      }),
    );
    const refused = await rmk("plugin-setup", "claude-code");
    expect(refused.exitCode).toBe(3);
    expect(refused.stdout).toContain("not written by rmk");
    expect(refused.stderr).toContain("a marketplace entry there isn't rmk's");

    writeFileSync(userSettings(), "{}");
    expect((await rmk("plugin-setup", "claude-code")).exitCode).toBe(0);
    const edited = json(userSettings());
    edited.extraKnownMarketplaces[NAME].autoUpdate = true;
    writeFileSync(userSettings(), JSON.stringify(edited));
    const again = await rmk("plugin-setup", "claude-code", "--command", "/opt/bin/rmk");
    expect(again.exitCode).toBe(3);
    expect(again.stdout).toContain("edited since rmk wrote it");
    expect(json(userSettings()).extraKnownMarketplaces[NAME].autoUpdate).toBe(true);
    // --remove leaves an edited entry too.
    expect((await rmk("plugin-setup", "claude-code", "--remove")).exitCode).toBe(3);
    expect(json(userSettings()).extraKnownMarketplaces[NAME].autoUpdate).toBe(true);
  });

  it("uses the command given for the helper", async () => {
    await start();
    expect((await rmk("plugin-setup", "claude-code", "--command", "/opt/bin/rmk")).exitCode).toBe(
      0,
    );
    expect(json(userSettings()).extraKnownMarketplaces[NAME].source.headersHelper).toBe(
      `/opt/bin/rmk auth headers --registry ${REGISTRY}`,
    );
  });

  it("writes the token itself with --static-headers, only at user scope", async () => {
    await start();
    const refused = await rmk(
      "plugin-setup",
      "claude-code",
      "--scope",
      "project",
      "--static-headers",
    );
    expect(refused).toMatchObject({ exitCode: 2, stderr: expect.stringContaining("--scope user") });
    expect(existsSync(projectSettings())).toBe(false);

    const setup = await rmk("plugin-setup", "claude-code", "--static-headers");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(setup.stdout).toContain("the token is written into the settings file");
    expect(json(userSettings()).extraKnownMarketplaces[NAME].source).toEqual({
      source: "url",
      url: MARKETPLACE,
      headers: { Authorization: "Bearer rmk_secret" },
    });
    // The state file keeps a hash, never the token.
    expect(readFileSync(join(configDir(io), "user-state.json"), "utf8")).not.toContain(
      "rmk_secret",
    );
  });

  it("needs rmk login, and only sets up claude-code", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("plugin-setup", "claude-code", "--registry", REGISTRY)).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("rmk login"),
    });
    expect(await rmk("plugin-setup", "codex")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("git mirror"),
    });
    expect(await rmk("plugin-setup")).toMatchObject({ exitCode: 2 });
  });

  it("warns when Claude Code won't download from the registry's address", async () => {
    io = fakeIo(identityRoutes("rmk_secret"));
    await rmk(
      "login",
      "--registry",
      "http://localhost:3000",
      "--token",
      "rmk_secret",
      "--insecure",
    );
    const setup = await rmk("plugin-setup", "claude-code", "--insecure");
    expect(setup.exitCode, setup.stderr).toBe(0);
    expect(setup.stdout).toContain("isn't an HTTPS address Claude Code will download plugins from");
  });
});
