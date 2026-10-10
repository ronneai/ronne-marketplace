import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { UNFILTERED, type Viewer } from "../../workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import type { CatalogueRepository } from "./catalogue-repository";
import type { ItemRepository } from "./item-repository";
import { kyselyCatalogueRepository } from "./kysely-catalogue-repository";
import { kyselyItemRepository } from "./kysely-item-repository";
import { kyselyScopeRepository } from "./kysely-scope-repository";
import type { ScopeRepository } from "./scope-repository";

// The guard of 093: every read of the items repositories filters by the viewer. Each method is
// either a read, with a probe that must find the private workspace's data for a member and not for
// an outsider, or a write, named with why it needn't filter. A new method that's neither fails the
// first test, so nobody can add a read that forgets the viewer.
let t: TestDb;
let acme: string;
let ids: { publicItem: string; privateItem: string; privateVersion: string; submission: string };

const now = () => toDbDate(new Date(), t.dialect);

const insertScope = async (name: string, workspaceId: string) => {
  const id = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id,
      name,
      description: name,
      created_by: null,
      created_at: now(),
      workspace_id: workspaceId,
    })
    .execute();
  return id;
};

beforeEach(async () => {
  t = await createTestDb();
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  const rootId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: rootId,
      email: "r@example.com",
      name: "Root",
      email_verified: 0 as never,
      created_at: now(),
      updated_at: now(),
      role: "root",
    } as never)
    .execute();
  const team = await insertScope("team", GLOBAL_WORKSPACE_ID);
  const infra = await insertScope("acme-infra", acme);
  const submission = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id: submission,
      author_id: rootId,
      scope_id: infra,
      name: "deploy",
      type: "skill",
      item_id: null,
      base_version_id: null,
      rebase_conflicts: null,
      status: "released",
      created_at: now(),
      updated_at: now(),
      submitted_at: now(),
    })
    .execute();
  await t.db
    .insertInto("review_events")
    .values({
      id: newId(),
      submission_id: submission,
      actor_id: rootId,
      kind: "approve",
      body: null,
      revision: 1,
      created_at: now(),
    })
    .execute();
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const release = async (scopeId: string, scope: string, name: string, dependsOn?: string) => {
    const itemId = await items.insertItem({
      scopeId,
      name,
      type: "skill",
      description: name,
      ownerId: null,
      createdAt: new Date(),
    });
    const versionId = await items.insertVersion({
      itemId,
      version: "1.0.0",
      manifest: { name: `@${scope}/${name}`, description: name },
      readme: null,
      files: [],
      notes: null,
      artifactPath: `${scope}/${name}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: rootId,
      publishedAt: new Date(),
      submissionId: dependsOn ? submission : null,
      dependencies: dependsOn ? [{ itemId: dependsOn, range: "^1.0.0" }] : [],
      riskFlags: [],
    });
    await items.setTag(itemId, "latest", versionId);
    await t.db.updateTable("items").set({ download_count: 1 }).where("id", "=", itemId).execute();
    return { itemId, versionId };
  };
  const base = await release(team, "team", "base");
  const deploy = await release(infra, "acme-infra", "deploy", base.itemId);
  // Old data the dependency rule (task 4) refuses now: a public item that depends on a private one.
  // Its "Used by" is the private item's, which an outsider mustn't get either.
  await release(team, "team", "leaky", deploy.itemId);
  // An old name of the private item (118): found by it only by who sees it.
  await t.db
    .insertInto("item_aliases")
    .values({
      name: "@old-infra/deploy",
      item_id: deploy.itemId,
      reason: "move",
      created_at: now(),
    })
    .execute();
  ids = {
    publicItem: base.itemId,
    privateItem: deploy.itemId,
    privateVersion: deploy.versionId,
    submission,
  };
});
afterEach(() => t.cleanup());

const member = (): Viewer => ({
  userId: "m",
  root: false,
  workspaceIds: [GLOBAL_WORKSPACE_ID, acme].sort(),
  privateWorkspaceIds: [acme],
});
const outsider = (): Viewer => ({
  userId: "o",
  root: false,
  workspaceIds: [GLOBAL_WORKSPACE_ID],
  privateWorkspaceIds: [],
});

/** Whether a read's answer includes the private workspace's data. */
type Probe<R> = (repo: R) => Promise<boolean>;
const has = (value: unknown) => JSON.stringify(value ?? null).includes("deploy");

const CATALOGUE_READS: Record<keyof CatalogueRepository, Probe<CatalogueRepository>> = {
  list: async (repo) => has(await repo.list({ sort: "name", limit: 50 })),
  byNames: async (repo) =>
    has(await repo.byNames([{ workspace: "acme", scope: "acme-infra", name: "deploy" }])),
  typeCounts: async (repo) =>
    // Three skills in all, two of them public.
    ((await repo.typeCounts({})).find((c) => c.type === "skill")?.count ?? 0) === 3,
  scopes: async (repo) => (await repo.scopes()).includes("acme-infra"),
  workspaces: async (repo) => (await repo.workspaces()).includes("acme"),
  mostUsed: async (repo) => has(await repo.mostUsed(10)),
};

const ITEM_READS: Partial<Record<keyof ItemRepository, Probe<ItemRepository>>> = {
  // By its name now, and by an old one (118): either filters.
  findByName: async (repo) =>
    (await repo.findByName({ workspace: "acme", scope: "acme-infra", name: "deploy" })) !== null ||
    (await repo.findByName({ scope: "old-infra", name: "deploy" })) !== null,
  versions: async (repo) => (await repo.versions(ids.privateItem)).length > 0,
  tags: async (repo) => (await repo.tags(ids.privateItem)).length > 0,
  versionDetail: async (repo) => (await repo.versionDetail(ids.privateVersion)) !== null,
  // Both filters: the dependents seen, and the item they're asked about.
  dependents: async (repo) =>
    has(await repo.dependents(ids.publicItem)) ||
    (await repo.dependents(ids.privateItem)).length > 0,
  approval: async (repo) => (await repo.approval(ids.submission)) !== null,
  dependencyWorkspaces: async (repo) =>
    (await repo.dependencyWorkspaces(ids.privateVersion)).length > 0,
  oldNames: async (repo) => (await repo.oldNames([ids.privateItem])).size > 0,
};

const SCOPE_READS: Partial<Record<keyof ScopeRepository, Probe<ScopeRepository>>> = {
  findByName: async (repo) =>
    (await repo.findByName({ workspace: "acme", scope: "acme-infra" })) !== null,
  findWorkspace: async (repo) => (await repo.findWorkspace(acme)) !== null,
  list: async (repo) => (await repo.list({ limit: 50 })).some((s) => s.name === "acme-infra"),
  page: async (repo) =>
    (await repo.page({ sort: "name", dir: "asc", size: 50 })).rows.some(
      (s) => s.name === "acme-infra",
    ),
  // Two scopes in all: team, public, and acme-infra, private; an outsider sees one.
  count: async (repo) => (await repo.count({})).count === 2,
};
const SCOPE_EXEMPT: Partial<Record<keyof ScopeRepository, string>> = {
  transaction: "passes the same viewer to the repository it opens",
  insert: "a write, authorised by the scope rules",
  updateDescription: "a write",
  recordAudit: "a write to the audit log",
};

/** Methods that don't read a workspace's data, and why. */
const ITEM_EXEMPT: Partial<Record<keyof ItemRepository, string>> = {
  transaction: "passes the same viewer to the repository it opens",
  insertItem: "a write, authorised by the release rules",
  updateDescription: "a write",
  insertVersion: "a write",
  setTag: "a write; returns only the version id it replaced",
  lockItem: "takes a lock, reads nothing back",
  lockWorkspaces: "takes a lock; says which of the ids the caller holds are private",
  removeTag: "a write",
  setDeprecated: "a write",
  setYanked: "a write",
  recordAudit: "a write to the audit log",
  countDownload: "a write, after a read found the item",
  isOldName:
    "whether a name is reserved, for everyone (118): never which item had it, or anything of it",
  userName: "a user's display name, not a workspace's data",
};

describe("every items read filters by the viewer (093)", () => {
  it("knows every method: each is a read with a probe, or a named write", () => {
    const catalogue = kyselyCatalogueRepository(t.db, t.dialect, outsider());
    expect(Object.keys(catalogue).sort()).toEqual(Object.keys(CATALOGUE_READS).sort());
    const items = kyselyItemRepository(t.db, t.dialect, outsider());
    expect(Object.keys(items).sort()).toEqual(
      [...Object.keys(ITEM_READS), ...Object.keys(ITEM_EXEMPT)].sort(),
    );
    const scopes = kyselyScopeRepository(t.db, t.dialect, outsider());
    expect(Object.keys(scopes).sort()).toEqual(
      [...Object.keys(SCOPE_READS), ...Object.keys(SCOPE_EXEMPT)].sort(),
    );
  });

  it("gives a member the private workspace's data in every catalogue read, and an outsider none", async () => {
    for (const [name, probe] of Object.entries(CATALOGUE_READS)) {
      expect(await probe(kyselyCatalogueRepository(t.db, t.dialect, member())), name).toBe(true);
      expect(await probe(kyselyCatalogueRepository(t.db, t.dialect, outsider())), name).toBe(false);
    }
  });

  it("gives a member the private workspace's data in every item read, and an outsider none", async () => {
    for (const [name, probe] of Object.entries(ITEM_READS)) {
      expect(await probe(kyselyItemRepository(t.db, t.dialect, member())), name).toBe(true);
      expect(await probe(kyselyItemRepository(t.db, t.dialect, outsider())), name).toBe(false);
    }
  });

  it("gives a member the private workspace's scope in every scope read, and an outsider none", async () => {
    for (const [name, probe] of Object.entries(SCOPE_READS)) {
      expect(await probe(kyselyScopeRepository(t.db, t.dialect, member())), name).toBe(true);
      expect(await probe(kyselyScopeRepository(t.db, t.dialect, outsider())), name).toBe(false);
    }
  });

  it("filters inside a transaction too", async () => {
    const found = await kyselyItemRepository(t.db, t.dialect, outsider()).transaction((repo) =>
      repo.findByName({ workspace: "acme", scope: "acme-infra", name: "deploy" }),
    );
    expect(found).toBeNull();
  });

  it("gives root everything, and nobody signed out nothing", async () => {
    const root: Viewer = { userId: "r", root: true, workspaceIds: [], privateWorkspaceIds: [] };
    const nobody: Viewer = { userId: null, root: false, workspaceIds: [], privateWorkspaceIds: [] };
    expect(await ITEM_READS.findByName?.(kyselyItemRepository(t.db, t.dialect, root))).toBe(true);
    expect(await CATALOGUE_READS.list(kyselyCatalogueRepository(t.db, t.dialect, nobody))).toBe(
      false,
    );
    expect(
      await kyselyCatalogueRepository(t.db, t.dialect, nobody).list({ sort: "name", limit: 5 }),
    ).toEqual([]);
  });
});
