import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { rollbackProbe, throwAfterNotify } from "../../notifications/testing/throw-after-notify";
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

vi.mock("../../notifications/services/notify", async (original) =>
  throwAfterNotify(await original<{ notify: (...a: never[]) => Promise<number> }>()),
);

// Atomicity of what the workspace services tell people (139, task 3): when the change fails right
// after its notification was written, the notification goes with it, and so do the change and its
// audit event. Each case then runs the same call again, unarmed, to show it was only the failure
// that kept it from being written.
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

const count = async (table: "notifications" | "audit_log") =>
  Number(
    (
      await t.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

const scopeIn = (name: string, workspaceId: string) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

const itemIn = async (scopeId: string, name: string) => {
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
    reviewed: true,
  });
  return itemId;
};

const memberRole = async (workspace: string, user: string) =>
  (
    await t.db
      .selectFrom("workspace_members")
      .select("role")
      .where("workspace_id", "=", workspace)
      .where("user_id", "=", user)
      .executeTakeFirst()
  )?.role ?? null;

const requestOf = async (user: string) =>
  t.db
    .selectFrom("workspace_access_requests")
    .select(["id", "status"])
    .where("user_id", "=", user)
    .execute();

/**
 * Runs `change` armed and expects it to fail after its notification; then nothing is left: no
 * notification, no audit event, and `state()` reads as before. Then runs it again, unarmed.
 */
const rollsBack = async <S>(change: () => Promise<unknown>, state: () => Promise<S>) => {
  const [before, audits] = [await state(), await count("audit_log")];
  const notified = await count("notifications");
  rollbackProbe.armed = true;
  try {
    await expect(change()).rejects.toThrow("failed after notify");
  } finally {
    rollbackProbe.armed = false;
  }
  expect(await count("notifications")).toBe(notified);
  expect(await count("audit_log")).toBe(audits);
  expect(await state()).toEqual(before);
  // The control: the same call, not armed, goes through and tells someone.
  await change();
  expect(await count("notifications")).toBeGreaterThan(notified);
  expect(await count("audit_log")).toBeGreaterThan(audits);
  expect(await state()).not.toEqual(before);
};

beforeEach(async () => {
  rollbackProbe.armed = false;
  t = await createTestDb();
  app = testAppAuth(t);
  id.root = (
    await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password })
  ).id;
  for (const name of ["ana", "bob", "mod", "adm", "dave"])
    id[name] = await createTestUser(app, { email: `${name}@example.com`, password, name });
  as.root = await signedIn("root@example.com");
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(as.root, { name: "beta", description: "Beta." }, app)).id;
  await setWorkspaceRole(app, id.ana as string, "user", acme);
  await setWorkspaceRole(app, id.mod as string, "moderator", acme);
  await setWorkspaceRole(app, id.adm as string, "admin", acme);
  await setWorkspaceRole(app, id.dave as string, "admin", beta);
  for (const name of ["ana", "bob", "mod", "adm", "dave"])
    as[name] = await signedIn(`${name}@example.com`);
  await t.db.deleteFrom("notifications").execute();
});
afterEach(() => {
  rollbackProbe.armed = false;
  return t.cleanup();
});

describe("joining a workspace (094)", () => {
  it("asking leaves no request, audit event or notification when it fails after notifying", async () => {
    await rollsBack(
      () => requestAccess(as.bob as Headers, { workspace: "acme" }, app),
      () => requestOf(id.bob as string),
    );
  });

  it("approving leaves the request open and the asker out", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    await t.db.deleteFrom("notifications").execute();
    const [request] = await requestOf(id.bob as string);
    await rollsBack(
      () => approveAccessRequest(as.mod as Headers, { requestId: request?.id as string }, app),
      async () => [await requestOf(id.bob as string), await memberRole(acme, id.bob as string)],
    );
  });

  it("declining leaves the request open", async () => {
    await requestAccess(as.bob as Headers, { workspace: "acme" }, app);
    await t.db.deleteFrom("notifications").execute();
    const [request] = await requestOf(id.bob as string);
    await rollsBack(
      () => declineAccessRequest(as.adm as Headers, { requestId: request?.id as string }, app),
      () => requestOf(id.bob as string),
    );
  });
});

describe("a member's changes (092)", () => {
  it("adding leaves the person out", async () => {
    await rollsBack(
      () =>
        addMembers(
          as.adm as Headers,
          { workspaceId: acme, userIds: [id.bob as string], role: "user" },
          app,
        ),
      () => memberRole(acme, id.bob as string),
    );
  });

  it("changing a role leaves the role", async () => {
    await rollsBack(
      () =>
        changeMemberRole(
          as.adm as Headers,
          { workspaceId: acme, userId: id.ana as string, role: "moderator" },
          app,
        ),
      () => memberRole(acme, id.ana as string),
    );
  });

  it("removing leaves the member in", async () => {
    await rollsBack(
      () => removeMember(as.adm as Headers, { workspaceId: acme, userId: id.ana as string }, app),
      () => memberRole(acme, id.ana as string),
    );
  });

  it("the Workspaces dialog leaves every membership as it was", async () => {
    await rollsBack(
      () =>
        setUserWorkspaces(
          as.root as Headers,
          {
            userId: id.ana as string,
            workspaces: [
              { workspaceId: acme, role: "moderator" },
              { workspaceId: beta, role: "user" },
            ],
          },
          app,
        ),
      async () => [
        await memberRole(acme, id.ana as string),
        await memberRole(beta, id.ana as string),
      ],
    );
  });
});

const scopeMoves = () =>
  t.db.selectFrom("scope_moves").select(["id", "status", "scope_id"]).execute();
const scopeWorkspace = async (scope: string) =>
  (
    await t.db
      .selectFrom("scopes")
      .select("workspace_id")
      .where("id", "=", scope)
      .executeTakeFirstOrThrow()
  ).workspace_id;

describe("moving a scope (115)", () => {
  it("asking leaves no request", async () => {
    const infra = await scopeIn("infra", beta);
    await rollsBack(
      () => askScopeMove(as.dave as Headers, { scopeId: infra, to: "acme" }, app),
      scopeMoves,
    );
  });

  it("approving leaves the request open and the scope where it was", async () => {
    const infra = await scopeIn("infra", beta);
    const asked = await askScopeMove(as.dave as Headers, { scopeId: infra, to: "acme" }, app);
    await t.db.deleteFrom("notifications").execute();
    await rollsBack(
      () => approveScopeMove(as.adm as Headers, { moveId: asked.moveId as string }, app),
      async () => [await scopeMoves(), await scopeWorkspace(infra)],
    );
  });

  it("declining leaves the request open", async () => {
    const infra = await scopeIn("infra", beta);
    const asked = await askScopeMove(as.dave as Headers, { scopeId: infra, to: "acme" }, app);
    await t.db.deleteFrom("notifications").execute();
    await rollsBack(
      () => declineScopeMove(as.adm as Headers, { moveId: asked.moveId as string }, app),
      scopeMoves,
    );
  });
});

const itemMoves = () => t.db.selectFrom("item_moves").select(["id", "status", "item_id"]).execute();
const itemScope = async (item: string) =>
  (
    await t.db
      .selectFrom("items")
      .select("scope_id")
      .where("id", "=", item)
      .executeTakeFirstOrThrow()
  ).scope_id;

describe("moving an item (134)", () => {
  it("asking leaves no request", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    await rollsBack(
      () => askItemMove(as.ana as Headers, { itemId: deploy, toScopeId: devops }, app),
      itemMoves,
    );
  });

  it("approving leaves the request open and the item where it was", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    const asked = await askItemMove(as.ana as Headers, { itemId: deploy, toScopeId: devops }, app);
    await t.db.deleteFrom("notifications").execute();
    await rollsBack(
      () => approveItemMove(as.mod as Headers, { moveId: asked.moveId as string }, app),
      async () => [await itemMoves(), await itemScope(deploy)],
    );
  });

  it("declining leaves the request open", async () => {
    const infra = await scopeIn("infra", acme);
    const devops = await scopeIn("devops", acme);
    const deploy = await itemIn(infra, "deploy");
    const asked = await askItemMove(as.ana as Headers, { itemId: deploy, toScopeId: devops }, app);
    await t.db.deleteFrom("notifications").execute();
    await rollsBack(
      () => declineItemMove(as.adm as Headers, { moveId: asked.moveId as string }, app),
      itemMoves,
    );
  });
});
