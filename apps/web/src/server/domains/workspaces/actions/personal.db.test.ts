import { packItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, testAppAuth } from "../../identity/testing/test-auth";
import { browseCatalogue, homeLists } from "../../items/actions/catalogue";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { findDependencies } from "../../submissions/actions/composer";
import { PersonalWorkspaceError, WorkspaceRenameAliasError } from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import {
  addMembers,
  approveAccessRequest,
  changeMemberRole,
  deleteWorkspace,
  joinTarget,
  listWorkspaces,
  memberCandidates,
  myWorkspaces,
  removeMember,
  renameWorkspace,
  requestAccess,
  setUserWorkspaces,
  setWorkspaceVisibility,
  visibilityImpact,
} from "./workspaces";

// The personal rules (114): nobody else in it, its owner's row unchanged, always private, never
// deleted, nobody asks to join it; root's lists leave out others' unless one is named.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAna: Headers;
let asBob: Headers;
let ana: CurrentUser;
let bob: CurrentUser;
let anaSpace: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await signedIn("root@example.com");
  for (const email of ["ana@example.com", "bob@example.com"])
    await adminCreateUser(asRoot, { email, name: email, role: "user", password }, app);
  asAna = await signedIn("ana@example.com");
  asBob = await signedIn("bob@example.com");
  ana = (await getCurrentUser(asAna, app)) as CurrentUser;
  bob = (await getCurrentUser(asBob, app)) as CurrentUser;
  anaSpace = ana.personal ?? "";
});
afterEach(() => t.cleanup());

/** A released skill in a workspace, written directly: releasing there is task 4's. */
const releaseIn = async (workspaceId: string, scope: string, name: string) => {
  const text = (value: string) => new TextEncoder().encode(value);
  const scopeId = await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name: scope,
    description: "A scope.",
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });
  const files = [
    {
      path: "ronne.yaml",
      bytes: text(`name: "@${scope}/${name}"\ntype: skill\ndescription: A skill.\n`),
    },
    { path: "SKILL.md", bytes: text(`---\nname: ${name}\ndescription: A skill.\n---\nDo it.\n`) },
  ];
  const packed = await packItem(files, { version: "1.0.0" });
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name,
    type: "skill",
    description: "A skill.",
    ownerId: null,
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
    artifactPath: `${scope}/${name}/1.0.0.tgz`,
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: ana.id,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
};

const anasName = async () =>
  (
    await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("id", "=", anaSpace)
      .executeTakeFirstOrThrow()
  ).name;

const rows = () =>
  t.db
    .selectFrom("workspace_members")
    .select(["user_id", "role"])
    .where("workspace_id", "=", anaSpace)
    .execute();

describe("a personal workspace's rules (114)", () => {
  it("takes nobody else, and its owner's row never changes, for root too", async () => {
    for (const headers of [asAna, asRoot]) {
      await expect(
        addMembers(headers, { workspaceId: anaSpace, userIds: [bob.id], role: "user" }, app),
      ).rejects.toThrow(PersonalWorkspaceError);
      await expect(
        memberCandidates(headers, { workspaceId: anaSpace, query: "bob" }, app),
      ).rejects.toThrow(PersonalWorkspaceError);
    }
    await expect(
      changeMemberRole(asRoot, { workspaceId: anaSpace, userId: ana.id, role: "user" }, app),
    ).rejects.toThrow(PersonalWorkspaceError);
    await expect(
      removeMember(asRoot, { workspaceId: anaSpace, userId: ana.id }, app),
    ).rejects.toThrow(PersonalWorkspaceError);
    // Root's dialog for a user can't put anyone in it, nor change its owner's role there.
    await expect(
      setUserWorkspaces(
        asRoot,
        { userId: ana.id, workspaces: [{ workspaceId: anaSpace, role: "user" }] },
        app,
      ),
    ).rejects.toThrow(PersonalWorkspaceError);
    await expect(
      setUserWorkspaces(
        asRoot,
        { userId: bob.id, workspaces: [{ workspaceId: anaSpace, role: "user" }] },
        app,
      ),
    ).rejects.toThrow(PersonalWorkspaceError);
    // Saved without it, it stays.
    await setUserWorkspaces(asRoot, { userId: ana.id, workspaces: [] }, app);
    expect(await rows()).toEqual([{ user_id: ana.id, role: "admin" }]);
  });

  it("is always private and stays, whoever asks", async () => {
    const name = await anasName();
    for (const visibility of ["public", "private"])
      await expect(setWorkspaceVisibility(asRoot, { name, visibility }, app)).rejects.toThrow(
        PersonalWorkspaceError,
      );
    await expect(visibilityImpact(asRoot, name, app)).rejects.toThrow(PersonalWorkspaceError);
    await expect(deleteWorkspace(asRoot, { name }, app)).rejects.toThrow(PersonalWorkspaceError);
  });

  it("can't be asked to join: the request is kept by name, as for a name no workspace has", async () => {
    const name = await anasName();
    expect(await requestAccess(asBob, { workspace: name }, app)).toBe("sent");
    const kept = await t.db
      .selectFrom("workspace_access_requests")
      .select(["workspace_id", "workspace_name"])
      .execute();
    expect(kept).toEqual([{ workspace_id: null, workspace_name: name }]);
    expect(await joinTarget(asBob, name, app)).toMatchObject({ kind: "unseen", name });
    expect(await requestAccess(asAna, { workspace: name }, app)).toBe("already_member");
    // Renamed, it doesn't take requests kept for its new name either.
    expect(await requestAccess(asBob, { workspace: "ana-new" }, app)).toBe("sent");
    await renameWorkspace(asAna, { name, to: "ana-new" }, app);
    const after = await t.db
      .selectFrom("workspace_access_requests")
      .select("workspace_id")
      .where("workspace_name", "=", "ana-new")
      .execute();
    expect(after).toEqual([{ workspace_id: null }]);
  });

  it("stays out of root's lists, catalogue and home page unless named", async () => {
    await releaseIn(anaSpace, "tools", "lint");
    const name = await anasName();
    const names = async (headers: Headers, filter = {}) =>
      (await browseCatalogue(headers, filter, app)).entries.map((e) => `${e.workspace}/${e.name}`);
    expect(await names(asRoot)).toEqual([]);
    expect(await names(asRoot, { q: "lint" })).toEqual([]);
    expect(await names(asRoot, { workspace: name })).toEqual([`${name}/lint`]);
    expect((await browseCatalogue(asRoot, {}, app)).workspaces).not.toContain(name);
    expect(JSON.stringify(await homeLists(asRoot, app))).not.toContain("lint");
    expect(JSON.stringify(await homeLists(asAna, app))).toContain("lint");
    // Its owner sees it everywhere; anyone else nowhere, named or not.
    expect(await names(asAna)).toEqual([`${name}/lint`]);
    expect(await names(asBob, { workspace: name })).toEqual([]);
    // Root's selects and Workspaces page leave it out too, but keep root's own.
    expect((await listWorkspaces(asRoot, app)).map((w) => w.name)).not.toContain(name);
    expect((await myWorkspaces(asRoot, app)).map((w) => w.name)).not.toContain(name);
    expect((await listWorkspaces(asRoot, app)).map((w) => w.name)).toContain("root-2");
  });

  it("leaves them out of root's most used and Scope options, unless named", async () => {
    await releaseIn(anaSpace, "tools", "lint");
    await t.db.updateTable("items").set({ download_count: 5 }).where("name", "=", "lint").execute();
    const name = await anasName();
    const used = async (headers: Headers) =>
      (await homeLists(headers, app)).mostUsed.map((e) => e.name);
    expect(await used(asRoot)).toEqual([]);
    expect(await used(asAna)).toEqual(["lint"]);
    expect((await browseCatalogue(asRoot, {}, app)).scopes).not.toContain("tools");
    expect((await browseCatalogue(asRoot, { workspace: name }, app)).scopes).toEqual(["tools"]);
  });

  it("keeps root's own personal workspace in root's catalogue", async () => {
    const root = (await getCurrentUser(asRoot, app)) as CurrentUser;
    await releaseIn(root.personal ?? "", "mine", "own");
    const entries = (await browseCatalogue(asRoot, {}, app)).entries.map((e) => e.name);
    expect(entries).toContain("own");
  });

  it("offers a personal workspace's own items as dependencies, to root drafting there too", async () => {
    await releaseIn(anaSpace, "tools", "lint");
    const name = await anasName();
    for (const headers of [asAna, asRoot]) {
      const offered = await findDependencies(
        headers,
        { type: "skill", q: "", itemName: `@${name}/tools/new` },
        app,
      );
      expect(offered.map((o) => o.name)).toContain(`@${name}/tools/lint`);
    }
  });

  it("names nothing of someone's personal workspace when a rename clashes with its old names", async () => {
    await releaseIn(anaSpace, "tools", "lint");
    const name = await anasName();
    await renameWorkspace(asAna, { name, to: `${name}-x` }, app);
    await releaseIn(bob.personal ?? "", "tools", "lint");
    const bobs = (
      await t.db
        .selectFrom("workspaces")
        .select("name")
        .where("id", "=", bob.personal ?? "")
        .executeTakeFirstOrThrow()
    ).name;
    // Bob learns the name can't be used, not what was there, nor whose.
    const refused = await renameWorkspace(asBob, { name: bobs, to: name }, app).catch((e) => e);
    expect(refused).toBeInstanceOf(WorkspaceRenameAliasError);
    expect((refused as WorkspaceRenameAliasError).names).toEqual([]);
    expect((refused as Error).message).not.toContain("@");
    // Root, who sees every item, is told which.
    await expect(renameWorkspace(asRoot, { name: bobs, to: name }, app)).rejects.toThrow(
      `@${name}/tools/lint`,
    );
  });

  it("refuses to approve a request attached to one, should one ever be", async () => {
    await t.db
      .insertInto("workspace_access_requests")
      .values({
        id: "01JREQUESTPERSONAL00000000",
        workspace_id: anaSpace,
        workspace_name: await anasName(),
        user_id: bob.id,
        message: null,
        status: "open",
        decided_by: null,
        reason: null,
        created_at: toDbDate(new Date(), t.dialect),
        decided_at: null,
      })
      .execute();
    await expect(
      approveAccessRequest(asRoot, { requestId: "01JREQUESTPERSONAL00000000", role: "user" }, app),
    ).rejects.toThrow(PersonalWorkspaceError);
    expect(await rows()).toEqual([{ user_id: ana.id, role: "admin" }]);
  });
});
