import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import {
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../domains/workspaces/models/workspace";
import { kyselyWorkspaceRepository } from "../domains/workspaces/repositories/kysely-workspace-repository";
import { localStorage } from "../storage/local-storage";
import { type FeedsApiDeps, getMarketplace, getPluginZip } from "./feeds-api";

// The plugin feeds with a private workspace (093): each caller's marketplace holds what they see,
// cached per visibility key; a git mirror (`?workspaces=`) gets the public workspaces and the
// private ones it names.
let t: TestDb;
let storageRoot: string;
let deps: FeedsApiDeps;
let acme: string;
let memberId: string;
let release: (scope: string, workspaceId: string, name: string) => Promise<void>;
const tokens: Record<"member" | "betaMember" | "outsider" | "root", string> = {
  member: "",
  betaMember: "",
  outsider: "",
  root: "",
};
const BASE = "https://registry.example.com/api/v1/feeds";
const password = "correct horse battery";
const text = (value: string) => new TextEncoder().encode(value);

const tokenFor = async (app: AppAuth, email: string) => {
  const result = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!result.ok) throw new Error("no token");
  return result.token.token;
};

beforeEach(async () => {
  t = await createTestDb();
  const app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-private-feeds-"));
  const storage = localStorage(storageRoot);
  deps = {
    app,
    storage,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
    publicUrl: () => "https://registry.example.com",
  };
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  memberId = await createTestUser(app, { email: "m@example.com", password });
  await createTestUser(app, { email: "o@example.com", password });
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, memberId, "user", acme);
  const betaMemberId = await createTestUser(app, { email: "b@example.com", password });
  const beta = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "beta",
    description: "Beta.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, betaMemberId, "moderator", beta);
  const scopes = kyselyScopeRepository(t.db, t.dialect, UNFILTERED);
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  release = async (scope, workspaceId, name) => {
    const scopeId = await scopes.insert({
      name: scope,
      description: "A scope.",
      workspaceId,
      createdBy: null,
      createdAt: new Date(),
    });
    const files = [
      {
        path: "ronne.yaml",
        bytes: text(
          `name: "@${scope}/${name}"\ntype: skill\ndescription: A skill.\nskill:\n  entry: SKILL.md\n`,
        ),
      },
      {
        path: "SKILL.md",
        bytes: text(`---\nname: ${name}\ndescription: A skill.\n---\nDo it.\n`),
      },
    ];
    const packed = await packItem(files, { version: "1.0.0" });
    const artifactPath = `${scope}/${name}/1.0.0.tgz`;
    await storage.put(artifactPath, packed.tgz);
    const itemId = await items.insertItem({
      scopeId,
      name,
      type: "skill",
      description: "A skill.",
      ownerId: rootId,
      createdAt: new Date(),
    });
    const versionId = await items.insertVersion({
      itemId,
      version: "1.0.0",
      manifest: {
        name: `@${scope}/${name}`,
        type: "skill",
        description: "A skill.",
        version: "1.0.0",
      },
      readme: null,
      files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
      notes: null,
      artifactPath,
      sha256: packed.sha256,
      size: packed.size,
      publishedBy: rootId,
      publishedAt: new Date(),
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
    await items.setTag(itemId, "latest", versionId);
  };
  await release("team", GLOBAL_WORKSPACE_ID, "style");
  await release("acme-infra", acme, "deploy");
  await release("beta-tools", beta, "lint");
  tokens.member = await tokenFor(app, "m@example.com");
  tokens.betaMember = await tokenFor(app, "b@example.com");
  tokens.outsider = await tokenFor(app, "o@example.com");
  tokens.root = await tokenFor(app, "root@example.com");
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const get = (path: string, token: string) =>
  new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });

/** The plugin names in `who`'s marketplace for `tool`, with `query` on the address. */
const plugins = async (who: keyof typeof tokens, query = "", tool = "claude-code") => {
  const response = await getMarketplace(
    get(`/${tool}/marketplace.json${query}`, tokens[who]),
    { tool },
    deps,
  );
  expect(response.status).toBe(200);
  return (await response.json()).plugins.map((p: { name: string }) => p.name);
};

const zip = (who: keyof typeof tokens, scope: string, name: string) =>
  getPluginZip(
    get(`/claude-code/plugins/${scope}/${name}/1.0.0.zip`, tokens[who]),
    { tool: "claude-code", scope, name, file: "1.0.0.zip" },
    deps,
  );

const downloads = async () =>
  (await kyselyItemRepository(t.db, t.dialect, UNFILTERED).findByName("acme-infra", "deploy"))
    ?.downloadCount;

describe("the plugin feeds and a private workspace (093)", () => {
  it("gives each caller a marketplace of what they see, from a cache that keeps them apart", async () => {
    // The member's marketplace is built and cached first; the outsider's must not be it.
    expect(await plugins("member")).toEqual(["acme-infra.deploy", "team.style"]);
    expect(await plugins("outsider")).toEqual(["team.style"]);
    expect(await plugins("member")).toEqual(["acme-infra.deploy", "team.style"]);
    expect(await plugins("root")).toEqual(["acme-infra.deploy", "beta-tools.lint", "team.style"]);
    // Two private keys share nothing: acme's member and beta's each get only their own.
    for (const tool of ["claude-code", "codex", "cursor"]) {
      expect(await plugins("member", "", tool)).toEqual(["acme-infra.deploy", "team.style"]);
      expect(await plugins("betaMember", "", tool)).toEqual(["beta-tools.lint", "team.style"]);
      expect(await plugins("outsider", "", tool)).toEqual(["team.style"]);
      expect(await plugins("member", "", tool)).toEqual(["acme-infra.deploy", "team.style"]);
    }
    expect((await zip("member", "beta-tools", "lint")).status).toBe(404);
    expect((await zip("betaMember", "beta-tools", "lint")).status).toBe(200);
  });

  it("serves a private item's zip to a member, and to an outsider as an unknown one, uncounted", async () => {
    expect((await zip("member", "acme-infra", "deploy")).status).toBe(200);
    expect(await downloads()).toBe(1);
    // HEAD and a matching If-None-Match never reach the download: they mustn't answer either.
    const stored = await zip("member", "acme-infra", "deploy");
    const etag = stored.headers.get("etag") ?? "";
    const path = "/claude-code/plugins/acme-infra/deploy/1.0.0.zip";
    const params = { tool: "claude-code", scope: "acme-infra", name: "deploy", file: "1.0.0.zip" };
    const head = await getPluginZip(
      new Request(`${BASE}${path}`, {
        method: "HEAD",
        headers: { authorization: `Bearer ${tokens.outsider}` },
      }),
      params,
      deps,
    );
    const matching = await getPluginZip(
      new Request(`${BASE}${path}`, {
        headers: { authorization: `Bearer ${tokens.outsider}`, "if-none-match": etag },
      }),
      params,
      deps,
    );
    expect([head.status, matching.status, matching.headers.get("etag")]).toEqual([404, 404, null]);
    expect(await downloads()).toBe(2);
    const hidden = await zip("outsider", "acme-infra", "deploy");
    const unknown = await zip("outsider", "acme-infra", "nothing-here");
    expect(hidden.status).toBe(404);
    expect((await hidden.text()).replaceAll("deploy", "X")).toBe(
      (await unknown.text()).replaceAll("nothing-here", "X"),
    );
    expect(await downloads()).toBe(2);
  });

  it("leaves a removed member's private items out from the next request", async () => {
    expect(await plugins("member")).toEqual(["acme-infra.deploy", "team.style"]);
    await t.db
      .deleteFrom("workspace_members")
      .where("workspace_id", "=", acme)
      .where("user_id", "=", memberId)
      .execute();
    expect(await plugins("member")).toEqual(["team.style"]);
    expect((await zip("member", "acme-infra", "deploy")).status).toBe(404);
  });

  it("gives a mirror the public workspaces, and the private ones it names that the caller sees", async () => {
    expect(await plugins("member", "?workspaces=")).toEqual(["team.style"]);
    expect(await plugins("member", "?workspaces=acme")).toEqual([
      "acme-infra.deploy",
      "team.style",
    ]);
    expect(await plugins("member", "?workspaces=global")).toEqual(["team.style"]);
    expect(await plugins("root", "?workspaces=")).toEqual(["team.style"]);
    expect(await plugins("root", "?workspaces=acme")).toEqual(["acme-infra.deploy", "team.style"]);
    // Asked first by the member, the public-only marketplace isn't the member's full one.
    expect(await plugins("member")).toEqual(["acme-infra.deploy", "team.style"]);
  });

  it("gives an rmk that doesn't name workspaces (one from before 093) the public ones only", async () => {
    const asRmk = async (query: string) => {
      const response = await getMarketplace(
        new Request(`${BASE}/claude-code/marketplace.json${query}`, {
          headers: { authorization: `Bearer ${tokens.member}`, "user-agent": "rmk/0.3.2" },
        }),
        { tool: "claude-code" },
        deps,
      );
      return (await response.json()).plugins.map((p: { name: string }) => p.name);
    };
    expect(await asRmk("")).toEqual(["team.style"]);
    expect(await asRmk("?workspaces=acme")).toEqual(["acme-infra.deploy", "team.style"]);
    expect(await plugins("member")).toEqual(["acme-infra.deploy", "team.style"]);
  });

  it("refuses a mirror of a workspace the caller doesn't see exactly as an unknown one", async () => {
    const ask = async (name: string) => {
      const response = await getMarketplace(
        get(`/claude-code/marketplace.json?workspaces=${name}`, tokens.outsider),
        { tool: "claude-code" },
        deps,
      );
      return `${response.status} ${(await response.text()).replaceAll(name, "X")}`;
    };
    const hidden = await ask("acme");
    expect(hidden).toMatch(/^404 .*"workspace_not_found"/);
    expect(hidden).toBe(await ask("nosuch"));
    // A name that can't be a workspace's is unknown too, for anyone: never looked up, so a NUL
    // can't fail on PostgreSQL, nor "acmé" match "acme" under MySQL's collation.
    for (const odd of ["acme%00", "acm%C3%A9"]) {
      const response = await getMarketplace(
        get(`/claude-code/marketplace.json?workspaces=${odd}`, tokens.member),
        { tool: "claude-code" },
        deps,
      );
      expect(response.status, odd).toBe(404);
      expect((await response.json()).error.code, odd).toBe("workspace_not_found");
    }
  });

  it("never caches a marketplace from before Make private under the revision after it", async () => {
    const open = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
      name: "open",
      description: "Open.",
      visibility: "public",
      createdBy: null,
      createdAt: new Date(),
    });
    await release("open-tools", open, "secret");
    expect(await plugins("outsider")).toEqual(["open-tools.secret", "team.style"]);
    // Root makes `open` private just after this request has read who it is (every workspace's
    // visibility), before it builds: the worst moment for the cache.
    let turned = false;
    const app = deps.app;
    if (!app) throw new Error("no app");
    const racing = {
      ...app,
      db: app.db.withPlugin({
        transformQuery: (args) => args.node,
        transformResult: async (args) => {
          const row = args.result.rows[0] as Record<string, unknown> | undefined;
          const keys = row ? Object.keys(row).sort().join(",") : "";
          if (!turned && keys === "id,visibility") {
            turned = true;
            await kyselyWorkspaceRepository(t.db, t.dialect).setVisibility(
              open,
              "private",
              new Date(),
            );
          }
          return args.result;
        },
      }),
    };
    await getMarketplace(
      get("/claude-code/marketplace.json", tokens.outsider),
      { tool: "claude-code" },
      { ...deps, app: racing },
    );
    expect(turned).toBe(true);
    expect(await plugins("outsider")).toEqual(["team.style"]);
  });
});
