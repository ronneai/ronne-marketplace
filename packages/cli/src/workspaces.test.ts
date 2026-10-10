import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { byWorkspace } from "./export-command.js";
import {
  exportRoutes,
  type FakeIo,
  fakeIo,
  identityRoutes,
  REGISTRY,
  type Route,
} from "./testing.js";

// Workspaces in rmk (feature 095): `rmk workspaces`, `search --workspace`, `info`, export's scope
// prompt by workspace, and where to ask to join when the registry says you aren't a member.
let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const env = { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY };

const WORKSPACES = [
  { name: "global", description: "Everyone.", visibility: "public", global: true, role: "user" },
  { name: "acme", description: "Acme.", visibility: "private", global: false, role: "moderator" },
  { name: "tools", description: "Tools.", visibility: "public", global: false, role: null },
];

const routes: Record<string, Route> = {
  ...identityRoutes(),
  "GET /workspaces": () => ({ json: { workspaces: WORKSPACES } }),
  "GET /items": () => ({ json: { items: [], nextCursor: null } }),
  "GET /items/acme-infra/deploy": () => ({
    json: {
      name: "@acme-infra/deploy",
      workspace: { name: "acme", visibility: "private" },
      type: "skill",
      description: "Deploys.",
      owner: "Ada",
      downloads: 1,
      tags: {},
      versions: [],
    },
  }),
  "GET /items/tools/fmt": () => ({
    json: {
      name: "@tools/fmt",
      workspace: { name: "tools", visibility: "public" },
      type: "skill",
      description: "Formats.",
      owner: "Ada",
      downloads: 1,
      tags: {},
      versions: [],
    },
  }),
};

describe("rmk workspaces", () => {
  it("lists the workspaces you see with your role, and where to ask where you aren't a member", async () => {
    io = fakeIo(routes, { env });
    const result = await rmk("workspaces");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      [
        "WORKSPACE  VISIBILITY  YOUR ROLE",
        "global     public      user",
        "acme       private     moderator",
        `tools      public      —   (ask: ${REGISTRY}/workspaces/tools/join)`,
        "",
      ].join("\n"),
    );
    const json = JSON.parse((await rmk("workspaces", "--json")).stdout);
    expect(json.workspaces).toEqual([
      { ...WORKSPACES[0], joinUrl: null },
      { ...WORKSPACES[1], joinUrl: null },
      { ...WORKSPACES[2], joinUrl: `${REGISTRY}/workspaces/tools/join` },
    ]);
  });

  it("says when the registry is older than workspaces", async () => {
    io = fakeIo(identityRoutes(), { env });
    const result = await rmk("workspaces");
    expect(result).toMatchObject({
      exitCode: 1,
      stderr: "This registry doesn't have workspaces (it's older than 0.4.0).\n",
    });
    expect(JSON.parse((await rmk("workspaces", "--json")).stdout).error.code).toBe("no_workspaces");
  });

  it("needs a login", async () => {
    io = fakeIo(routes);
    expect((await rmk("workspaces")).exitCode).not.toBe(0);
    expect(io.requests).toEqual([]);
  });
});

describe("rmk search --workspace and rmk info", () => {
  it("narrows a search to one workspace, and refuses two", async () => {
    io = fakeIo(routes, { env });
    await rmk("search", "deploy", "--workspace", "acme");
    expect(io.requests.at(-1)?.path).toBe("/api/v1/items?q=deploy&workspace=acme");
    await rmk("search", "deploy");
    expect(io.requests.at(-1)?.path).toBe("/api/v1/items?q=deploy");
    const two = await rmk("search", "deploy", "--workspace", "acme", "--workspace", "tools");
    expect(two).toMatchObject({ exitCode: 2, stderr: expect.stringContaining("one workspace") });
    const blank = await rmk("search", "deploy", "--workspace", "  ");
    expect(blank).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("which workspace"),
    });
  });

  it("shows the item's workspace, and says when it's private", async () => {
    io = fakeIo(routes, { env });
    expect((await rmk("info", "@acme-infra/deploy")).stdout).toContain(
      "@acme-infra/deploy  skill  Deploys.\nworkspace: acme (private)\nowner: Ada",
    );
    expect((await rmk("info", "@tools/fmt")).stdout).toContain(
      "@tools/fmt  skill  Formats.\nworkspace: tools\nowner: Ada",
    );
  });
});

describe("rmk export and workspaces", () => {
  const setup = (scopes: { name: string; description: string; workspace?: string }[]) => {
    const registry = exportRoutes({
      scopes,
      fail: {
        // Its full name names its workspace (118).
        "@acme/acme-infra/review": {
          status: 403,
          json: {
            error: {
              code: "not_a_member",
              message:
                "You aren't a member of the acme workspace. Ask to join acme to propose changes.",
              details: { workspace: "acme" },
            },
          },
        },
      },
    });
    io = fakeIo(
      {
        ...identityRoutes(),
        ...registry.routes,
        "GET /workspaces/acme/items/acme-infra/review": () => ({
          status: 404,
          json: { error: { code: "item_not_found", message: "No." } },
        }),
        "GET /items/tools/review": () => ({
          status: 404,
          json: { error: { code: "item_not_found", message: "No." } },
        }),
      },
      { env },
    );
    const path = join(io.cwd, ".claude/skills/review/SKILL.md");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\nname: review\ndescription: Reviews.\n---\nBody.\n");
    return registry;
  };

  it("asks for the scope by workspace, global first, and takes the number shown", async () => {
    const { drafts } = setup([
      { name: "tools", description: "Tools.", workspace: "tools" },
      { name: "acme-infra", description: "Acme's.", workspace: "acme" },
      { name: "shared", description: "", workspace: "global" },
    ]);
    io.answers.push("2", "y");
    const result = await rmk("export", "review");
    expect(io.questions[0]).toContain(
      "  1. global › @shared\n  2. acme › @acme-infra  Acme's.\n  3. tools › @tools  Tools.\n",
    );
    expect(result.stderr).toContain(
      `You aren't a member of the acme workspace. Ask to join acme to propose changes. Ask here: ${REGISTRY}/workspaces/acme/join`,
    );
    expect(drafts).toEqual([]);
  });

  it("reads a scope's name as global's, and @workspace/scope as that workspace's (118)", async () => {
    for (const [answer, name] of [
      ["infra", "@infra/review"],
      ["@acme/infra", "@acme/infra/review"],
    ]) {
      const { drafts } = setup([
        { name: "infra", description: "", workspace: "global" },
        { name: "infra", description: "", workspace: "acme" },
      ]);
      io.answers.push(answer ?? "", "y");
      await rmk("export", "review");
      expect(drafts.map((d) => d.name)).toEqual([name]);
    }
  });

  it("lists the scopes as they come from a registry older than workspaces", () => {
    const scopes = [
      { name: "team", description: "A team." },
      { name: "platform", description: "Shared tools." },
    ];
    expect(byWorkspace(scopes)).toEqual(scopes);
  });

  it("puts the join address in --json's error", async () => {
    setup([{ name: "acme-infra", description: "Acme's.", workspace: "acme" }]);
    const result = await rmk("export", "review", "--to", "@acme/acme-infra", "--yes", "--json");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "not_a_member",
        workspace: "acme",
        joinUrl: `${REGISTRY}/workspaces/acme/join`,
      },
    });
  });
});
