import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { adminDisableUser } from "../../identity/actions/user-admin";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import {
  AccessRequestAnsweredError,
  AccessRequestNotFoundError,
  AccessRequestTooSoonError,
  InvalidAccessRequestTextError,
  InvalidRequestRoleError,
  TooManyAccessRequestsError,
} from "../exceptions/errors";
import {
  addMembers,
  approveAccessRequest,
  cancelAccessRequest,
  createWorkspace,
  declineAccessRequest,
  deleteWorkspace,
  joinTarget,
  myWorkspaces,
  ownRequests,
  pendingRequests,
  removeMember,
  requestAccess,
  requestsToAnswer,
  requestsToAnswerList,
  setUserWorkspaces,
  setWorkspaceVisibility,
  userMemberships,
} from "./workspaces";

// Asking to join a workspace (094): anyone asks, root or the workspace's moderators and admins
// answer, the first answer wins, and every step is audited.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asUser: Headers;
let asModerator: Headers;
let asOtherModerator: Headers;
let asBetaModerator: Headers;
let asAdmin: Headers;
let rootId: string;
let userId: string;
let moderatorId: string;
let acme: string;
let beta: string;
const password = "correct horse battery";
const DAY = 24 * 60 * 60 * 1000;

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
  moderatorId = await createTestUser(app, { email: "m@example.com", password, name: "Mo" });
  const otherModeratorId = await createTestUser(app, { email: "n@example.com", password });
  const betaModeratorId = await createTestUser(app, { email: "b@example.com", password });
  const adminId = await createTestUser(app, { email: "a@example.com", password });
  asRoot = await headersFor("root@example.com");
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(asRoot, { name: "beta", description: "Beta." }, app)).id;
  await setWorkspaceRole(app, moderatorId, "moderator", acme);
  await setWorkspaceRole(app, otherModeratorId, "moderator", acme);
  await setWorkspaceRole(app, betaModeratorId, "moderator", beta);
  await setWorkspaceRole(app, adminId, "admin", acme);
  asUser = await headersFor("u@example.com");
  asModerator = await headersFor("m@example.com");
  asOtherModerator = await headersFor("n@example.com");
  asBetaModerator = await headersFor("b@example.com");
  asAdmin = await headersFor("a@example.com");
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const rows = () =>
  t.db
    .selectFrom("workspace_access_requests")
    .select(["id", "workspace_id", "user_id", "status", "decided_by", "reason", "message"])
    .orderBy("created_at")
    .orderBy("id")
    .execute();

const roles = async (id: string) =>
  Object.fromEntries((await userMemberships(asRoot, id, app)).map((m) => [m.workspace, m.role]));

/** Asks to join acme as the user and returns the request's id. */
const ask = async (workspace = "acme", message?: string) => {
  expect(await requestAccess(asUser, { workspace, message }, app)).toBe("sent");
  const all = await rows();
  return all[all.length - 1]?.id as string;
};

const makePrivate = (name: string) =>
  setWorkspaceVisibility(asRoot, { name, visibility: "private" }, app);

describe("asking to join (094)", () => {
  it("asks once, keeps the message, says so again rather than asking twice, and audits", async () => {
    await ask("acme", "  I review Acme's agents.  ");
    expect(await requestAccess(asUser, { workspace: "ACME " }, app)).toBe("already_requested");
    expect(await rows()).toEqual([
      expect.objectContaining({
        workspace_id: acme,
        user_id: userId,
        status: "open",
        message: "I review Acme's agents.",
      }),
    ]);
    expect(await events("workspace.access_requested")).toEqual([
      expect.objectContaining({
        actorId: userId,
        targetId: userId,
        metadata: { workspace: "acme", email: "u@example.com" },
      }),
    ]);
  });

  it("asks nothing of members and root: they're in already", async () => {
    expect(await requestAccess(asModerator, { workspace: "acme" }, app)).toBe("already_member");
    expect(await requestAccess(asUser, { workspace: "global" }, app)).toBe("already_member");
    expect(await requestAccess(asRoot, { workspace: "acme" }, app)).toBe("already_member");
    expect(await rows()).toEqual([]);
  });

  it("treats a private name and an unknown one alike, before and after asking", async () => {
    await makePrivate("acme");
    for (const name of ["acme", "nowhere"])
      expect(await requestAccess(asUser, { workspace: name }, app)).toBe("sent");
    // A name no workspace could have isn't kept: it can't exist, so it tells nothing.
    for (const name of ["Not a name!", "admin", "root", "api"])
      expect(await requestAccess(asUser, { workspace: name }, app)).toBe("sent");
    expect((await rows()).map((r) => r.workspace_id)).toEqual([acme, null]);
    for (const name of ["acme", "nowhere"])
      expect(await requestAccess(asUser, { workspace: name }, app)).toBe("already_requested");
    // The requester sees both as names only: no description, no visibility.
    const own = await ownRequests(asUser, app);
    expect(own.map((r) => [r.workspace, r.status, r.description, r.visibility])).toEqual([
      ["nowhere", "open", null, null],
      ["acme", "open", null, null],
    ]);
    // Both count against the limit, and both can be cancelled.
    for (const request of own) await cancelAccessRequest(asUser, request.id, app);
    expect((await rows()).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
  });

  it("gives a request to a name to the workspace created with it later", async () => {
    await ask("later");
    expect(await requestsToAnswer(asRoot, app)).toBe(0);
    const later = (await createWorkspace(asRoot, { name: "later", description: "L." }, app)).id;
    expect((await pendingRequests(asRoot, later, app)).requests.map((r) => r.userId)).toEqual([
      userId,
    ]);
    expect(await requestsToAnswer(asRoot, app)).toBe(1);
  });

  it("refuses a NUL character in a message or a reason on every database", async () => {
    await expect(
      requestAccess(asUser, { workspace: "acme", message: "a\u0000b" }, app),
    ).rejects.toBeInstanceOf(InvalidAccessRequestTextError);
    const id = await ask();
    await expect(
      declineAccessRequest(asModerator, { requestId: id, reason: "a\u0000b" }, app),
    ).rejects.toBeInstanceOf(InvalidAccessRequestTextError);
  });

  it("keeps one open request when the same user asks several times at once", async () => {
    for (let round = 0; round < 3; round++) {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => requestAccess(asUser, { workspace: "acme" }, app)),
      );
      expect(results.filter((r) => r === "sent")).toHaveLength(round === 0 ? 1 : 0);
      expect((await rows()).filter((r) => r.status === "open")).toHaveLength(1);
    }
  });

  it("holds the limit when 14 requests are sent at once", async () => {
    for (let i = 0; i < 14; i++)
      await createWorkspace(asRoot, { name: `team${i}`, description: "A team." }, app);
    const results = await Promise.allSettled(
      Array.from({ length: 14 }, (_, i) => requestAccess(asUser, { workspace: `team${i}` }, app)),
    );
    const refused = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    expect(refused).toHaveLength(4);
    for (const reason of refused) expect(reason).toBeInstanceOf(TooManyAccessRequestsError);
    expect(await rows()).toHaveLength(10);
  });

  it("refuses a message over 500 characters, and counts characters, not bytes", async () => {
    await expect(
      requestAccess(asUser, { workspace: "acme", message: "x".repeat(501) }, app),
    ).rejects.toBeInstanceOf(InvalidAccessRequestTextError);
    expect(await requestAccess(asUser, { workspace: "acme", message: "日".repeat(500) }, app)).toBe(
      "sent",
    );
  });

  it("refuses the 11th open request, before looking the name up", async () => {
    for (let i = 0; i < 10; i++) {
      const name = `team${i}`;
      await createWorkspace(asRoot, { name, description: "A team." }, app);
      await ask(name);
    }
    await expect(requestAccess(asUser, { workspace: "acme" }, app)).rejects.toBeInstanceOf(
      TooManyAccessRequestsError,
    );
    await expect(requestAccess(asUser, { workspace: "nowhere" }, app)).rejects.toBeInstanceOf(
      TooManyAccessRequestsError,
    );
    // An open one is still just open, and cancelling one frees a place.
    expect(await requestAccess(asUser, { workspace: "team0" }, app)).toBe("already_requested");
    await cancelAccessRequest(asUser, (await rows())[0]?.id as string, app);
    await ask("acme");
  });

  it("waits 7 days after a decline before the same workspace is asked again", async () => {
    const id = await ask();
    await declineAccessRequest(asModerator, { requestId: id, reason: "Not yet." }, app);
    const refused = await requestAccess(asUser, { workspace: "acme" }, app).catch((e) => e);
    expect(refused).toBeInstanceOf(AccessRequestTooSoonError);
    // Another workspace isn't held up.
    await ask("beta");
    const decidedDaysAgo = (days: number) =>
      t.db
        .updateTable("workspace_access_requests")
        .set({ decided_at: toDbDate(new Date(Date.now() - days * DAY - 60_000), t.dialect) })
        .where("id", "=", id)
        .execute();
    // A minute short of 7 days: still too soon. A minute past: asked.
    await decidedDaysAgo(7 - 2 / 1440);
    await expect(requestAccess(asUser, { workspace: "acme" }, app)).rejects.toBeInstanceOf(
      AccessRequestTooSoonError,
    );
    await decidedDaysAgo(7);
    await ask();
  });

  it("doesn't make someone added and removed since a decline wait, and the pages agree", async () => {
    const id = await ask();
    await declineAccessRequest(asModerator, { requestId: id }, app);
    // The pages show when to ask again: 7 days after the decline.
    const [declined] = await ownRequests(asUser, app);
    const decidedAt = declined?.decidedAt?.getTime() ?? 0;
    expect(declined?.askAgainFrom?.getTime()).toBe(decidedAt + 7 * DAY);
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    await removeMember(asRoot, { workspaceId: acme, userId }, app);
    // Now they can ask at once: the Workspaces page and the join page offer it, as the service does.
    expect((await ownRequests(asUser, app))[0]).toMatchObject({
      status: "declined",
      askAgainFrom: null,
    });
    expect(await joinTarget(asUser, "acme", app)).toMatchObject({
      kind: "open",
      request: { status: "declined", askAgainFrom: null },
    });
    await ask();
  });

  it("lets someone removed later ask again at once", async () => {
    await approveAccessRequest(asModerator, { requestId: await ask() }, app);
    await removeMember(asRoot, { workspaceId: acme, userId }, app);
    await ask();
  });
});

describe("cancelling (094)", () => {
  it("cancels only your own open request, once, and audits it", async () => {
    const id = await ask();
    await expect(cancelAccessRequest(asModerator, id, app)).rejects.toBeInstanceOf(
      AccessRequestNotFoundError,
    );
    await expect(
      cancelAccessRequest(asUser, "01JUNKUNKNOWNREQUEST00000", app),
    ).rejects.toBeInstanceOf(AccessRequestNotFoundError);
    await cancelAccessRequest(asUser, id, app);
    await expect(cancelAccessRequest(asUser, id, app)).rejects.toBeInstanceOf(
      AccessRequestAnsweredError,
    );
    expect((await rows())[0]).toMatchObject({ status: "cancelled", decided_by: userId });
    expect(await events("workspace.access_cancelled")).toHaveLength(1);
    // Asking again after cancelling needs no wait.
    await ask();
  });
});

describe("answering (094)", () => {
  it("lets a moderator of the workspace approve: the requester joins as user, audited twice", async () => {
    const id = await ask();
    await approveAccessRequest(asModerator, { requestId: id }, app);
    expect(await roles(userId)).toEqual({ global: "user", acme: "user" });
    expect((await rows())[0]).toMatchObject({ status: "approved", decided_by: moderatorId });
    expect(await events("workspace.access_approved")).toEqual([
      expect.objectContaining({
        actorId: moderatorId,
        targetId: userId,
        metadata: { workspace: "acme", email: "u@example.com", role: "user" },
      }),
    ]);
    expect(await events("workspace.member_added")).toEqual([
      expect.objectContaining({
        actorId: moderatorId,
        metadata: { workspace: "acme", email: "u@example.com", role: "user" },
      }),
    ]);
  });

  it("refuses everyone else: a moderator elsewhere, a member, the requester", async () => {
    const id = await ask();
    for (const who of [asBetaModerator, asUser])
      for (const answer of [
        () => approveAccessRequest(who, { requestId: id }, app),
        () => declineAccessRequest(who, { requestId: id }, app),
      ])
        await expect(answer()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(pendingRequests(asBetaModerator, acme, app)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(pendingRequests(asUser, acme, app)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await rows())[0]?.status).toBe("open");
  });

  it("lets root and the workspace's admins pick moderator; a moderator can't", async () => {
    await expect(
      approveAccessRequest(asModerator, { requestId: await ask(), role: "moderator" }, app),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const first = (await rows())[0]?.id as string;
    await expect(
      approveAccessRequest(asRoot, { requestId: first, role: "admin" }, app),
    ).rejects.toBeInstanceOf(InvalidRequestRoleError);
    await approveAccessRequest(asRoot, { requestId: first, role: "moderator" }, app);
    expect((await roles(userId)).acme).toBe("moderator");
    // Acme's admin answers nothing in beta.
    await expect(
      approveAccessRequest(asAdmin, { requestId: await ask("beta") }, app),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an admin approve as moderator in their workspace", async () => {
    await approveAccessRequest(asAdmin, { requestId: await ask(), role: "moderator" }, app);
    expect((await roles(userId)).acme).toBe("moderator");
  });

  it("declines with a reason the requester sees, and audits it", async () => {
    const id = await ask();
    await expect(
      declineAccessRequest(asModerator, { requestId: id, reason: "x".repeat(501) }, app),
    ).rejects.toBeInstanceOf(InvalidAccessRequestTextError);
    await declineAccessRequest(asModerator, { requestId: id, reason: " Ask Ana first. " }, app);
    expect(await roles(userId)).toEqual({ global: "user" });
    expect(await ownRequests(asUser, app)).toEqual([
      expect.objectContaining({
        workspace: "acme",
        status: "declined",
        reason: "Ask Ana first.",
        description: "Acme.",
        visibility: "public",
      }),
    ]);
    // The reason stays out of the audit log.
    expect(await events("workspace.access_declined")).toEqual([
      expect.objectContaining({
        actorId: moderatorId,
        targetId: userId,
        metadata: { workspace: "acme", email: "u@example.com" },
      }),
    ]);
  });

  it("gives the second of two answers at once Already answered", async () => {
    // Repeated: a race shows only some of the time.
    for (let i = 0; i < 4; i++) {
      const id = await ask();
      const results = await Promise.allSettled([
        approveAccessRequest(asModerator, { requestId: id }, app),
        declineAccessRequest(asOtherModerator, { requestId: id }, app),
      ]);
      const reasons = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toBeInstanceOf(AccessRequestAnsweredError);
      const decided = (await rows()).filter((r) => r.id === id);
      expect(decided).toHaveLength(1);
      const joined = (await roles(userId)).acme === "user";
      expect(joined).toBe(decided[0]?.status === "approved");
      if (joined) await removeMember(asRoot, { workspaceId: acme, userId }, app);
      else
        await t.db
          .updateTable("workspace_access_requests")
          .set({ decided_at: toDbDate(new Date(0), t.dialect) })
          .where("id", "=", id)
          .execute();
    }
  });
});

describe("the Requests tab and the nav count (094)", () => {
  it("lists a workspace's open requests, oldest first, to those who answer there", async () => {
    await ask("acme", "First.");
    const otherId = await createTestUser(app, { email: "o@example.com", password, name: "Otto" });
    expect(await requestAccess(await headersFor("o@example.com"), { workspace: "acme" }, app)).toBe(
      "sent",
    );
    const { requests, total } = await pendingRequests(asModerator, acme, app);
    expect(total).toBe(2);
    expect(requests.map((r) => [r.userId, r.email, r.message])).toEqual([
      [userId, "u@example.com", "First."],
      [otherId, "o@example.com", null],
    ]);
    expect((await pendingRequests(asRoot, acme, app)).total).toBe(2);
  });

  it("lists every request a person can answer, with its workspace and whether they pick the role", async () => {
    await ask("acme", "For acme.");
    await ask("beta");
    await ask("nowhere");
    const list = async (who: Headers) =>
      (await requestsToAnswerList(who, app)).requests.map((r) => [r.workspace, r.canPickRole]);
    // Root: both workspaces, and the role to pick; a name no workspace has isn't anyone's to answer.
    expect(await list(asRoot)).toEqual([
      ["acme", true],
      ["beta", true],
    ]);
    expect((await requestsToAnswerList(asRoot, app)).total).toBe(2);
    expect(await list(asModerator)).toEqual([["acme", false]]);
    expect(await list(asAdmin)).toEqual([["acme", true]]);
    expect(await list(asBetaModerator)).toEqual([["beta", false]]);
    await expect(requestsToAnswerList(asUser, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("counts what each person can answer: root all, a moderator their workspace, others none", async () => {
    await ask("acme");
    await ask("beta");
    expect(await requestsToAnswer(asRoot, app)).toBe(2);
    expect(await requestsToAnswer(asModerator, app)).toBe(1);
    expect(await requestsToAnswer(asBetaModerator, app)).toBe(1);
    expect(await requestsToAnswer(asUser, app)).toBe(0);
  });
});

describe("what else closes a request (094)", () => {
  it("approves an open request when the requester is added directly, by whoever added them", async () => {
    await ask("acme");
    await ask("beta");
    await addMembers(asRoot, { workspaceId: acme, userIds: [userId], role: "user" }, app);
    await setUserWorkspaces(
      asRoot,
      {
        userId,
        workspaces: [
          { workspaceId: acme, role: "user" },
          { workspaceId: beta, role: "moderator" },
        ],
      },
      app,
    );
    expect((await rows()).map((r) => [r.status, r.decided_by])).toEqual([
      ["approved", rootId],
      ["approved", rootId],
    ]);
    expect((await events("workspace.access_approved")).map((e) => e.metadata)).toEqual(
      expect.arrayContaining([
        { workspace: "acme", email: "u@example.com", role: "user", direct: true },
        { workspace: "beta", email: "u@example.com", role: "moderator", direct: true },
      ]),
    );
    expect(await requestsToAnswer(asRoot, app)).toBe(0);
  });

  it("cancels a disabled user's open requests, and says how many", async () => {
    await ask("acme");
    await ask("beta");
    await adminDisableUser(asRoot, userId, app);
    expect((await rows()).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
    expect((await events("user.disabled"))[0]?.metadata).toMatchObject({ requestsCancelled: 2 });
    expect(await requestsToAnswer(asRoot, app)).toBe(0);
  });

  it("keeps requests when the workspace turns private, and removes them with it", async () => {
    await ask("acme");
    await makePrivate("acme");
    expect((await rows())[0]?.status).toBe("open");
    expect((await pendingRequests(asModerator, acme, app)).total).toBe(1);
    await deleteWorkspace(asRoot, { name: "acme" }, app);
    expect(await rows()).toEqual([]);
  });
});

describe("the Workspaces page and the join page (094)", () => {
  it("lists the workspaces the reader sees, global first, with their role", async () => {
    await makePrivate("beta");
    const rows = (await myWorkspaces(asModerator, app)).map((w) => [w.name, w.visibility, w.role]);
    expect(rows).toEqual([
      ["global", "public", "user"],
      ["acme", "public", "moderator"],
    ]);
    expect((await myWorkspaces(asBetaModerator, app)).map((w) => [w.name, w.role])).toEqual([
      ["global", "user"],
      ["acme", null],
      ["beta", "moderator"],
    ]);
    // Root sees every workspace, private ones too, with no role.
    expect((await myWorkspaces(asRoot, app)).map((w) => [w.name, w.role])).toEqual([
      ["global", null],
      ["acme", null],
      ["beta", null],
    ]);
  });

  it("shows a public workspace's description on its join page, and tells members they're in", async () => {
    expect(await joinTarget(asUser, "ACME", app)).toEqual({
      kind: "open",
      name: "acme",
      description: "Acme.",
      request: null,
    });
    expect(await joinTarget(asModerator, "acme", app)).toEqual({ kind: "member", name: "acme" });
    expect(await joinTarget(asUser, "global", app)).toEqual({ kind: "member", name: "global" });
    expect(await joinTarget(asRoot, "beta", app)).toEqual({ kind: "member", name: "beta" });
    await ask("acme", "Hello.");
    expect(await joinTarget(asUser, "acme", app)).toMatchObject({
      kind: "open",
      request: { workspace: "acme", status: "open", message: "Hello." },
    });
  });

  it("can't tell a private workspace from a name no workspace has, before or after asking", async () => {
    await makePrivate("beta");
    const strip = (target: Awaited<ReturnType<typeof joinTarget>>) => {
      const { name: _name, ...rest } = target;
      if (!("request" in rest) || !rest.request) return rest;
      const { id: _id, workspace: _w, createdAt: _c, ...request } = rest.request;
      return { ...rest, request };
    };
    const before = [
      await joinTarget(asUser, "beta", app),
      await joinTarget(asUser, "nowhere", app),
    ];
    expect(before[0]).toEqual({ kind: "unseen", name: "beta", request: null });
    expect(strip(before[0] as never)).toEqual(strip(before[1] as never));
    await ask("beta");
    await ask("nowhere");
    const after = [await joinTarget(asUser, "beta", app), await joinTarget(asUser, "nowhere", app)];
    expect(after[0]).toMatchObject({ kind: "unseen", request: { status: "open" } });
    expect(strip(after[0] as never)).toEqual(strip(after[1] as never));
    // Neither shows on the Workspaces page's list.
    expect((await myWorkspaces(asUser, app)).map((w) => w.name)).toEqual(["global", "acme"]);
  });
});
