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
const BASE = "http://localhost:3000/api/v1";
const password = "correct horse battery";

const tokenFor = async (app: AppAuth, email: string) => {
  const result = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!result.ok) throw new Error("no token");
  return result.token.token;
};

beforeEach(async () => {
  t = await createTestDb();
  const app = testAppAuth(t);
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
  item: (name: string, token: string) =>
    getItem(get(`/items/acme-infra/${name}`, token), { scope: "acme-infra", name }, deps),
  version: (name: string, token: string) =>
    getVersion(
      get(`/items/acme-infra/${name}/1.0.0`, token),
      { scope: "acme-infra", name, version: "1.0.0" },
      deps,
    ),
  tarball: (name: string, token: string) =>
    getTarball(
      get(`/items/acme-infra/${name}/1.0.0/tarball`, token),
      { scope: "acme-infra", name, version: "1.0.0" },
      deps,
    ),
  resolve: (name: string, token: string) =>
    postResolve(
      post("/resolve", token, { dependencies: { [`@acme-infra/${name}`]: "^1.0.0" } }),
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
      await answer(await asks.item("deploy", outsider), "acme-infra"),
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
    expect(await names(member)).toEqual(["@acme-infra/deploy"]);
    const scopes = async (token: string) =>
      (await (await getScopes(get("/scopes", token), deps)).json()).scopes.map(
        (s: { name: string }) => s.name,
      );
    expect(await scopes(outsider)).not.toContain("acme-infra");
    expect(await scopes(plain)).not.toContain("acme-infra");
    expect(await scopes(member)).toContain("acme-infra");
    expect(await scopes(root)).toContain("acme-infra");
    expect(await names(plain)).toEqual([]);
    expect(await names(root)).toEqual(["@acme-infra/deploy"]);
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
