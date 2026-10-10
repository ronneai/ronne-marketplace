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
import { kyselyWorkspaceRepository } from "../domains/workspaces/repositories/kysely-workspace-repository";
import { localStorage } from "../storage/local-storage";
import type { StorageAdapter } from "../storage/storage-adapter";
import { getMe, getWorkspaces } from "./api-v1";
import { getScopes } from "./drafts-api";
import {
  getItem,
  getTarball,
  getVersion,
  listItems,
  postResolve,
  type RegistryApiDeps,
} from "./registry-api";

// The registry API with a private workspace (093): to a token whose user isn't a member, a private
// item answers exactly as an unknown name does (404, the same code and message); a member's token
// gets the data. The MCP server and rmk read through this API.
let t: TestDb;
let storageRoot: string;
let storage: StorageAdapter;
let deps: RegistryApiDeps;
let member: string;
let outsider: string;
let root: string;
let plain: string;
let app: AppAuth;
const BASE = "http://localhost:3000/api/v1";
const password = "correct horse battery";

const tokenFor = async (app: AppAuth, email: string) => {
  const result = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!result.ok) throw new Error("no token");
  return result.token.token;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-private-api-"));
  storage = localStorage(storageRoot);
  deps = {
    app,
    storage,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
  };
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  const memberId = await createTestUser(app, { email: "m@example.com", password });
  await createTestUser(app, { email: "o@example.com", password, role: "moderator" });
  await createTestUser(app, { email: "p@example.com", password });
  const acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, memberId, "user", acme);
  const scopeId = await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name: "acme-infra",
    description: "Acme's.",
    workspaceId: acme,
    createdBy: null,
    createdAt: new Date(),
  });
  const text = (value: string) => new TextEncoder().encode(value);
  const files = [
    {
      path: "ronne.yaml",
      bytes: text(
        'name: "@acme-infra/deploy"\ntype: skill\ndescription: Deploys.\nskill:\n  entry: SKILL.md\n',
      ),
    },
    { path: "SKILL.md", bytes: text("---\nname: deploy\ndescription: Deploys.\n---\n\nDo it.\n") },
  ];
  const packed = await packItem(files, { version: "1.0.0" });
  await storage.put("acme-infra/deploy/1.0.0.tgz", packed.tgz);
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name: "deploy",
    type: "skill",
    description: "Deploys.",
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: {
      name: "@acme-infra/deploy",
      type: "skill",
      description: "Deploys.",
      version: "1.0.0",
    },
    readme: null,
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: null,
    artifactPath: "acme-infra/deploy/1.0.0.tgz",
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  member = await tokenFor(app, "m@example.com");
  outsider = await tokenFor(app, "o@example.com");
  root = await tokenFor(app, "root@example.com");
  plain = await tokenFor(app, "p@example.com");
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const get = (path: string, token: string) =>
  new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
const post = (path: string, token: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
/** A response's status and body, the name masked, to compare a private item with an unknown one. */
const answer = async (response: Response, name: string) =>
  `${response.status} ${(await response.text()).replaceAll(name, "X")}`;

const asks = {
  // Outside global, an item's paths name its workspace (118).
  item: (name: string, token: string) =>
    getItem(
      get(`/workspaces/acme/items/acme-infra/${name}`, token),
      { workspace: "acme", scope: "acme-infra", name },
      deps,
    ),
  version: (name: string, token: string) =>
    getVersion(
      get(`/workspaces/acme/items/acme-infra/${name}/1.0.0`, token),
      { workspace: "acme", scope: "acme-infra", name, version: "1.0.0" },
      deps,
    ),
  tarball: (name: string, token: string) =>
    getTarball(
      get(`/workspaces/acme/items/acme-infra/${name}/1.0.0/tarball`, token),
      { workspace: "acme", scope: "acme-infra", name, version: "1.0.0" },
      deps,
    ),
  resolve: (name: string, token: string) =>
    postResolve(
      post("/resolve", token, { dependencies: { [`@acme/acme-infra/${name}`]: "^1.0.0" } }),
      deps,
    ),
};

describe("the registry API and a private workspace (093)", () => {
  it("answers a non-member's item, version, tarball and resolve exactly as for an unknown name", async () => {
    for (const [what, ask] of Object.entries(asks)) {
      const hidden = await answer(await ask("deploy", outsider), "deploy");
      expect(hidden, what).toMatch(/^404 /);
      expect(hidden, what).toBe(await answer(await ask("nothing-here", outsider), "nothing-here"));
    }
    // An unknown scope answers the same too.
    const unknownScope = await getItem(
      get("/items/nosuch/deploy", outsider),
      { scope: "nosuch", name: "deploy" },
      deps,
    );
    expect(await answer(unknownScope, "nosuch")).toBe(
      await answer(await asks.item("deploy", outsider), "acme/acme-infra"),
    );
    // And an unknown workspace (118).
    const unknownWorkspace = await getItem(
      get("/workspaces/nosuch/items/acme-infra/deploy", outsider),
      { workspace: "nosuch", scope: "acme-infra", name: "deploy" },
      deps,
    );
    expect(await answer(unknownWorkspace, "nosuch/acme-infra")).toBe(
      await answer(await asks.item("deploy", outsider), "acme/acme-infra"),
    );
  });

  it("gives a member the item, its version, its tarball and its resolution", async () => {
    for (const [what, ask] of Object.entries(asks))
      expect((await ask("deploy", member)).status, what).toBe(200);
  });

  it("leaves it out of a non-member's search and scopes, and puts it in a member's", async () => {
    const names = async (token: string) =>
      (await (await listItems(get("/items?q=deploy", token), deps)).json()).items.map(
        (i: { name: string }) => i.name,
      );
    expect(await names(outsider)).toEqual([]);
    expect(await names(member)).toEqual(["@acme/acme-infra/deploy"]);
    const scopes = async (token: string) =>
      (await (await getScopes(get("/scopes", token), deps)).json()).scopes.map(
        (s: { name: string }) => s.name,
      );
    expect(await scopes(outsider)).not.toContain("acme-infra");
    expect(await scopes(plain)).not.toContain("acme-infra");
    expect(await scopes(member)).toContain("acme-infra");
    expect(await scopes(root)).toContain("acme-infra");
    expect(await names(plain)).toEqual([]);
    expect(await names(root)).toEqual(["@acme/acme-infra/deploy"]);
  });

  it("doesn't count a non-member's download of it", async () => {
    await asks.tarball("deploy", outsider);
    const row = await t.db.selectFrom("items").select("download_count").executeTakeFirstOrThrow();
    expect(Number(row.download_count)).toBe(0);
    await asks.tarball("deploy", member);
    const after = await t.db.selectFrom("items").select("download_count").executeTakeFirstOrThrow();
    expect(Number(after.download_count)).toBe(1);
  });
});

describe("workspaces in the API (095)", () => {
  beforeEach(async () => {
    await kyselyWorkspaceRepository(t.db, t.dialect).insert({
      name: "tools",
      description: "Tools.",
      visibility: "public",
      createdBy: null,
      createdAt: new Date(),
    });
  });

  const workspaces = async (token: string) => {
    const response = await getWorkspaces(get("/workspaces", token), deps.guard, app);
    expect(response.status).toBe(200);
    return (await response.json()).workspaces;
  };
  const roles = async (token: string) =>
    Object.fromEntries(
      (await workspaces(token)).map((w: { name: string; role: string | null }) => [w.name, w.role]),
    );

  it("lists the workspaces the caller sees, global first, with their role or null", async () => {
    expect(await workspaces(member)).toEqual([
      {
        name: "global",
        description: expect.any(String),
        visibility: "public",
        global: true,
        role: "user",
      },
      { name: "acme", description: "Acme.", visibility: "private", global: false, role: "user" },
      { name: "tools", description: "Tools.", visibility: "public", global: false, role: null },
    ]);
    // A non-member doesn't see the private one at all; root sees every one, as root.
    expect(await roles(outsider)).toEqual({ global: "moderator", tools: null });
    expect(await roles(root)).toEqual({ global: "root", acme: "root", tools: "root" });
  });

  it("needs a token", async () => {
    const response = await getWorkspaces(new Request(`${BASE}/workspaces`), deps.guard, app);
    expect(response.status).toBe(401);
  });

  it("puts the caller's memberships in me", async () => {
    const me = async (token: string) =>
      (await (await getMe(get("/me", token), deps.guard, app)).json()).workspaces;
    expect(await me(member)).toEqual([
      { name: "global", role: "user" },
      { name: "acme", role: "user" },
    ]);
    expect(await me(outsider)).toEqual([{ name: "global", role: "moderator" }]);
  });

  it("puts the workspace on search results, items and versions", async () => {
    const acme = { name: "acme", visibility: "private" };
    const search = await (await listItems(get("/items?q=deploy", member), deps)).json();
    expect(search.items[0].workspace).toEqual(acme);
    expect((await (await asks.item("deploy", member)).json()).workspace).toEqual(acme);
    expect((await (await asks.version("deploy", member)).json()).workspace).toEqual(acme);
  });

  it("filters search by ?workspace=, a private one finding nothing for a non-member", async () => {
    const names = async (query: string, token: string) => {
      const response = await listItems(get(`/items?${query}`, token), deps);
      expect(response.status).toBe(200);
      return (await response.json()).items.map((i: { name: string }) => i.name);
    };
    expect(await names("workspace=acme", member)).toEqual(["@acme/acme-infra/deploy"]);
    expect(await names("workspace=%20ACME%20", member)).toEqual(["@acme/acme-infra/deploy"]);
    expect(await names("workspace=acme", root)).toEqual(["@acme/acme-infra/deploy"]);
    expect(await names("workspace=tools", member)).toEqual([]);
    // To a non-member, a private workspace answers as a name no workspace has.
    const hidden = await listItems(get("/items?workspace=acme", outsider), deps);
    const unknown = await listItems(get("/items?workspace=nowhere", outsider), deps);
    expect(await hidden.text()).toBe(await unknown.text());
    const tooLong = await listItems(get(`/items?workspace=${"x".repeat(65)}`, member), deps);
    expect(tooLong.status).toBe(400);
  });
});
