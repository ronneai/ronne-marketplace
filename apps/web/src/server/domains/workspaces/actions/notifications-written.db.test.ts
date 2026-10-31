import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { AccessRequestAnsweredError } from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import {
  addMembers,
  approveAccessRequest,
  approveItemMove,
  approveScopeMove,
  askItemMove,
  askScopeMove,
  changeMemberRole,
  createWorkspace,
  declineAccessRequest,
  declineItemMove,
  declineScopeMove,
  removeMember,
  requestAccess,
  setUserWorkspaces,
} from "./workspaces";

// What the workspace services tell people (139, task 3): each kind, to whom, about what, written in
// the transaction of the change and never to the person who made it.
const password = "correct horse battery";
let t: TestDb;
let app: AppAuth;
const as: Record<string, Headers> = {};
const id: Record<string, string> = {};
let acme: string;
let beta: string;

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const notes = async () =>
  (await t.db.selectFrom("notifications").selectAll().orderBy("id").execute()).map((row) => ({
    to: row.user_id,
    kind: row.kind,
    actor: row.actor_id,
    subject: { type: row.subject_type, id: row.subject_id },
    params: JSON.parse(row.params) as Record<string, unknown>,
  }));

/** Forgets what the set-up wrote, so a test reads only its own. */
const clear = () => t.db.deleteFrom("notifications").execute();

const recipients = (rows: { to: string }[]) => rows.map((r) => r.to).sort();

const requestIdOf = async (user: string) =>
  (
    await t.db
      .selectFrom("workspace_access_requests")
      .select("id")
      .where("user_id", "=", user)
      .executeTakeFirstOrThrow()
  ).id;

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  id.root = (
    await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password })
  ).id;
  for (const name of ["ana", "bob", "mod", "adm", "off", "dave"])
    id[name] = await createTestUser(app, { email: `${name}@example.com`, password, name });
  as.root = await signedIn("root@example.com");
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(as.root, { name: "beta", description: "Beta." }, app)).id;
  await setWorkspaceRole(app, id.ana as string, "user", acme);
  await setWorkspaceRole(app, id.mod as string, "moderator", acme);
  await setWorkspaceRole(app, id.adm as string, "admin", acme);
  await setWorkspaceRole(app, id.off as string, "moderator", acme);
  await setWorkspaceRole(app, id.dave as string, "admin", beta);
  for (const name of ["ana", "bob", "mod", "adm", "dave"])
    as[name] = await signedIn(`${name}@example.com`);
  await t.db
    .updateTable("user")
    .set({ disabled_at: toDbDate(new Date(), t.dialect) })
    .where("id", "=", id.off as string)
    .execute();
  await clear();
});
afterEach(() => t.cleanup());

describe("joining a workspace (094)", () => {
  it("tells root and the workspace's moderators and admins once, not the asker or a disabled one", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    const rows = await notes();
    expect(rows).toHaveLength(3);
    expect(recipients(rows)).toEqual([id.root, id.mod, id.adm].sort() as string[]);
    const request = await requestIdOf(id.bob as string);
    for (const row of rows)
      expect(row).toMatchObject({
        kind: "request.join_waiting",
        actor: id.bob,
        subject: { type: "join_request", id: request },
        params: { workspace: "acme" },
      });
    // Asking again changes nothing and tells nobody again.
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    expect(await notes()).toHaveLength(3);
  });

  it("tells nobody about a name that is no workspace", async () => {
    await requestAccess(as.bob as Headers, { workspace: "nowhere" }, app);
    expect(await notes()).toEqual([]);
  });

  it("tells the asker an approval, once, and not that they were added", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    await clear();
    const request = await requestIdOf(id.bob as string);
    await approveAccessRequest(as.mod as Headers, { requestId: request }, app);
    expect(await notes()).toEqual([
      {
        to: id.bob,
        kind: "join_request.approved",
        actor: id.mod,
        subject: { type: "join_request", id: request },
        params: { workspace: "acme", role: "user" },
      },
    ]);
  });

  it("tells the asker a decline, and a second answer writes nothing", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    await clear();
    const request = await requestIdOf(id.bob as string);
    await declineAccessRequest(as.adm as Headers, { requestId: request, reason: "No." }, app);
    const rows = await notes();
    expect(rows).toEqual([
      {
        to: id.bob,
        kind: "join_request.declined",
        actor: id.adm,
        subject: { type: "join_request", id: request },
        params: { workspace: "acme" },
      },
    ]);
    // The reason is the requester's to read on the page, never copied into a notification.
    expect(JSON.stringify(rows)).not.toContain("No.");
    await expect(
      approveAccessRequest(as.mod as Headers, { requestId: request }, app),
    ).rejects.toThrow(AccessRequestAnsweredError);
    expect(await notes()).toHaveLength(1);
  });
});

describe("a member's changes (092)", () => {
  it("tells someone they were added, with the role, and not the one who added them", async () => {
    await addMembers(
      as.adm as Headers,
      { workspaceId: acme, userIds: [id.bob as string], role: "user" },
      app,
    );
    expect(await notes()).toEqual([
      {
        to: id.bob,
        kind: "membership.added",
        actor: id.adm,
        subject: { type: "workspace", id: acme },
        params: { workspace: "acme", role: "user" },
      },
    ]);
    // Already in: nothing changes, nobody is told.
    await clear();
    await addMembers(
      as.adm as Headers,
      { workspaceId: acme, userIds: [id.bob as string], role: "user" },
      app,
    );
    expect(await notes()).toEqual([]);
  });

  it("tells someone who was added while asking to join that it was approved, once", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    await clear();
    await addMembers(
      as.adm as Headers,
      { workspaceId: acme, userIds: [id.bob as string], role: "user" },
      app,
    );
    expect(await notes()).toMatchObject([
      { to: id.bob, kind: "join_request.approved", params: { workspace: "acme", role: "user" } },
    ]);
  });

  it("tells them a role change and a removal", async () => {
    await changeMemberRole(
      as.adm as Headers,
      { workspaceId: acme, userId: id.ana as string, role: "moderator" },
      app,
    );
    await removeMember(as.adm as Headers, { workspaceId: acme, userId: id.ana as string }, app);
    expect(await notes()).toEqual([
      {
        to: id.ana,
        kind: "membership.role_changed",
        actor: id.adm,
        subject: { type: "workspace", id: acme },
        params: { workspace: "acme", from: "user", to: "moderator" },
      },
      {
        to: id.ana,
        kind: "membership.removed",
        actor: id.adm,
        subject: { type: "workspace", id: acme },
        params: { workspace: "acme" },
      },
    ]);
  });

  it("tells them each change a Workspaces dialog makes", async () => {
    await setUserWorkspaces(
      as.root as Headers,
      {
        userId: id.ana as string,
        workspaces: [
          { workspaceId: acme, role: "moderator" },
          { workspaceId: beta, role: "user" },
        ],
      },
      app,
    );
    const rows = await notes();
    expect(rows.map((r) => [r.kind, r.subject.id]).sort()).toEqual(
      [
        ["membership.added", beta],
        ["membership.role_changed", acme],
      ].sort(),
    );
    await clear();
    await setUserWorkspaces(
      as.root as Headers,
      { userId: id.ana as string, workspaces: [{ workspaceId: beta, role: "user" }] },
      app,
    );
    expect((await notes()).map((r) => [r.kind, r.subject.id])).toEqual([
      ["membership.removed", acme],
    ]);
  });

  it("tells nobody when the change is refused", async () => {
    // Nobody changes their own membership.
    await expect(
      removeMember(as.adm as Headers, { workspaceId: acme, userId: id.adm as string }, app),
    ).rejects.toThrow();
    expect(await notes()).toEqual([]);
  });
});

const scopeIn = (name: string, workspaceId: string) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

const itemIn = async (scopeId: string, name: string, reviewed = true) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name,
    type: "skill",
    description: `${name}.`,
    ownerId: null,
    createdAt: new Date(),
  });
  await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name, type: "skill", description: `${name}.`, version: "1.0.0" },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${itemId}.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: id.root as string,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
    reviewed,
  });
  return itemId;
};

describe("moving a scope (115)", () => {
  it("tells root and the target's admins, once, when an admin elsewhere asks", async () => {
    const infra = await scopeIn("infra", beta);
    const asked = await askScopeMove(as.dave as Headers, { scopeId: infra, to: "acme" }, app);
    expect(asked.outcome).toBe("requested");
    const rows = await notes();
    // Root and acme's admin; not acme's moderator, the disabled one, or the asker.
    expect(recipients(rows)).toEqual([id.root, id.adm].sort() as string[]);
    for (const row of rows)
      expect(row).toMatchObject({
        kind: "request.scope_move_waiting",
        actor: id.dave,
        subject: { type: "scope_move", id: asked.moveId },
        params: { scope: "@beta/infra", newName: "@acme/infra", from: "beta", to: "acme" },
      });
  });

  it("tells the asker it moved, or was declined, by the one who answered", async () => {
    const infra = await scopeIn("infra", beta);
    const vault = await scopeIn("vault", beta);
    const first = await askScopeMove(as.dave as Headers, { scopeId: infra, to: "acme" }, app);
    const second = await askScopeMove(as.dave as Headers, { scopeId: vault, to: "acme" }, app);
    await clear();
    await approveScopeMove(as.adm as Headers, { moveId: first.moveId }, app);
    await declineScopeMove(as.adm as Headers, { moveId: second.moveId, reason: "No." }, app);
    const rows = await notes();
    expect(rows).toEqual([
      {
        to: id.dave,
        kind: "scope_move.moved",
        actor: id.adm,
        subject: { type: "scope_move", id: first.moveId },
        params: { scope: "@beta/infra", newName: "@acme/infra", from: "beta", to: "acme" },
      },
      {
        to: id.dave,
        kind: "scope_move.declined",
        actor: id.adm,
        subject: { type: "scope_move", id: second.moveId },
        params: { scope: "@beta/vault", newName: "@acme/vault", from: "beta", to: "acme" },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("No.");
  });

  it("tells root alone when the target is `global`, not its admins or moderators", async () => {
    // `global` has an admin and a moderator of its own; neither answers a move into it.
    await setWorkspaceRole(app, id.adm as string, "admin", GLOBAL_WORKSPACE_ID);
    await setWorkspaceRole(app, id.mod as string, "moderator", GLOBAL_WORKSPACE_ID);
    const infra = await scopeIn("infra", beta);
    const asked = await askScopeMove(as.dave as Headers, { scopeId: infra, to: "global" }, app);
    expect(asked.outcome).toBe("requested");
    const rows = await notes();
    expect(rows.map((r) => r.to)).toEqual([id.root]);
    expect(rows[0]).toMatchObject({
      kind: "request.scope_move_waiting",
      actor: id.dave,
      subject: { type: "scope_move", id: asked.moveId },
      params: { scope: "@beta/infra", from: "beta", to: "global" },
    });
  });

  it("tells root alone when the target is a personal workspace, not anyone else in it", async () => {
    // A scope with a version nobody reviewed always goes through a request (114), even into the
    // asker's own personal workspace. Someone else holds a role there; root alone is told.
    // (Notifications written while setting up are cleared first.)
    // Personal workspaces come with accounts root creates in the admin screen.
    await adminCreateUser(
      as.root as Headers,
      { email: "pam@example.com", name: "Pam", role: "user", password },
      app,
    );
    const pam = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "pam@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    await setWorkspaceRole(app, pam, "admin", acme);
    as.pam = await signedIn("pam@example.com");
    const mine = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", pam)
      .executeTakeFirstOrThrow();
    const stamp = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: mine.id,
        user_id: id.mod as string,
        role: "moderator",
        added_by: null,
        source: null,
        created_at: stamp,
        updated_at: stamp,
      })
      .execute();
    const notes_ = await scopeIn("notes", acme);
    await itemIn(notes_, "todo", false);
    await clear();
    const asked = await askScopeMove(as.pam as Headers, { scopeId: notes_, to: mine.name }, app);
    expect(asked.outcome).toBe("requested");
    const rows = await notes();
    expect(rows.map((r) => r.to)).toEqual([id.root]);
    expect(rows[0]).toMatchObject({
      kind: "request.scope_move_waiting",
      actor: pam,
      params: { to: mine.name },
    });
  });

  it("tells nobody when a move happens at once, or is refused", async () => {
    const infra = await scopeIn("infra", acme);
    // Root's own move, with the name typed: the asker is the actor.
    await askScopeMove(as.root as Headers, { scopeId: infra, to: "beta", confirm: "infra" }, app);
    expect(await notes()).toEqual([]);
    // A second answer to an answered request fails and writes nothing.
    const other = await scopeIn("tools", beta);
    const asked = await askScopeMove(as.dave as Headers, { scopeId: other, to: "acme" }, app);
    await declineScopeMove(as.adm as Headers, { moveId: asked.moveId }, app);
    const before = (await notes()).length;
    await expect(
      approveScopeMove(as.adm as Headers, { moveId: asked.moveId }, app),
    ).rejects.toThrow();
    expect(await notes()).toHaveLength(before);
  });
});

describe("moving an item (134)", () => {
  it("tells root and the workspace's moderators and admins when a member asks", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    const asked = await askItemMove(as.ana as Headers, { itemId: deploy, toScopeId: devops }, app);
    expect(asked.outcome).toBe("requested");
    const rows = await notes();
    expect(recipients(rows)).toEqual([id.root, id.mod, id.adm].sort() as string[]);
    for (const row of rows)
      expect(row).toMatchObject({
        kind: "request.item_move_waiting",
        actor: id.ana,
        subject: { type: "item_move", id: asked.moveId },
        params: { item: "@acme/infra/deploy", newName: "@acme/devops/deploy" },
      });
  });

  it("tells the asker it moved, or was declined", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    const build = await itemIn(infra, "build");
    const first = await askItemMove(as.ana as Headers, { itemId: deploy, toScopeId: devops }, app);
    const second = await askItemMove(as.ana as Headers, { itemId: build, toScopeId: devops }, app);
    await clear();
    await approveItemMove(as.mod as Headers, { moveId: first.moveId }, app);
    await declineItemMove(as.adm as Headers, { moveId: second.moveId, reason: "No." }, app);
    const rows = await notes();
    expect(rows).toMatchObject([
      {
        to: id.ana,
        kind: "item_move.moved",
        actor: id.mod,
        subject: { type: "item_move", id: first.moveId },
        params: { item: "@acme/infra/deploy", newName: "@acme/devops/deploy" },
      },
      {
        to: id.ana,
        kind: "item_move.declined",
        actor: id.adm,
        subject: { type: "item_move", id: second.moveId },
        params: { item: "@acme/infra/build" },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("No.");
  });

  it("tells nobody when a moderator moves it at once", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    const done = await askItemMove(as.mod as Headers, { itemId: deploy, toScopeId: devops }, app);
    expect(done.outcome).toBe("moved");
    expect(await notes()).toEqual([]);
  });
});
