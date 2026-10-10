import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  exportRoutes,
  type FakeIo,
  fakeIo,
  identityRoutes,
  REGISTRY,
  type Route,
  run,
} from "@ronneai/rmk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { connectedClient, startServer } from "./testing.js";

// Workspaces over MCP (feature 095): list_workspaces, search_items' workspace, the workspace on
// items, plan_export's scopes by workspace, and where to ask to join on `not_a_member`.
let io: FakeIo;
afterEach(() => io?.cleanup());

const WORKSPACES = [
  { name: "global", description: "Everyone.", visibility: "public", global: true, role: "user" },
  { name: "acme", description: "Acme.", visibility: "private", global: false, role: "moderator" },
  { name: "tools", description: "Tools.", visibility: "public", global: false, role: null },
];

const routes: Record<string, Route> = {
  "GET /workspaces": () => ({ json: { workspaces: WORKSPACES } }),
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
};

const start = async (extra: Record<string, Route> = routes) => {
  const started = await startServer({ routes: extra });
  io = started.io;
  return started;
};

describe("list_workspaces", () => {
  it("answers what rmk workspaces prints, as data too, and is read-only", async () => {
    const { client, call } = await start();
    const tool = (await client.listTools()).tools.find((t) => t.name === "list_workspaces");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const result = await call("list_workspaces");
    expect(result.isError).toBe(false);
    expect(result.text).toBe((await run(["workspaces"], io)).stdout.trimEnd());
    expect(result.text).toContain(`(ask: ${REGISTRY}/workspaces/tools/join)`);
    expect(result.data.workspaces).toEqual(
      JSON.parse((await run(["workspaces", "--json"], io)).stdout).workspaces,
    );
    expect(result.data.workspaces).toContainEqual({
      ...WORKSPACES[2],
      joinUrl: `${REGISTRY}/workspaces/tools/join`,
    });
  });

  it("says when the registry is older than workspaces", async () => {
    const { call } = await start({});
    const result = await call("list_workspaces");
    expect(result.isError).toBe(true);
    expect(result.data).toMatchObject({ error: { code: "no_workspaces" } });
    expect(result.text).toContain("doesn't have workspaces (it's older than 0.4.0)");
  });
});

describe("search_items and get_item", () => {
  it("narrows a search to one workspace, and refuses a blank one", async () => {
    const { call } = await start({
      ...routes,
      "GET /items": () => ({
        json: {
          items: [
            {
              name: "@acme-infra/deploy",
              workspace: { name: "acme", visibility: "private" },
              type: "skill",
              description: "Deploys.",
              keywords: [],
              version: "1.0.0",
              publishedAt: "2026-09-20T00:00:00.000Z",
              deprecated: null,
              installable: true,
              risky: false,
              downloads: 0,
            },
          ],
          nextCursor: null,
        },
      }),
    });
    const found = await call("search_items", { query: "deploy", workspace: " acme " });
    expect(io.requests.at(-1)?.path).toBe("/api/v1/items?q=deploy&workspace=acme");
    expect(found.data.items).toMatchObject([
      { workspace: { name: "acme", visibility: "private" } },
    ]);
    const blank = await call("search_items", { query: "deploy", workspace: "  " });
    expect(blank.isError).toBe(true);
  });

  it("puts where to ask to join in any tool's not_a_member error", async () => {
    const { call } = await start({
      "GET /items": () => ({
        status: 403,
        json: {
          error: {
            code: "not_a_member",
            message: "You aren't a member of the acme workspace.",
            details: { workspace: "acme" },
          },
        },
      }),
    });
    const result = await call("search_items", { query: "deploy" });
    expect(result.isError).toBe(true);
    expect(result.data).toMatchObject({
      error: { code: "not_a_member", joinUrl: `${REGISTRY}/workspaces/acme/join` },
    });
  });

  it("shows the item's workspace as rmk info does", async () => {
    const { call } = await start();
    const item = await call("get_item", { name: "@acme-infra/deploy" });
    expect(item.text).toContain("workspace: acme (private)");
    expect(item.text).toBe((await run(["info", "@acme-infra/deploy"], io)).stdout.trimEnd());
  });
});

describe("plan_export and export_items", () => {
  const SCOPES = [
    { name: "tools", description: "Tools.", workspace: "tools" },
    { name: "acme-infra", description: "Acme's.", workspace: "acme" },
    { name: "shared", description: "", workspace: "global" },
  ];
  const project = async () => {
    const registry = exportRoutes({
      scopes: SCOPES,
      fail: {
        "@acme-infra/mine": {
          status: 403,
          json: {
            error: {
              code: "not_a_member",
              message: "You aren't a member of the acme workspace.",
              details: { workspace: "acme" },
            },
          },
        },
      },
    });
    io = fakeIo(
      {
        ...identityRoutes("rmk_test_token"),
        ...registry.routes,
        "GET /items/acme-infra/mine": () => ({
          status: 404,
          json: { error: { code: "item_not_found", message: "No." } },
        }),
      },
      { interactive: false, env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY } },
    );
    mkdirSync(join(io.cwd, ".claude/skills/mine"), { recursive: true });
    writeFileSync(
      join(io.cwd, ".claude/skills/mine/SKILL.md"),
      "---\nname: mine\ndescription: Mine.\n---\nBody.\n",
    );
    return connectedClient(io);
  };

  it("lists the scopes by workspace, global first", async () => {
    const { call } = await project();
    const result = await call("plan_export", { items: ["mine"] });
    expect(result.text).toContain(
      "  global › @shared\n  acme › @acme-infra  Acme's.\n  tools › @tools  Tools.\n",
    );
  });

  it("says where to ask to join when the scope's workspace isn't yours", async () => {
    const { call } = await project();
    const planned = await call("plan_export", { items: ["mine"], to: "acme-infra" });
    const result = await call("export_items", { planId: planned.data.planId });
    expect(result.isError).toBe(true);
    expect(result.data).toMatchObject({
      error: { code: "not_a_member", joinUrl: `${REGISTRY}/workspaces/acme/join` },
    });
    expect(result.text).toContain(`Ask here: ${REGISTRY}/workspaces/acme/join`);
  });
});
