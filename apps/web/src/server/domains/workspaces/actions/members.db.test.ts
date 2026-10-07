import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import {
  GlobalMembershipError,
  InvalidMemberRoleError,
  MemberUserNotFoundError,
  NotAWorkspaceMemberError,
  RootMembershipError,
} from "../exceptions/errors";
import { GLOBAL_WORKSPACE_ID } from "../models/workspace";
import {
  addMembers,
  changeMemberRole,
  createWorkspace,
  deleteWorkspace,
  listMembers,
  removeMember,
  setUserWorkspaces,
  userMemberships,
} from "./workspaces";

// Workspace members (092): only root manages them; nobody leaves global; every change is audited.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asUser: Headers;
let asModerator: Headers;
let rootId: string;
let userId: string;
let otherId: string;
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
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  userId = await createTestUser(app, { email: "u@example.com", password, name: "Uma" });
  otherId = await createTestUser(app, { email: "o@example.com", password, name: "Otto" });
  await createTestUser(app, { email: "m@example.com", password, role: "moderator" });
  asRoot = await headersFor("root@example.com");
  asUser = await headersFor("u@example.com");
  asModerator = await headersFor("m@example.com");
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(asRoot, { name: "beta", description: "Beta." }, app)).id;
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const roles = async (id: string) =>
  Object.fromEntries((await userMemberships(asRoot, id, app)).map((m) => [m.workspace, m.role]));

describe("adding, changing and removing members (092)", () => {
  it("adds people with one role, leaves a member as they are, and audits each", async () => {
    expect(
      await addMembers(
        asRoot,
        { workspaceId: acme, userIds: [userId, otherId], role: "moderator" },
        app,
      ),
    ).toEqual([
      { userId, result: "added" },
      { userId: otherId, result: "added" },
    ]);
    expect(
      await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app),
    ).toEqual([{ userId, result: "already_member" }]);
    expect(await roles(userId)).toEqual({ global: "user", acme: "moderator" });
    expect((await listMembers(asRoot, acme, app)).map((m) => [m.name, m.role])).toEqual([
      ["Otto", "moderator"],
      ["Uma", "moderator"],
    ]);
    const added = await events("workspace.member_added");
    expect(added).toHaveLength(2);
    expect(added.find((e) => e.targetId === userId)).toMatchObject({
      actorId: rootId,
      metadata: { workspace: "acme", email: "u@example.com", role: "moderator" },
    });
  });

  it("changes a role, in global too, and audits from and to; the same role changes nothing", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    await changeMemberRole(asRoot, { workspaceId: acme, userId, role: "moderator" }, app);
    await changeMemberRole(asRoot, { workspaceId: acme, userId, role: "moderator" }, app);
    await changeMemberRole(
      asRoot,
      { workspaceId: GLOBAL_WORKSPACE_ID, userId, role: "moderator" },
      app,
    );
    expect(await roles(userId)).toEqual({ global: "moderator", acme: "moderator" });
    expect((await events("workspace.member_role_changed")).map((e) => e.metadata)).toEqual(
      expect.arrayContaining([
        { workspace: "acme", email: "u@example.com", from: "user", to: "moderator" },
        { workspace: "global", email: "u@example.com", from: "user", to: "moderator" },
      ]),
    );
    expect(await events("workspace.member_role_changed")).toHaveLength(2);
    await expect(
      changeMemberRole(asRoot, { workspaceId: beta, userId, role: "user" }, app),
    ).rejects.toThrow(NotAWorkspaceMemberError);
    await expect(
      changeMemberRole(asRoot, { workspaceId: acme, userId, role: "admin" }, app),
    ).rejects.toThrow(InvalidMemberRoleError);
  });

  it("removes a member, audited, and refuses global", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "moderator" }, app);
    await removeMember(asRoot, { workspaceId: acme, userId }, app);
    expect(await roles(userId)).toEqual({ global: "user" });
    expect((await events("workspace.member_removed"))[0]?.metadata).toEqual({
      workspace: "acme",
      email: "u@example.com",
      role: "moderator",
    });
    await expect(
      removeMember(asRoot, { workspaceId: GLOBAL_WORKSPACE_ID, userId }, app),
    ).rejects.toThrow(GlobalMembershipError);
    expect(await roles(userId)).toEqual({ global: "user" });
  });

  it("takes effect on the member's next request", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "moderator" }, app);
    expect(can(await getCurrentUser(asUser, app), "submissions.review", acme)).toBe(true);
    await removeMember(asRoot, { workspaceId: acme, userId }, app);
    expect(can(await getCurrentUser(asUser, app), "submissions.review", acme)).toBe(false);
  });

  it("refuses root and unknown users, and adds a disabled user", async () => {
    await expect(
      addMembers(asRoot, { workspaceId: acme, userIds: [rootId], role: "user" }, app),
    ).rejects.toThrow(RootMembershipError);
    await expect(
      addMembers(asRoot, { workspaceId: acme, userIds: [newId()], role: "user" }, app),
    ).rejects.toThrow(MemberUserNotFoundError);
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", otherId)
      .execute();
    await addMembers(asRoot, { workspaceId: acme, userIds: [otherId], role: "user" }, app);
    expect((await listMembers(asRoot, acme, app))[0]).toMatchObject({
      userId: otherId,
      disabled: true,
    });
    expect(await events("workspace.member_added")).toHaveLength(1);
  });
});

describe("a user's workspaces at once (092)", () => {
  it("applies the difference in one go, an event per change, and keeps global", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    expect(
      await setUserWorkspaces(
        asRoot,
        {
          userId,
          workspaces: [
            { workspaceId: acme, role: "moderator" },
            { workspaceId: beta, role: "user" },
          ],
        },
        app,
      ),
    ).toEqual({ added: 1, changed: 1, removed: 0 });
    expect(await roles(userId)).toEqual({ global: "user", acme: "moderator", beta: "user" });
    expect(
      await setUserWorkspaces(
        asRoot,
        { userId, workspaces: [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "moderator" }] },
        app,
      ),
    ).toEqual({ added: 0, changed: 1, removed: 2 });
    expect(await roles(userId)).toEqual({ global: "moderator" });
    expect(await events("workspace.member_added")).toHaveLength(2);
    expect(await events("workspace.member_role_changed")).toHaveLength(2);
    expect(await events("workspace.member_removed")).toHaveLength(2);
  });

  it("changes nothing, and records nothing, when a step fails", async () => {
    await expect(
      setUserWorkspaces(
        asRoot,
        {
          userId,
          workspaces: [
            { workspaceId: acme, role: "moderator" },
            { workspaceId: newId(), role: "user" },
          ],
        },
        app,
      ),
    ).rejects.toThrow();
    expect(await roles(userId)).toEqual({ global: "user" });
    expect(await events("workspace.member_added")).toEqual([]);
  });

  it("refuses root's own memberships", async () => {
    await expect(userMemberships(asRoot, rootId, app)).rejects.toThrow(RootMembershipError);
    await expect(
      setUserWorkspaces(asRoot, { userId: rootId, workspaces: [] }, app),
    ).rejects.toThrow(RootMembershipError);
  });
});

describe("two roots at once, and ids as sent (092)", () => {
  it("runs two edits of one user one after the other: both apply, both audited, no deadlock", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    await createTestUser(app, { email: "root2@example.com", password, role: "root" });
    const asRoot2 = await headersFor("root2@example.com");
    const results = await Promise.allSettled([
      setUserWorkspaces(asRoot, { userId, workspaces: [{ workspaceId: beta, role: "user" }] }, app),
      setUserWorkspaces(
        asRoot2,
        {
          userId,
          workspaces: [
            { workspaceId: acme, role: "moderator" },
            { workspaceId: beta, role: "moderator" },
          ],
        },
        app,
      ),
      addMembers(asRoot, { workspaceId: acme, userIds: [otherId], role: "user" }, app),
      addMembers(asRoot2, { workspaceId: acme, userIds: [otherId], role: "moderator" }, app),
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    // The second add found the first's row: one "added", one "already_member", one role kept.
    const adds = results
      .slice(2)
      .flatMap((r) => (r.status === "fulfilled" ? (r.value as { result: string }[]) : []))
      .map((r) => r.result)
      .sort();
    expect(adds).toEqual(["added", "already_member"]);
    expect(
      (await events("workspace.member_added")).filter((e) => e.targetId === otherId),
    ).toHaveLength(1);
    const final = await roles(userId);
    expect(final.global).toBe("user");
    expect(["user", "moderator"]).toContain(final.beta);
  });

  it("uses each workspace's own id, so an id in another case changes the role and removes nothing", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    const lower = acme.toLowerCase();
    const sent = lower === acme ? acme : lower;
    const attempt = setUserWorkspaces(
      asRoot,
      { userId, workspaces: [{ workspaceId: sent, role: "moderator" }] },
      app,
    );
    if (t.dialect === "mysql" || sent === acme) {
      // MySQL finds it in any case: it's acme, with its role changed, not added and removed.
      expect(await attempt).toEqual({ added: 0, changed: 1, removed: 0 });
      expect(await roles(userId)).toEqual({ global: "user", acme: "moderator" });
    } else {
      // Elsewhere an id in another case is no workspace at all, and nothing changes.
      await expect(attempt).rejects.toThrow();
      expect(await roles(userId)).toEqual({ global: "user", acme: "user" });
    }
    expect(await events("workspace.member_removed")).toEqual([]);
  });

  it("leaves a root out of the members list; their rows count again once they're not root", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "moderator" }, app);
    await t.db.updateTable("user").set({ role: "root" }).where("id", "=", userId).execute();
    expect(await listMembers(asRoot, acme, app)).toEqual([]);
    await t.db.updateTable("user").set({ role: "user" }).where("id", "=", userId).execute();
    expect((await listMembers(asRoot, acme, app)).map((m) => m.userId)).toEqual([userId]);
  });
});

describe("who may (092)", () => {
  it("is root only: users and moderators can't list or change members", async () => {
    for (const headers of [asUser, asModerator, new Headers()]) {
      await expect(listMembers(headers, acme, app)).rejects.toThrow(ForbiddenError);
      await expect(userMemberships(headers, userId, app)).rejects.toThrow(ForbiddenError);
      await expect(
        addMembers(headers, { workspaceId: acme, userIds: [userId], role: "moderator" }, app),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        changeMemberRole(
          headers,
          { workspaceId: GLOBAL_WORKSPACE_ID, userId, role: "moderator" },
          app,
        ),
      ).rejects.toThrow(ForbiddenError);
      await expect(removeMember(headers, { workspaceId: acme, userId }, app)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(setUserWorkspaces(headers, { userId, workspaces: [] }, app)).rejects.toThrow(
        ForbiddenError,
      );
    }
    expect(await roles(userId)).toEqual({ global: "user" });
  });
});

describe("deleting a workspace with members (092)", () => {
  it("removes its memberships, and the event says how many", async () => {
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId, otherId], role: "user" }, app);
    await deleteWorkspace(asRoot, { name: "acme" }, app);
    expect(await roles(userId)).toEqual({ global: "user" });
    expect((await events("workspace.deleted"))[0]?.metadata).toEqual({ name: "acme", members: 2 });
  });
});
