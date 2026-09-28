import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY, type Route } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);

const summary = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  type: "skill",
  description: `The ${name} item.`,
  keywords: [],
  version: "1.2.0",
  publishedAt: "2026-09-20T10:00:00.000Z",
  deprecated: null,
  installable: true,
  risky: false,
  downloads: 3,
  ...extra,
});

const catalogueRoutes: Record<string, Route> = {
  ...identityRoutes(),
  "GET /items": ({ url }) => ({
    json: {
      items: [
        summary("@team/fmt", { risky: true }),
        ...(url.searchParams.get("type") === "skill"
          ? []
          : [summary("@team/gone", { type: "hook", installable: false, deprecated: "Old." })]),
      ].filter(
        (i) => !url.searchParams.get("q") || i.name.includes(url.searchParams.get("q") ?? ""),
      ),
      nextCursor: null,
    },
  }),
  "GET /items/team/fmt": () => ({
    json: {
      name: "@team/fmt",
      type: "skill",
      description: "Formats.",
      owner: "Ada",
      downloads: 3,
      tags: { latest: "1.2.0", next: "2.0.0-beta.1" },
      versions: [
        {
          version: "2.0.0-beta.1",
          publishedAt: "2026-09-21T00:00:00.000Z",
          sha256: "b",
          size: 1,
          deprecated: null,
          yanked: true,
          dependencies: {},
        },
        {
          version: "1.2.0",
          publishedAt: "2026-09-20T00:00:00.000Z",
          sha256: "a",
          size: 1,
          deprecated: null,
          yanked: false,
          dependencies: { "@team/mcp": "^1.0.0" },
        },
      ],
    },
  }),
  "GET /items/team/fmt/1.2.0": () => ({
    json: {
      version: "1.2.0",
      publishedAt: "2026-09-20T00:00:00.000Z",
      sha256: "a",
      size: 1,
      deprecated: null,
      yanked: false,
      dependencies: { "@team/mcp": "^1.0.0" },
      readme: null,
      notes: null,
      riskFlags: [{ kind: "network", message: "It mentions `example.com`." }],
    },
  }),
};

const loggedIn = async () => {
  io = fakeIo(catalogueRoutes);
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  io.requests.length = 0;
};

describe("rmk search and info", () => {
  it("searches with the type and scope filters, and marks risk, deprecation and uninstallable items", async () => {
    await loggedIn();
    const all = await rmk("search", "team", "--scope", "@team");
    expect(all.stdout).toBe(
      "@team/fmt@1.2.0  skill  The @team/fmt item.  [risk]\n@team/gone@1.2.0  hook  The @team/gone item.  [deprecated] [no installable version]\n",
    );
    expect(io.requests[0]?.path).toBe("/api/v1/items?q=team&scope=team");
    expect((await rmk("search", "team", "--type", "skill")).stdout).not.toContain("gone");
    expect((await rmk("search", "zzz")).stdout).toBe('Nothing matches "zzz".\n');
    expect(JSON.parse((await rmk("search", "fmt", "--json")).stdout).items).toHaveLength(1);
    expect(await rmk("search")).toMatchObject({ exitCode: 2 });
  });

  it("shows an item's tags, versions and the latest version's dependencies and risks", async () => {
    await loggedIn();
    const { stdout } = await rmk("info", "@team/fmt");
    expect(stdout).toContain(
      "@team/fmt  skill  Formats.\nowner: Ada  downloads: 3\ntags: latest → 1.2.0, next → 2.0.0-beta.1\n",
    );
    expect(stdout).toContain("  2.0.0-beta.1  2026-09-21  [yanked]\n  1.2.0  2026-09-20\n");
    expect(stdout).toContain(
      "1.2.0: @team/mcp ^1.0.0\nwhat it can do: It mentions `example.com`.\n",
    );
    expect(io.requests.map((r) => r.path)).toEqual([
      "/api/v1/items/team/fmt",
      "/api/v1/items/team/fmt/1.2.0",
    ]);
    expect((await rmk("info", "@team/fmt@latest", "--json")).stdout).toContain(
      '"version":{"version":"1.2.0"',
    );
    expect(await rmk("info", "fmt")).toMatchObject({ exitCode: 2 });
    expect(await rmk("info", "@team/nope")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("No route"),
    });
  });
});

describe("rmk list and platforms", () => {
  it("lists what the project asks for, and what's installed from the lockfile", async () => {
    io = fakeIo({});
    expect((await rmk("list")).stdout).toContain("asks for nothing yet");
    expect((await rmk("list", "--installed")).stdout).toContain("no rmk.lock");
    writeFileSync(
      join(io.cwd, "rmk.config.json"),
      JSON.stringify({ version: 1, dependencies: { "@team/fmt": "latest", "@team/a": "^1.0.0" } }),
    );
    writeFileSync(
      join(io.cwd, "rmk.lock"),
      JSON.stringify({
        version: 1,
        registry: REGISTRY,
        items: { "@team/fmt": { version: "1.2.0", type: "skill", sha256: "a" } },
      }),
    );
    expect((await rmk("list")).stdout).toBe("@team/fmt  latest\n@team/a  ^1.0.0\n");
    expect((await rmk("list", "--installed")).stdout).toBe("@team/fmt@1.2.0  skill\n");
    expect(JSON.parse((await rmk("list", "--installed", "--json")).stdout)).toEqual({
      ok: true,
      installed: { "@team/fmt": { version: "1.2.0", type: "skill" } },
    });
    writeFileSync(join(io.cwd, "rmk.lock"), "{not json");
    expect(await rmk("list", "--installed")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("isn't valid JSON"),
    });
  });

  it("lists the built-in renderers and what each supports", async () => {
    io = fakeIo({});
    const { stdout } = await rmk("platforms");
    expect(stdout).toContain("claude-code  Claude Code  (renderer 1.0.0)\n");
    expect(stdout).toContain("  degraded: lsp-server\n");
    const json = JSON.parse((await rmk("platforms", "--json")).stdout);
    expect(json.platforms[0]).toMatchObject({
      id: "claude-code",
      supports: { skill: "native", "lsp-server": "degraded" },
    });
  });
});
