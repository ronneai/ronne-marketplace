import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packItem } from "@ronneai/core/pack";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import {
  buildRegistry,
  type FakeIo,
  fakeIo,
  identityRoutes,
  REGISTRY,
  type Route,
} from "./testing.js";

// The workspace in item names (118): a project that installed `@team/fmt` before its scope moved to
// acme moves to `@acme/team/fmt`, its old tarball and all, with nothing reinstalled.
let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const read = (path: string) => readFileSync(join(io.cwd, path), "utf8");
const text = (value: string) => new TextEncoder().encode(value);

const setup = async () => {
  // Released as `@team/fmt`; its bytes keep that name after the move.
  const fmt = await packItem(
    [
      {
        path: "ronne.yaml",
        bytes: text(
          'name: "@team/fmt"\ntype: hook\ndescription: Formats.\nhook:\n  event: tool.after\n  matcher:\n    tool: edit\n  run:\n    command: "npx biome format --write"\n',
        ),
      },
    ],
    { version: "1.0.0" },
  );
  let moved = false;
  const item = { version: "1.0.0", type: "hook", sha256: fmt.sha256, dependencies: {} };
  const tarball: Route = () => ({
    bytes: fmt.tgz,
    headers: { "x-checksum-sha256": fmt.sha256, "content-type": "application/gzip" },
  });
  io = fakeIo({
    ...identityRoutes(),
    "POST /resolve": () => ({
      json: moved
        ? {
            items: { "@acme/team/fmt": item },
            warnings: [],
            renamed: { "@team/fmt": "@acme/team/fmt" },
          }
        : { items: { "@team/fmt": item }, warnings: [], renamed: {} },
    }),
    "GET /items/team/fmt/1.0.0/tarball": tarball,
    "GET /workspaces/acme/items/team/fmt/1.0.0/tarball": tarball,
  });
  await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  mkdirSync(join(io.cwd, ".claude"));
  return { move: () => (moved = true) };
};

describe("an item whose name changed (118)", () => {
  it("moves the lockfile, the state file and rmk.config.json to the new name, and says so", async () => {
    const registry = await setup();
    expect((await rmk("install", "@team/fmt")).exitCode).toBe(0);
    const settings = read(".claude/settings.json");
    registry.move();
    const result = await rmk("install");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Note: @team/fmt is now @acme/team/fmt; this project uses the new name from now on.",
    );
    expect(Object.keys(JSON.parse(read("rmk.lock")).items)).toEqual(["@acme/team/fmt"]);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({
      "@acme/team/fmt": "latest",
    });
    const state = JSON.parse(read(".rmk/state.json"));
    expect(state.entries.map((e: { item: string }) => e.item)).toEqual(["@acme/team/fmt"]);
    // The same hook, still rmk's: nothing to resolve by hand, no conflict.
    expect(read(".claude/settings.json")).toBe(settings);
    // Asks for it by its new name from then on.
    const resolves = io.requests.filter((r) => r.path === "/api/v1/resolve");
    expect(resolves.at(-1)?.body).toEqual({
      dependencies: { "@team/fmt": "latest" },
      locked: { "@team/fmt": "1.0.0" },
    });
    await rmk("install");
    expect(io.requests.filter((r) => r.path === "/api/v1/resolve").at(-1)?.body).toEqual({
      dependencies: { "@acme/team/fmt": "latest" },
      locked: { "@acme/team/fmt": "1.0.0" },
    });
  });

  it("tells the registry it reads names with a workspace", async () => {
    await setup();
    await rmk("install", "@team/fmt");
    expect(io.requests.find((r) => r.path === "/api/v1/resolve")?.headers["x-rmk-names"]).toBe(
      "workspace",
    );
  });
  it("renders an old version's dependency named by its old name (097)", async () => {
    // reviewer 1.0.0 still says `@team/secure`, which is acme's `@acme/team/secure` now.
    const { routes, packed } = await buildRegistry();
    const entry = (key: keyof typeof packed, type: string, dependencies = {}) => ({
      version: key.split("@").at(-1),
      type,
      sha256: packed[key].sha256,
      dependencies,
    });
    io = fakeIo({
      ...routes,
      "POST /resolve": () => ({
        json: {
          items: {
            "@team/reviewer": entry("@team/reviewer@1.0.0", "agent", {
              "@acme/team/secure": "1.1.0",
            }),
            "@acme/team/secure": entry("@team/secure@1.1.0", "skill", { "@team/gh": "1.2.0" }),
            "@team/gh": entry("@team/gh@1.2.0", "mcp-server"),
          },
          warnings: [],
          renamed: { "@team/secure": "@acme/team/secure" },
        },
      }),
      "GET /workspaces/acme/items/team/secure/1.1.0/tarball": () => ({
        bytes: packed["@team/secure@1.1.0"].tgz,
        headers: { "x-checksum-sha256": packed["@team/secure@1.1.0"].sha256 },
      }),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    mkdirSync(join(io.cwd, ".claude"));
    const result = await rmk("install", "@team/reviewer");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(read(".claude/agents/reviewer.md")).toContain("skills:\n  - secure\n---");
  });
});

describe("rmk's other commands across a rename (118)", () => {
  /** @team/secure installed (with @team/gh), then secure moves to acme. */
  const moved = async () => {
    const { routes, packed } = await buildRegistry();
    let after = false;
    const entry = (key: keyof typeof packed, type: string, dependencies = {}) => ({
      version: key.split("@").at(-1),
      type,
      sha256: packed[key].sha256,
      dependencies,
    });
    const secure = (name: string) => ({
      [name]: entry("@team/secure@1.1.0", "skill", { "@team/gh": "1.2.0" }),
      "@team/gh": entry("@team/gh@1.2.0", "mcp-server"),
    });
    io = fakeIo({
      ...routes,
      "POST /resolve": ({ body }) => {
        const asked = Object.keys((body as { dependencies: Record<string, string> }).dependencies);
        return {
          json: after
            ? {
                items: asked.length ? secure("@acme/team/secure") : {},
                warnings: [],
                renamed: { "@team/secure": "@acme/team/secure" },
              }
            : { items: asked.length ? secure("@team/secure") : {}, warnings: [], renamed: {} },
        };
      },
      "GET /workspaces/acme/items/team/secure": () => ({
        json: {
          name: "@acme/team/secure",
          tags: { latest: "1.1.0" },
          versions: [{ version: "1.1.0", yanked: false }],
        },
      }),
      "GET /workspaces/acme/items/team/secure/1.1.0/tarball": () => ({
        bytes: packed["@team/secure@1.1.0"].tgz,
        headers: { "x-checksum-sha256": packed["@team/secure@1.1.0"].sha256 },
      }),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    mkdirSync(join(io.cwd, ".claude"));
    expect((await rmk("install", "@team/secure")).exitCode).toBe(0);
    after = true;
  };

  it("rewrites an agent's managed marker in the same apply, at the same path", async () => {
    const { routes, packed } = await buildRegistry();
    let after = false;
    const entry = (key: keyof typeof packed, type: string, dependencies = {}) => ({
      version: key.split("@").at(-1),
      type,
      sha256: packed[key].sha256,
      dependencies,
    });
    const items = (reviewer: string) => ({
      [reviewer]: entry("@team/reviewer@1.0.0", "agent", { "@team/secure": "1.1.0" }),
      "@team/secure": entry("@team/secure@1.1.0", "skill", { "@team/gh": "1.2.0" }),
      "@team/gh": entry("@team/gh@1.2.0", "mcp-server"),
    });
    io = fakeIo({
      ...routes,
      "POST /resolve": () => ({
        json: after
          ? {
              items: items("@acme/team/reviewer"),
              warnings: [],
              renamed: { "@team/reviewer": "@acme/team/reviewer" },
            }
          : { items: items("@team/reviewer"), warnings: [], renamed: {} },
      }),
      "GET /workspaces/acme/items/team/reviewer/1.0.0/tarball": () => ({
        bytes: packed["@team/reviewer@1.0.0"].tgz,
        headers: { "x-checksum-sha256": packed["@team/reviewer@1.0.0"].sha256 },
      }),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    mkdirSync(join(io.cwd, ".claude"));
    expect((await rmk("install", "@team/reviewer")).exitCode).toBe(0);
    expect(read(".claude/agents/reviewer.md")).toContain("managed by rmk: @team/reviewer@1.0.0");
    after = true;
    const result = await rmk("update");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Note: @team/reviewer is now @acme/team/reviewer");
    expect(read(".claude/agents/reviewer.md")).toContain(
      "managed by rmk: @acme/team/reviewer@1.0.0",
    );
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({
      "@acme/team/reviewer": "latest",
    });
  });

  it("says in outdated what the item is called now, with the version its range takes", async () => {
    await moved();
    const result = await rmk("outdated", "--json");
    expect(JSON.parse(result.stdout).items).toEqual([
      {
        item: "@team/secure",
        now: "@acme/team/secure",
        range: "latest",
        locked: "1.1.0",
        wanted: "1.1.0",
        latest: "1.1.0",
      },
    ]);
    const said = await rmk("outdated");
    expect(said.stdout).toContain(
      "Note: @team/secure is now @acme/team/secure; rmk update moves this project to the new name.",
    );
    // It only reads: the project keeps the old name until an update.
    expect(Object.keys(JSON.parse(read("rmk.lock")).items)).toContain("@team/secure");
  });

  it("updates and removes by the new name, or @global/… written out, before the rewrite", async () => {
    await moved();
    expect((await rmk("update", "@acme/team/secure")).exitCode).toBe(0);
    expect((await rmk("remove", "@global/acme/team/secure")).exitCode).toBe(2);
    expect((await rmk("remove", "@acme/team/secure")).exitCode).toBe(0);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({});
  });
});

describe("names written with @global/ (118)", () => {
  it("installs, updates and removes them under their short form", async () => {
    const { routes } = await buildRegistry();
    io = fakeIo(routes);
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    mkdirSync(join(io.cwd, ".claude"));
    expect((await rmk("install", "@global/team/secure")).exitCode).toBe(0);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({ "@team/secure": "latest" });
    expect((await rmk("update", "@global/team/secure")).exitCode).toBe(0);
    expect((await rmk("remove", "@global/team/secure")).exitCode).toBe(0);
    expect(JSON.parse(read("rmk.config.json")).dependencies).toEqual({});
  });
});

describe("rmk search --scope (118)", () => {
  it("filters by a workspace's scope as both filters, and by a bare scope in any workspace", async () => {
    io = fakeIo({
      ...identityRoutes(),
      "GET /items": () => ({ json: { items: [], nextCursor: null } }),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    await rmk("search", "lint", "--scope", "@acme/team");
    await rmk("search", "lint", "--scope", "@team");
    const queries = io.requests
      .filter((r) => r.path.startsWith("/api/v1/items"))
      .map((r) => r.path.split("?")[1]);
    expect(queries).toEqual(["q=lint&scope=team&workspace=acme", "q=lint&scope=team"]);
    const both = await rmk("search", "lint", "--workspace", "tools", "--scope", "@acme/team");
    expect(both.exitCode).toBe(2);
    expect(both.stderr).toContain("--scope @acme/team is in acme, not tools.");
  });
});
