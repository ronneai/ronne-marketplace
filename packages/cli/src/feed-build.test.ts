import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pluginArchive } from "@ronneai/core/plugins";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { FEED_STATE } from "./feed-build.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY, type Route } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const text = (value: string) => new TextEncoder().encode(value);

type FakePlugin = {
  name: string;
  version: string;
  files: { path: string; content: string; executable?: boolean }[];
  /** Serve other bytes than the marketplace's sha256 says. */
  tampered?: boolean;
};

/** The instance's feeds, as 077's routes answer them; tests change it between runs. */
let feed: Record<string, FakePlugin[]>;
/** The token was revoked: the marketplaces answer 401. */
let revoked = false;

const routes = (): Record<string, Route> => ({
  ...identityRoutes("rmk_feed"),
  ...Object.fromEntries(
    ["claude-code", "codex", "cursor"].map((tool) => [
      `GET /feeds/${tool}/marketplace.json`,
      async () =>
        revoked
          ? {
              status: 401,
              json: { error: { code: "token_revoked", message: "The access token was revoked." } },
            }
          : {
              json: {
                name: "ronne-ronne-example",
                owner: { name: "Ronne at ronne.example" },
                description: "Released items from the Ronne registry at https://ronne.example",
                plugins: await Promise.all(
                  (feed[tool] ?? []).map(async (p) => ({
                    name: p.name,
                    version: p.version,
                    description: `${p.name} at ${p.version}`,
                    source: {
                      source: "archive",
                      url: `https://elsewhere.example/api/v1/feeds/${tool}/plugins/x/y/${p.version}.zip`,
                      sha256: (await zipOf(p)).sha256,
                    },
                  })),
                ),
              },
            },
    ]),
  ),
});

const zipOf = (plugin: FakePlugin) =>
  pluginArchive(
    plugin.files.map((f) => ({
      path: f.path,
      bytes: text(f.content),
      ...(f.executable ? { executable: true } : {}),
    })),
  );

/** Zip routes for every plugin in the feed, at the address built from its name and version. */
const withZips = (base: Record<string, Route>): Record<string, Route> =>
  new Proxy(base, {
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      // GET /api/v1/feeds/<tool>/plugins/<scope>/<name>/<version>.zip, split rather than matched.
      const parts = key.split("/");
      if (key.slice(0, 18) !== "GET /api/v1/feeds/" || parts.length !== 9 || parts[5] !== "plugins")
        return undefined;
      const file = parts[8] ?? "";
      if (!file.endsWith(".zip")) return undefined;
      const [tool, scope, name, version] = [parts[4], parts[6], parts[7], file.slice(0, -4)];
      const plugin = (feed[tool ?? ""] ?? []).find(
        (p) => p.name === `${scope}.${name}` && p.version === decodeURIComponent(version ?? ""),
      );
      if (!plugin) return undefined;
      return async () => ({
        bytes: plugin.tampered ? text("not the zip it should be") : (await zipOf(plugin)).bytes,
        headers: { "content-type": "application/zip" },
      });
    },
  });

const skill = (name: string, version: string, body = "Do it.\n"): FakePlugin => ({
  name,
  version,
  files: [
    { path: "plugin.json", content: `{"name":"${name}","version":"${version}"}\n` },
    { path: `skills/${name.split(".")[1]}/SKILL.md`, content: body },
  ],
});

const hook = (name: string, version: string): FakePlugin => ({
  name,
  version,
  files: [
    { path: ".cursor-plugin/plugin.json", content: `{"name":"${name}"}\n` },
    { path: "hooks/hooks.json", content: "{}\n" },
    { path: "hooks/fmt/run.sh", content: "#!/bin/sh\necho fmt\n", executable: true },
  ],
});

const out = () => join(io.cwd, "mirror");
const read = (path: string) => readFileSync(join(out(), path), "utf8");
const json = (path: string) => JSON.parse(read(path));

/** Every file under the mirror, with its bytes, for "nothing changed" checks. */
const snapshot = (dir = out()): Record<string, string> => {
  const files: Record<string, string> = {};
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[relative(dir, full)] = readFileSync(full, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
};

const build = (...extra: string[]) => rmk("feed", "build", "--out", "mirror", ...extra);

beforeEach(async () => {
  revoked = false;
  feed = {
    "claude-code": [skill("team.style", "1.0.0"), skill("team.review", "2.0.0")],
    codex: [skill("team.style", "1.0.0")],
    cursor: [skill("team.style", "1.0.0"), hook("team.fmt", "1.1.0")],
  };
  io = fakeIo(withZips(routes()));
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_feed");
});

describe("rmk feed build (078)", () => {
  it("writes the three marketplaces, the plugin folders and the state into an empty folder", async () => {
    const result = await build();
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Built ${REGISTRY}'s plugin feed into mirror:`);
    expect(result.stdout).toContain("  cursor: 2 plugins (2 added, 0 updated, 0 removed)");
    expect(json(".claude-plugin/marketplace.json")).toEqual({
      name: "ronne-ronne-example",
      owner: { name: "Ronne at ronne.example" },
      description: "Released items from the Ronne registry at https://ronne.example",
      plugins: [
        {
          name: "team.review",
          version: "2.0.0",
          description: "team.review at 2.0.0",
          source: "./plugins/claude-code/team.review",
        },
        {
          name: "team.style",
          version: "1.0.0",
          description: "team.style at 1.0.0",
          source: "./plugins/claude-code/team.style",
        },
      ],
    });
    expect(json(".agents/plugins/marketplace.json").plugins).toEqual([
      {
        name: "team.style",
        source: { source: "local", path: "./plugins/codex/team.style" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      },
    ]);
    expect(
      json(".cursor-plugin/marketplace.json").plugins.map((p: { source: string }) => p.source),
    ).toEqual(["plugins/cursor/team.fmt", "plugins/cursor/team.style"]);
    expect(read("plugins/codex/team.style/skills/style/SKILL.md")).toBe("Do it.\n");
    // Executables stay executable.
    expect(statSync(join(out(), "plugins/cursor/team.fmt/hooks/fmt/run.sh")).mode & 0o111).not.toBe(
      0,
    );
    expect(json(FEED_STATE)).toMatchObject({
      version: 1,
      registry: REGISTRY,
      tools: {
        codex: {
          marketplace: "ronne-ronne-example",
          plugins: {
            "team.style": { version: "1.0.0", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
          },
        },
      },
    });
    // The zips come from the registry rmk talks to, not the address in the marketplace.
    expect(io.requests.some((r) => r.path.includes("elsewhere"))).toBe(false);
  });

  it("changes nothing, and downloads nothing, when nothing new was released", async () => {
    await build();
    const before = snapshot();
    const requests = io.requests.length;
    const again = await build();
    expect(again.exitCode, again.stderr).toBe(0);
    expect(again.stdout).toContain("Nothing changed.");
    expect(snapshot()).toEqual(before);
    // Only the three marketplaces were read.
    expect(io.requests.slice(requests).map((r) => r.path)).toEqual([
      "/api/v1/feeds/claude-code/marketplace.json",
      "/api/v1/feeds/codex/marketplace.json",
      "/api/v1/feeds/cursor/marketplace.json",
    ]);
  });

  it("replaces only a new release's folder, and removes one that's no longer listed", async () => {
    await build();
    writeFileSync(join(io.cwd, "mirror", "README.md"), "My mirror.\n");
    const before = snapshot();
    // team.style 1.1.0 drops a file; team.review is yanked.
    feed["claude-code"] = [{ ...skill("team.style", "1.1.0", "Do it better.\n") }];
    feed.codex = [skill("team.style", "1.1.0", "Do it better.\n")];
    const result = await rmk("feed", "build", "--out", "mirror", "--json");
    expect(result.exitCode, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: true, changed: true });
    expect(report.tools).toEqual([
      expect.objectContaining({
        tool: "claude-code",
        added: [],
        updated: ["team.style"],
        removed: ["team.review"],
      }),
      expect.objectContaining({ tool: "codex", added: [], updated: ["team.style"], removed: [] }),
      expect.objectContaining({ tool: "cursor", added: [], updated: [], removed: [] }),
    ]);
    const after = snapshot();
    expect(existsSync(join(out(), "plugins/claude-code/team.review"))).toBe(false);
    expect(read("plugins/claude-code/team.style/skills/style/SKILL.md")).toBe("Do it better.\n");
    // Cursor's folders and file, and the person's README, are as they were.
    for (const path of Object.keys(before).filter(
      (p) =>
        p.startsWith("plugins/cursor/") ||
        p === ".cursor-plugin/marketplace.json" ||
        p === "README.md",
    ))
      expect(after[path], path).toBe(before[path]);
    expect(
      json(".claude-plugin/marketplace.json").plugins.map((p: { name: string }) => p.name),
    ).toEqual(["team.style"]);
  });

  it("stops on a path under plugins/ it didn't write, or one changed since, unless --force", async () => {
    await build();
    mkdirSync(join(out(), "plugins/codex/mine"));
    writeFileSync(join(out(), "plugins/codex/mine/plugin.json"), "{}\n");
    writeFileSync(join(out(), "plugins/cursor/team.style/skills/style/SKILL.md"), "Edited.\n");
    feed.codex = [skill("team.style", "1.2.0")];
    const before = snapshot();
    const refused = await build();
    expect(refused.exitCode).toBe(3);
    expect(refused.stdout).toContain("  plugins/codex/mine: not written by rmk");
    expect(refused.stdout).toContain("  plugins/cursor/team.style: changed since rmk wrote it");
    expect(refused.stderr).toContain("Nothing was written");
    expect(snapshot()).toEqual(before);

    const forced = await build("--force");
    expect(forced.exitCode, forced.stderr).toBe(0);
    // The edited folder is rmk's again; the foreign one is left alone.
    expect(read("plugins/cursor/team.style/skills/style/SKILL.md")).toBe("Do it.\n");
    expect(read("plugins/codex/mine/plugin.json")).toBe("{}\n");
    expect(json(FEED_STATE).tools.codex.plugins["team.style"].version).toBe("1.2.0");
  });

  it("stops on a marketplace file it didn't write", async () => {
    mkdirSync(join(io.cwd, "mirror", ".agents/plugins"), { recursive: true });
    writeFileSync(join(io.cwd, "mirror", ".agents/plugins/marketplace.json"), "{}\n");
    const refused = await build();
    expect(refused.exitCode).toBe(3);
    expect(refused.stdout).toContain("  .agents/plugins/marketplace.json: not written by rmk");
    expect(existsSync(join(out(), "plugins"))).toBe(false);
  });

  it("writes nothing when a download doesn't match its sha256", async () => {
    await build();
    const before = snapshot();
    feed.codex = [{ ...skill("team.style", "1.3.0"), tampered: true }];
    feed.cursor = [skill("team.style", "1.3.0"), hook("team.fmt", "1.1.0")];
    const result = await build();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("codex/team.style@1.3.0's download doesn't match the sha256");
    expect(snapshot()).toEqual(before);
  });

  it("writes nothing when the registry can't be read", async () => {
    await build();
    const before = snapshot();
    // The first two tools' feeds answer; the last one fails.
    feed.codex = [skill("team.style", "9.0.0")];
    let calls = 0;
    const real = io.fetch;
    io.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/cursor/marketplace.json")) revoked = true;
      calls++;
      return real(input, init);
    }) as typeof fetch;
    const result = await build();
    revoked = false;
    expect(calls).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("revoked");
    expect(snapshot()).toEqual(before);
  });

  it("builds only the tools named with --tools, and leaves the others alone", async () => {
    const result = await build("--tools", "codex");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(out(), ".agents/plugins/marketplace.json"))).toBe(true);
    expect(existsSync(join(out(), ".claude-plugin"))).toBe(false);
    expect(existsSync(join(out(), "plugins/cursor"))).toBe(false);
    expect(Object.keys(json(FEED_STATE).tools)).toEqual(["codex"]);

    // Building all of them later keeps what --tools wrote, and adds the rest.
    await build();
    const before = snapshot();
    feed.codex = [skill("team.style", "2.0.0")];
    feed.cursor = [];
    await build("--tools", "codex");
    const after = snapshot();
    expect(after["plugins/cursor/team.fmt/hooks/hooks.json"]).toBe(
      before["plugins/cursor/team.fmt/hooks/hooks.json"],
    );
    expect(after[".cursor-plugin/marketplace.json"]).toBe(
      before[".cursor-plugin/marketplace.json"],
    );
    expect(Object.keys(json(FEED_STATE).tools).sort()).toEqual(["claude-code", "codex", "cursor"]);
  });

  it("needs --out, a known tool, and a token", async () => {
    expect(await rmk("feed", "build")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--out"),
    });
    expect(await build("--tools", "codex,copilot")).toMatchObject({ exitCode: 2 });
    expect(await rmk("feed")).toMatchObject({ exitCode: 2 });
    io = fakeIo(withZips(routes()));
    expect(await rmk("feed", "build", "--out", "m", "--registry", REGISTRY)).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("rmk login"),
    });
  });
});
