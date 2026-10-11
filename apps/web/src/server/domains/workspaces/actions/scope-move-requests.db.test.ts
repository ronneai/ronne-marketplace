import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";

import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { ScopeMovedError } from "../../submissions/exceptions/errors";
import {
  ScopeMoveAnsweredError,
  ScopeMoveAskerLostRoleError,
  ScopeMoveConfirmationError,
  ScopeMoveNotFoundError,
  ScopeMoveOpenError,
  ScopeMoveRefusedError,
} from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import {
  approveScopeMove,
  askScopeMove,
  cancelScopeMove,
  createWorkspace,
  declineScopeMove,
} from "./workspaces";

// Asking, answering and moving (115, task 3): who decides, as the spec's table says; the checks
// again at approval; the move itself; and what may not happen at the same time.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let rootId: string;
const as: Record<"root" | "ana" | "bob" | "carol" | "dave", Headers> = {} as never;
const who: Record<"ana" | "bob" | "carol" | "dave", CurrentUser> = {} as never;
let acme: string;
let beta: string;
let vault: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const scope = (name: string, workspaceId: string) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

/** An item in the scope with a released 1.0.0 that needs these items. */
const release = async (scopeId: string, name: string, needs: string[] = [], reviewed = true) => {
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
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: needs.map((id) => ({ itemId: id, range: "^1.0.0" })),
    riskFlags: [],
    reviewed,
  });
  return itemId;
};

const scopeOf = async (id: string) =>
  t.db
    .selectFrom("scopes")
    .select(["workspace_id", "name"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

const moveRow = async (id: string) =>
  t.db.selectFrom("scope_moves").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const revision = async () =>
  Number(
    (await t.db.selectFrom("catalogue_revision").select("revision").executeTakeFirst())?.revision ??
      0,
  );

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-scope-moves-"));
  storage = localStorage(storageRoot);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  as.root = await signedIn("root@example.com");
  for (const name of ["ana", "bob", "carol", "dave"] as const) {
    await adminCreateUser(
      as.root,
      { email: `${name}@example.com`, name, role: "user", password },
      app,
    );
    as[name] = await signedIn(`${name}@example.com`);
    who[name] = (await getCurrentUser(as[name], app)) as CurrentUser;
  }
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(as.root, { name: "beta", description: "Beta." }, app)).id;
  vault = (
    await createWorkspace(
      as.root,
      { name: "vault", description: "Vault.", visibility: "private" },
      app,
    )
  ).id;
  // Carol runs acme and beta; Dave runs beta only.
  await setWorkspaceRole(app, who.carol.id, "admin", acme);
  await setWorkspaceRole(app, who.carol.id, "admin", beta);
  await setWorkspaceRole(app, who.dave.id, "admin", beta);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

describe("asking to move a scope, and moving it (115)", () => {
  it("moves at once for root once the scope's name is typed, keeping the old names", async () => {
    const infra = await scope("infra", beta);
    const deploy = await release(infra, "deploy");
    await expect(askScopeMove(as.root, { scopeId: infra, to: "acme" }, app)).rejects.toThrow(
      ScopeMoveConfirmationError,
    );
    expect((await scopeOf(infra)).workspace_id).toBe(beta);
    const before = await revision();
    const done = await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    expect(done.outcome).toBe("moved");
    expect(await scopeOf(infra)).toEqual({ workspace_id: acme, name: "infra" });
    expect(await revision()).toBeGreaterThan(before);
    const alias = await t.db
      .selectFrom("item_aliases")
      .select(["item_id", "reason"])
      .where("name", "=", "@beta/infra/deploy")
      .executeTakeFirstOrThrow();
    expect(alias).toEqual({ item_id: deploy, reason: "move" });
    expect(await moveRow(done.moveId)).toMatchObject({ status: "approved", decided_by: rootId });
    expect((await events("scope.moved"))[0]?.metadata).toEqual({
      scope: "@beta/infra",
      newName: "@acme/infra",
      from: "beta",
      to: "acme",
      askedBy: rootId,
      approvedBy: rootId,
      direct: true,
      items: 1,
      reviewed: 0,
    });
  });

  it("moves at once into global for its admins, typed; anyone else asks root alone", async () => {
    await setWorkspaceRole(app, who.ana.id, "admin");
    await setWorkspaceRole(app, who.ana.id, "admin", beta);
    const one = await scope("one", beta);
    await expect(askScopeMove(as.ana, { scopeId: one, to: "global" }, app)).rejects.toThrow(
      ScopeMoveConfirmationError,
    );
    expect(
      (await askScopeMove(as.ana, { scopeId: one, to: "global", confirm: "one" }, app)).outcome,
    ).toBe("moved");
    const two = await scope("two", beta);
    const asked = await askScopeMove(as.dave, { scopeId: two, to: "global" }, app);
    expect(asked.outcome).toBe("requested");
    // global's admins don't answer: root does.
    await expect(approveScopeMove(as.ana, { moveId: asked.moveId }, app)).rejects.toThrow(
      ScopeMoveNotFoundError,
    );
    expect((await approveScopeMove(as.root, { moveId: asked.moveId }, app)).outcome).toBe("moved");
    expect((await scopeOf(two)).workspace_id).not.toBe(beta);
  });

  it("moves at once for an admin of both; otherwise asks the target's admins or root", async () => {
    const one = await scope("one", beta);
    expect((await askScopeMove(as.carol, { scopeId: one, to: "acme" }, app)).outcome).toBe("moved");
    const two = await scope("two", beta);
    const asked = await askScopeMove(
      as.dave,
      { scopeId: two, to: "acme", message: "  Acme runs it now.  " },
      app,
    );
    expect(asked.outcome).toBe("requested");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "open",
      message: "Acme runs it now.",
      new_name: "two",
    });
    expect((await events("scope.move_requested"))[0]?.metadata).toMatchObject({
      scope: "@beta/two",
      to: "acme",
    });
    // Nobody but acme's admins and root answers it.
    for (const headers of [as.dave, as.bob])
      await expect(approveScopeMove(headers, { moveId: asked.moveId }, app)).rejects.toThrow(
        ScopeMoveNotFoundError,
      );
    expect((await approveScopeMove(as.carol, { moveId: asked.moveId }, app)).outcome).toBe("moved");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "approved",
      decided_by: who.carol.id,
    });
    expect((await events("scope.moved")).map((e) => e.metadata.direct)).toEqual([false, true]);
  });

  it("moves at once into the asker's own personal workspace", async () => {
    const one = await scope("one", beta);
    const mine = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", who.dave.id)
      .executeTakeFirstOrThrow();
    expect((await askScopeMove(as.dave, { scopeId: one, to: mine.name }, app)).outcome).toBe(
      "moved",
    );
    expect((await scopeOf(one)).workspace_id).toBe(mine.id);
  });

  it("needs someone else's answer for not-reviewed versions, and marks them reviewed by them", async () => {
    const mine = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", who.dave.id)
      .executeTakeFirstOrThrow();
    await setWorkspaceRole(app, who.dave.id, "admin", acme);
    const tools = await scope("tools", mine.id);
    const lint = await release(tools, "lint", [], false);
    const asked = await askScopeMove(as.dave, { scopeId: tools, to: "acme" }, app);
    expect(asked.outcome).toBe("requested");
    expect(asked.impact.notReviewed).toEqual([`@${mine.name}/tools/lint@1.0.0`]);
    await expect(approveScopeMove(as.dave, { moveId: asked.moveId }, app)).rejects.toThrow(
      ScopeMoveNotFoundError,
    );
    await approveScopeMove(as.carol, { moveId: asked.moveId }, app);
    const version = await t.db
      .selectFrom("item_versions")
      .select(["reviewed", "reviewed_by"])
      .where("item_id", "=", lint)
      .executeTakeFirstOrThrow();
    expect({ reviewed: Boolean(version.reviewed), by: version.reviewed_by }).toEqual({
      reviewed: true,
      by: who.carol.id,
    });
    expect((await events("scope.moved"))[0]?.metadata).toMatchObject({ reviewed: 1 });
    // Root asking with not-reviewed versions asks too, and can't answer itself.
    const others = await scope("others", mine.id);
    await release(others, "x", [], false);
    const rootAsked = await askScopeMove(as.root, { scopeId: others, to: "acme" }, app);
    expect(rootAsked.outcome).toBe("requested");
    await expect(approveScopeMove(as.root, { moveId: rootAsked.moveId }, app)).rejects.toThrow(
      ScopeMoveNotFoundError,
    );
  });

  it("refuses at ask with the list, and at approval leaves the request open", async () => {
    const infra = await scope("infra", beta);
    const deploy = await release(infra, "deploy");
    await release(await scope("team", acme), "app", [deploy]);
    const refused = await askScopeMove(
      as.root,
      { scopeId: infra, to: "vault", confirm: "infra" },
      app,
    ).catch((error) => error);
    expect(refused).toBeInstanceOf(ScopeMoveRefusedError);
    expect(refused.impact.outsideDependents).toEqual(["@acme/team/app"]);
    expect(await t.db.selectFrom("scope_moves").selectAll().execute()).toEqual([]);
    // Asked while nothing refuses it, then a dependent appears before the answer. Dave is in
    // vault, so he sees it.
    await setWorkspaceRole(app, who.dave.id, "user", vault);
    const other = await scope("other", beta);
    const kit = await release(other, "kit");
    const asked = await askScopeMove(as.dave, { scopeId: other, to: "vault" }, app);
    await release(await scope("late", acme), "late", [kit]);
    await expect(approveScopeMove(as.root, { moveId: asked.moveId }, app)).rejects.toThrow(
      ScopeMoveRefusedError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
    expect((await scopeOf(other)).workspace_id).toBe(beta);
  });

  it("refuses at approval a clash that appeared since, leaving the request open", async () => {
    const infra = await scope("infra", beta);
    const asked = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    await scope("infra", acme);
    const refused = await approveScopeMove(as.carol, { moveId: asked.moveId }, app).catch(
      (error) => error,
    );
    expect(refused).toBeInstanceOf(ScopeMoveRefusedError);
    expect(refused.impact.clash).toBe(true);
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
  });

  it("refuses the scope's own dependency on another private workspace, at ask and at approval", async () => {
    await setWorkspaceRole(app, who.dave.id, "user", vault);
    const lib = await release(await scope("secret", vault), "lib");
    const infra = await scope("infra", vault);
    await release(infra, "uses", [lib]);
    const refused = await askScopeMove(
      as.root,
      { scopeId: infra, to: "acme", confirm: "infra" },
      app,
    ).catch((error) => error);
    expect(refused).toBeInstanceOf(ScopeMoveRefusedError);
    expect(refused.impact.ownDependencies).toEqual([
      { item: "@vault/infra/uses", dependency: "@vault/secret/lib" },
    ]);
    // Asked while the dependency was public; it turned private before the answer.
    const open = (await createWorkspace(as.root, { name: "open", description: "Open." }, app)).id;
    const shared = await release(await scope("shared", open), "lib");
    const other = await scope("other", beta);
    await release(other, "uses", [shared]);
    const asked = await askScopeMove(as.dave, { scopeId: other, to: "acme" }, app);
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", open)
      .execute();
    await expect(approveScopeMove(as.carol, { moveId: asked.moveId }, app)).rejects.toThrow(
      ScopeMoveRefusedError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
  });

  it("lets nobody answer once no longer the target's admin, whatever their session says", async () => {
    const infra = await scope("infra", beta);
    const asked = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    const session = (await getCurrentUser(as.carol, app)) as CurrentUser;
    await setWorkspaceRole(app, who.carol.id, "user", acme);
    // Her session still says admin; the role read under the lock doesn't.
    const { approveScopeMove: approve } = await import("../services/scope-moves");
    const { kyselyWorkspaceRepository } = await import(
      "../repositories/kysely-workspace-repository"
    );
    await expect(
      approve(
        { repo: kyselyWorkspaceRepository(t.db, t.dialect) },
        { user: { ...session, workspaces: { ...session.workspaces, [acme]: "admin" } }, ip: null },
        { moveId: asked.moveId },
      ),
    ).rejects.toThrow(ScopeMoveNotFoundError);
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
  });

  it("lets no stale session answer: a root no longer root, or an admin who declines after demotion", async () => {
    const { approveScopeMove: approve, declineScopeMove: decline } = await import(
      "../services/scope-moves"
    );
    const { kyselyWorkspaceRepository } = await import(
      "../repositories/kysely-workspace-repository"
    );
    const repo = { repo: kyselyWorkspaceRepository(t.db, t.dialect) };
    // Ana is root when her session is read, then a plain user who administers global.
    await t.db.updateTable("user").set({ role: "root" }).where("id", "=", who.ana.id).execute();
    const asRootAna = (await getCurrentUser(await signedIn("ana@example.com"), app)) as CurrentUser;
    await t.db.updateTable("user").set({ role: "user" }).where("id", "=", who.ana.id).execute();
    await setWorkspaceRole(app, who.ana.id, "admin");
    const two = await scope("two", beta);
    const intoGlobal = await askScopeMove(as.dave, { scopeId: two, to: "global" }, app);
    await expect(
      approve(repo, { user: asRootAna, ip: null }, { moveId: intoGlobal.moveId }),
    ).rejects.toThrow(ScopeMoveNotFoundError);
    expect(await moveRow(intoGlobal.moveId)).toMatchObject({ status: "open" });
    // Carol, acme's admin when her session was read, declines after losing it.
    const infra = await scope("infra", beta);
    const asked = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    const carol = (await getCurrentUser(as.carol, app)) as CurrentUser;
    await setWorkspaceRole(app, who.carol.id, "user", acme);
    await expect(
      decline(repo, { user: carol, ip: null }, { moveId: asked.moveId }),
    ).rejects.toThrow(ScopeMoveNotFoundError);
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
  });

  it("counts the open moves into a workspace it deletes", async () => {
    const empty = (await createWorkspace(as.root, { name: "empty", description: "E." }, app)).id;
    const infra = await scope("infra", beta);
    await askScopeMove(as.dave, { scopeId: infra, to: "empty" }, app);
    const { deleteWorkspace } = await import("./workspaces");
    await deleteWorkspace(as.root, { name: "empty" }, app);
    expect(await t.db.selectFrom("scope_moves").selectAll().execute()).toEqual([]);
    expect((await events("workspace.deleted"))[0]?.metadata).toMatchObject({
      name: "empty",
      scopeMoves: 1,
    });
    void empty;
  });

  it("keeps one open move per scope", async () => {
    await setWorkspaceRole(app, who.dave.id, "user", vault);
    const infra = await scope("infra", beta);
    await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    await expect(askScopeMove(as.dave, { scopeId: infra, to: "vault" }, app)).rejects.toThrow(
      new ScopeMoveOpenError("acme"),
    );
    await expect(
      askScopeMove(as.root, { scopeId: infra, to: "vault", confirm: "infra" }, app),
    ).rejects.toThrow(ScopeMoveOpenError);
  });

  it("declines with a reason, answers once, and is cancelled by its asker or the scope's admins", async () => {
    const infra = await scope("infra", beta);
    const first = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    await declineScopeMove(as.carol, { moveId: first.moveId, reason: "Not ours." }, app);
    expect(await moveRow(first.moveId)).toMatchObject({ status: "declined", reason: "Not ours." });
    await expect(approveScopeMove(as.root, { moveId: first.moveId }, app)).rejects.toThrow(
      ScopeMoveAnsweredError,
    );
    const second = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    await expect(cancelScopeMove(as.bob, { moveId: second.moveId }, app)).rejects.toThrow(
      ScopeMoveNotFoundError,
    );
    await cancelScopeMove(as.dave, { moveId: second.moveId }, app);
    expect(await moveRow(second.moveId)).toMatchObject({ status: "cancelled" });
    const third = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    // Another admin of the scope's workspace may cancel it too.
    await cancelScopeMove(as.carol, { moveId: third.moveId }, app);
    expect((await events("scope.move_declined")).length).toBe(1);
    expect((await events("scope.move_cancelled")).length).toBe(2);
    // The message and the reason stay out of the audit log (094's rule).
    expect(JSON.stringify(await events("scope.move_declined"))).not.toContain("Not ours.");
  });

  it("answers two approvals at once once", async () => {
    const infra = await scope("infra", beta);
    const asked = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    const results = await Promise.allSettled([
      approveScopeMove(as.carol, { moveId: asked.moveId }, app),
      approveScopeMove(as.root, { moveId: asked.moveId }, app),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ScopeMoveAnsweredError);
    expect((await events("scope.moved")).length).toBe(1);
  });

  it("cancels a request whose asker can no longer move the scope, at approval", async () => {
    const infra = await scope("infra", beta);
    const asked = await askScopeMove(as.dave, { scopeId: infra, to: "acme" }, app);
    await setWorkspaceRole(app, who.dave.id, "user", beta);
    await expect(approveScopeMove(as.carol, { moveId: asked.moveId }, app)).rejects.toThrow(
      ScopeMoveAskerLostRoleError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "cancelled",
      reason: "asker_lost_role",
    });
    expect((await scopeOf(infra)).workspace_id).toBe(beta);
    expect((await events("scope.move_cancelled"))[0]?.metadata).toMatchObject({
      reason: "asker_lost_role",
    });
  });

  it("renames the scope for a clash, and moves it back where it came from", async () => {
    const infra = await scope("infra", beta);
    const deploy = await release(infra, "deploy");
    await scope("infra", acme);
    const refused = await askScopeMove(as.carol, { scopeId: infra, to: "acme" }, app).catch(
      (error) => error,
    );
    expect(refused).toBeInstanceOf(ScopeMoveRefusedError);
    expect(refused.impact.clash).toBe(true);
    await askScopeMove(as.carol, { scopeId: infra, to: "acme", name: "infra-tools" }, app);
    expect(await scopeOf(infra)).toEqual({ workspace_id: acme, name: "infra-tools" });
    await askScopeMove(as.carol, { scopeId: infra, to: "beta", name: "infra" }, app);
    expect(await scopeOf(infra)).toEqual({ workspace_id: beta, name: "infra" });
    const aliases = (
      await t.db
        .selectFrom("item_aliases")
        .select("name")
        .where("item_id", "=", deploy)
        .orderBy("name")
        .execute()
    ).map((row) => row.name);
    // Its name again is no old name of its own; the one it had in acme is.
    expect(aliases).toEqual(["@acme/infra-tools/deploy"]);
  });

  it("names the scope's items anew in its drafts and submissions not released yet", async () => {
    await createDraftIn("beta");
    const infra = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", "infra")
        .where("workspace_id", "=", beta)
        .executeTakeFirstOrThrow()
    ).id;
    await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    const file = await t.db
      .selectFrom("submission_files")
      .select("content")
      .where("path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow();
    expect(file.content).toContain('name: "@acme/infra/wip"');
  });

  it("lets a release and a move at the same time end consistently", async () => {
    const id = await createDraftIn("beta");
    await submitDraft(as.root, id, app, storage);
    await decide(as.root, id, { decision: "override" }, app);
    const infra = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", "infra")
        .executeTakeFirstOrThrow()
    ).id;
    const [released, moved] = await Promise.allSettled([
      publishSubmission(as.root, id, { choice: { kind: "stable", bump: "minor" } }, app, storage),
      askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app),
    ]);
    expect(moved.status).toBe("fulfilled");
    expect((await scopeOf(infra)).workspace_id).toBe(acme);
    if (released.status === "rejected") expect(released.reason).toBeInstanceOf(ScopeMovedError);
    else {
      // Released before the move (moved with its scope, its old name kept) or after it (under
      // the new name): either way it's in the scope, which is in acme, and found by its new name.
      const item = await kyselyItemRepository(t.db, t.dialect, UNFILTERED).findByName({
        workspace: "acme",
        scope: "infra",
        name: "wip",
      });
      expect(item?.scope.id).toBe(infra);
    }
  });

  // Two transactions at once: SQLite runs one writer at a time.
  it.skipIf(
    process.env.TEST_DATABASE_URL === undefined ||
      process.env.TEST_DATABASE_URL.startsWith("file:"),
  )("refuses a release whose dependency moved between its lookup and its locks", async () => {
    const infra = await scope("infra", beta);
    const deploy = await release(infra, "deploy");
    await scope("team", acme);
    const draft = await createDraft(
      as.root,
      { scope: "@acme/team", name: "app", type: "mcp-server" },
      app,
    );
    await saveDraftFiles(
      as.root,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@acme/team/app"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\ndependencies:\n  "@beta/infra/deploy": "^1.0.0"\n`,
            executable: false,
            loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(as.root, draft.id, app, storage);
    await decide(as.root, draft.id, { decision: "override" }, app);
    // Hold the dependency's row while the release looks it up, then move its scope into private
    // vault, keep its old name, and let the release take its locks.
    let held = () => {};
    const holding = new Promise<void>((done) => {
      held = done;
    });
    const moving = t.db.transaction().execute(async (trx) => {
      await sql`select id from items where id = ${deploy} for update`.execute(trx);
      held();
      await new Promise((done) => setTimeout(done, 400));
      await trx
        .updateTable("scopes")
        .set({ workspace_id: vault })
        .where("id", "=", infra)
        .execute();
      await trx
        .insertInto("item_aliases")
        .values({
          name: "@beta/infra/deploy",
          item_id: deploy,
          reason: "move",
          created_at: toDbDate(new Date(), t.dialect),
        })
        .execute();
    });
    await holding;
    const releasing = publishSubmission(
      as.root,
      draft.id,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    await moving;
    await expect(releasing).rejects.toThrow(ScopeMovedError);
  });

  it("refuses a release packed under the scope's old workspace", async () => {
    const id = await createDraftIn("beta");
    await submitDraft(as.root, id, app, storage);
    await decide(as.root, id, { decision: "override" }, app);
    const infra = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", "infra")
        .executeTakeFirstOrThrow()
    ).id;
    // The move lands between packing (stored under @beta/…) and recording the release.
    const moving: StorageAdapter = {
      ...storage,
      put: async (path, bytes) => {
        await storage.put(path, bytes);
        await t.db
          .updateTable("scopes")
          .set({ workspace_id: acme })
          .where("id", "=", infra)
          .execute();
      },
    };
    await expect(
      publishSubmission(as.root, id, { choice: { kind: "stable", bump: "minor" } }, app, moving),
    ).rejects.toThrow(ScopeMovedError);
    expect(await t.db.selectFrom("items").select("id").execute()).toHaveLength(0);
  });
});

/** Root's draft `@{workspace}/infra/wip`, in a scope `infra` made for it. */
const createDraftIn = async (workspaceName: string) => {
  const workspaceId = workspaceName === "beta" ? beta : acme;
  await scope("infra", workspaceId);
  const draft = await createDraft(
    as.root,
    { scope: `@${workspaceName}/infra`, name: "wip", type: "mcp-server" },
    app,
  );
  await saveDraftFiles(
    as.root,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@${workspaceName}/infra/wip"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft.id;
};
