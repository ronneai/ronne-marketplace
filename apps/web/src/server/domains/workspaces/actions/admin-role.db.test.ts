import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope, updateScopeDescription } from "../../items/actions/scopes";
import { GlobalWorkspaceError, OwnMembershipError } from "../exceptions/errors";
import { GLOBAL_WORKSPACE_ID } from "../models/workspace";
import {
  addMembers,
  changeMemberRole,
  createWorkspace,
  findWorkspace,
  listMembers,
  pageWorkspaces,
  removeMember,
  setUserWorkspaces,
  updateWorkspace,
  userMemberships,
} from "./workspaces";

// The admin role (092): a moderator of one workspace who also runs it, its members (admins
// included, never their own membership), its scopes and its description; nothing in another.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAdmin: Headers;
let asModerator: Headers;
let adminId: string;
let moderatorId: string;
let userId: string;
let acme: string;
let beta: string;
const password = "correct horse battery";

const headersFor = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await headersFor("root@example.com");
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(asRoot, { name: "beta", description: "Beta." }, app)).id;
  adminId = await createTestUser(app, { email: "a@example.com", password, name: "Ada" });
  moderatorId = await createTestUser(app, { email: "m@example.com", password, name: "Mo" });
  userId = await createTestUser(app, { email: "u@example.com", password, name: "Uma" });
  await setWorkspaceRole(app, adminId, "admin", acme);
  await setWorkspaceRole(app, moderatorId, "moderator", acme);
  asAdmin = await headersFor("a@example.com");
  asModerator = await headersFor("m@example.com");
});
afterEach(() => t.cleanup());

const roleIn = async (workspaceId: string, id: string) =>
  (await listMembers(asRoot, workspaceId, app)).find((m) => m.userId === id)?.role ?? null;

describe("an admin of acme (092)", () => {
  it("reviews and releases there, as a moderator does, and nowhere else", async () => {
    const admin = await getCurrentUser(asAdmin, app);
    for (const permission of [
      "submissions.review",
      "submissions.publish",
      "versions.manage",
    ] as const) {
      expect(can(admin, permission, acme), permission).toBe(true);
      expect(can(admin, permission, beta), permission).toBe(false);
    }
  });

  it("adds members, makes another admin, changes and removes them; every change audited", async () => {
    await addMembers(asAdmin, { workspaceId: acme, userIds: [userId], role: "moderator" }, app);
    await changeMemberRole(asAdmin, { workspaceId: acme, userId, role: "admin" }, app);
    expect(await roleIn(acme, userId)).toBe("admin");
    await changeMemberRole(asAdmin, { workspaceId: acme, userId: moderatorId, role: "user" }, app);
    await removeMember(asAdmin, { workspaceId: acme, userId: moderatorId }, app);
    expect(await roleIn(acme, moderatorId)).toBeNull();
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) =>
      e.action.startsWith("workspace.member_"),
    );
    expect(events.map((e) => e.actorId)).toEqual([adminId, adminId, adminId, adminId]);
  });

  it("never changes or removes their own membership, whatever case the id is sent in", async () => {
    for (const id of [adminId, adminId.toLowerCase()]) {
      // MySQL finds the user by an id in another case; elsewhere there's no such user.
      const refused = id === adminId || t.dialect === "mysql" ? OwnMembershipError : Error;
      await expect(
        changeMemberRole(asAdmin, { workspaceId: acme, userId: id, role: "user" }, app),
      ).rejects.toThrow(refused);
      await expect(removeMember(asAdmin, { workspaceId: acme, userId: id }, app)).rejects.toThrow(
        refused,
      );
    }
    expect(await roleIn(acme, adminId)).toBe("admin");
  });

  it("two admins demoting each other at once leave one admin, and the other is refused cleanly", async () => {
    const otherId = await createTestUser(app, { email: "b@example.com", password, name: "Bo" });
    const asOther = await headersFor("b@example.com");
    // Repeated, and with an id sent in lowercase too: a race shows only some of the time.
    for (const lower of [false, true, false, true, false, true]) {
      await setWorkspaceRole(app, adminId, "admin", acme);
      await setWorkspaceRole(app, otherId, "admin", acme);
      const results = await Promise.allSettled([
        changeMemberRole(asAdmin, { workspaceId: acme, userId: otherId, role: "user" }, app),
        changeMemberRole(
          asOther,
          { workspaceId: acme, userId: lower ? adminId.toLowerCase() : adminId, role: "user" },
          app,
        ),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const reasons = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
      // The lowercase id is no user at all outside MySQL; it's refused before any lock.
      if (lower && t.dialect !== "mysql") {
        expect(reasons.every((reason) => !String(reason).includes("Deadlock"))).toBe(true);
        continue;
      }
      expect(fulfilled).toHaveLength(1);
      expect(reasons[0]).toBeInstanceOf(ForbiddenError);
      const roles = [await roleIn(acme, adminId), await roleIn(acme, otherId)].sort();
      expect(roles).toEqual(["admin", "user"]);
    }
  });

  it("does nothing to another workspace's members, nor a user's whole set", async () => {
    for (const attempt of [
      () => listMembers(asAdmin, beta, app),
      () => addMembers(asAdmin, { workspaceId: beta, userIds: [userId], role: "user" }, app),
      () =>
        changeMemberRole(
          asAdmin,
          { workspaceId: GLOBAL_WORKSPACE_ID, userId, role: "moderator" },
          app,
        ),
      () => removeMember(asAdmin, { workspaceId: beta, userId }, app),
      () => userMemberships(asAdmin, userId, app),
      () => setUserWorkspaces(asAdmin, { userId, workspaces: [] }, app),
    ])
      await expect(attempt()).rejects.toThrow(ForbiddenError);
  });

  it("creates scopes in acme and edits them, and acme's description; not beta's or global's", async () => {
    const scope = await createScope(
      asAdmin,
      { name: "acme-infra", description: "Infra.", workspaceId: acme },
      app,
    );
    expect(scope.workspace.name).toBe("acme");
    await updateScopeDescription(
      asAdmin,
      { name: "acme-infra", description: "Infrastructure." },
      app,
    );
    await createScope(
      asRoot,
      { name: "beta-tools", description: "Beta's.", workspaceId: beta },
      app,
    );
    await expect(
      updateScopeDescription(asAdmin, { name: "beta-tools", description: "Mine." }, app),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createScope(asAdmin, { name: "beta-x", description: "X.", workspaceId: beta }, app),
    ).rejects.toThrow(ForbiddenError);
    await expect(createScope(asAdmin, { name: "glob-x", description: "X." }, app)).rejects.toThrow(
      ForbiddenError,
    );
    await updateWorkspace(asAdmin, { name: "acme", description: "Acme's teams." }, app);
    await expect(
      updateWorkspace(asAdmin, { name: "beta", description: "Mine." }, app),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateWorkspace(asAdmin, { name: "global", description: "Mine." }, app),
    ).rejects.toThrow(GlobalWorkspaceError);
  });

  it("lists and opens only the workspaces they administer", async () => {
    expect((await pageWorkspaces(asAdmin, {}, app)).workspaces.map((w) => w.name)).toEqual([
      "acme",
    ]);
    expect((await pageWorkspaces(asAdmin, {}, app)).total).toEqual({ count: 1, capped: false });
    expect((await findWorkspace(asAdmin, "acme", app))?.name).toBe("acme");
    expect(await findWorkspace(asAdmin, "beta", app)).toBeNull();
    expect(await findWorkspace(asAdmin, "global", app)).toBeNull();
  });
});

describe("an admin of global (092)", () => {
  it("manages global's roles, and still can't remove anyone from it", async () => {
    await setWorkspaceRole(app, adminId, "admin");
    await changeMemberRole(
      asAdmin,
      { workspaceId: GLOBAL_WORKSPACE_ID, userId, role: "moderator" },
      app,
    );
    expect(await roleIn(GLOBAL_WORKSPACE_ID, userId)).toBe("moderator");
    await expect(
      removeMember(asAdmin, { workspaceId: GLOBAL_WORKSPACE_ID, userId }, app),
    ).rejects.toThrow();
    expect((await pageWorkspaces(asAdmin, {}, app)).workspaces.map((w) => w.name)).toEqual([
      "global",
      "acme",
    ]);
  });
});

describe("a moderator (092)", () => {
  it("reviews in acme, but doesn't manage its members, scopes or description", async () => {
    for (const attempt of [
      () => listMembers(asModerator, acme, app),
      () => addMembers(asModerator, { workspaceId: acme, userIds: [userId], role: "user" }, app),
      () => createScope(asModerator, { name: "m-x", description: "X.", workspaceId: acme }, app),
      () => updateWorkspace(asModerator, { name: "acme", description: "Mine." }, app),
      () => pageWorkspaces(asModerator, {}, app),
    ])
      await expect(attempt()).rejects.toThrow(ForbiddenError);
  });

  it("counts with the admins as acme's reviewers", async () => {
    expect((await findWorkspace(asRoot, "acme", app))?.moderators).toBe(2);
  });
});
