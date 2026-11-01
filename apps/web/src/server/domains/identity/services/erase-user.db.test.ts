import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { runRetentionJob } from "../../../jobs/retention-job";
import { listAuditEvents } from "../../audit/actions/audit";
import { kyselyFeedbackRepository } from "../../feedback/repositories/kysely-feedback-repository";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { notify } from "../../notifications/services/notify";
import { latestVisible } from "../../notifications/services/read";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { comment } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import {
  addMembers,
  askScopeMove,
  createWorkspace,
  requestAccess,
} from "../../workspaces/actions/workspaces";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { loadViewer } from "../../workspaces/repositories/viewer";
import { createMyToken } from "../actions/access-tokens";
import { adminEraseUser, adminPendingErasures, adminRetryErasures } from "../actions/erase-user";
import { createRoot } from "../actions/root-account";
import { getCurrentUser, signIn } from "../actions/session";
import { adminCreateUser, adminDisableUser, adminListUsers } from "../actions/user-admin";
import {
  CannotModifySelfError,
  EraseConfirmationError,
  ForbiddenError,
  UserErasedError,
  UserNotFoundError,
} from "../exceptions/errors";
import { erasedEmail, erasedName } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import type { EraseRepository } from "../repositories/erase-repository";
import { kyselyEraseRepository } from "../repositories/kysely-erase-repository";
import { kyselyScimUserRepository } from "../repositories/kysely-scim-user-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { cookieHeaders, createTestUser, setWorkspaceRole, testAppAuth } from "../testing/test-auth";
import { eraseUser, finishErasures } from "./erase-user";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Erasing a user (103, task 2): a person with every kind of row the spec's table names, erased.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
const password = "correct horse battery";
const IP = "203.0.113.7";

/** Signed in, with a client address the audit log records (the app trusts the proxy here). */
const signedIn = async (email: string) => {
  const result = await signIn(
    new Headers({ "x-forwarded-for": IP }),
    { email, password, rememberMe: false },
    app,
  );
  if (!result.ok) throw new Error(`sign-in failed for ${email}: ${result.error}`);
  const headers = cookieHeaders(result.headers.get("set-cookie"));
  headers.set("x-forwarded-for", IP);
  return headers;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { trustProxy: true });
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  asRoot = await signedIn("root@example.com");
});
afterEach(() => t.cleanup());

const at = () => toDbDate(new Date(), t.dialect);
const rows = async (table: string, column: string, value: string) =>
  (
    await sql<
      Record<string, unknown>
    >`select * from ${sql.table(table)} where ${sql.ref(column)} = ${value}`.execute(t.db)
  ).rows;
const userRow = (id: string) =>
  t.db.selectFrom("user").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const events = async () => (await listAuditEvents(t.db, t.dialect, { size: 500 })).events;

const insertProvider = async (id: string) => {
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "entra",
      name: "Acme",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: at(),
      updated_at: at(),
    })
    .execute();
};

/** An item released in the scope by `userId`, as 114 lets a person release in their own workspace. */
const release = async (scopeId: string, name: string, userId: string) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name,
    type: "skill",
    description: `${name}.`,
    ownerId: userId,
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
    publishedBy: userId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
    reviewed: false,
  });
  return itemId;
};

/** A draft in the scope by `headers`, with a valid manifest; submitted when asked. */
const draft = async (headers: Headers, scope: string, name: string, submit = false) => {
  const created = await createDraft(headers, { scope, name, type: "rule" }, app);
  const manifest = created.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    created.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: A rule."),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  if (submit) await submitDraft(headers, created.id, app);
  return created.id;
};

type Seeded = {
  id: string;
  personalId: string;
  personalName: string;
  itemId: string;
  submittedId: string;
  drafts: string[];
  scimLinks: string[];
  requestWorkspaces: string[];
  moveScopeId: string;
};

/** Ana, with two of everything the spec's table names where there can be two. */
const seedAna = async (): Promise<Seeded> => {
  const created = await adminCreateUser(
    asRoot,
    { email: "ana@example.com", name: "Ana Silva", role: "user", password },
    app,
  );
  const id = created.id;
  // A moderator in global, so she can comment on root's submission (a review thread).
  await setWorkspaceRole(app, id, "moderator");
  const asAna = await signedIn("ana@example.com");
  await signedIn("ana@example.com"); // a second session
  // A failed sign-in with her address, recorded with the typed email.
  await signIn(
    new Headers({ "x-forwarded-for": IP }),
    { email: "ana@example.com", password: "wrong password here", rememberMe: false },
    app,
  );
  await createMyToken(asAna, { name: "laptop" }, app);
  await createMyToken(asAna, { name: "desk" }, app);
  await t.db
    .insertInto("user_onboarding")
    .values({ user_id: id, hidden_at: at(), updated_at: at() })
    .execute();
  await t.db
    .insertInto("feedback")
    .values({
      id: newId(),
      user_id: id,
      kind: "problem",
      message: "The <b>button</b> is broken",
      page: "/catalogue",
      version: "1.2.3",
      created_at: at(),
    })
    .execute();
  // Notifications (139): two for her, one read, and one she caused for root, which stays.
  for (const [kind, readAt] of [
    ["membership.added", null],
    ["membership.removed", at()],
  ] as const) {
    await notify(t.db, t.dialect, {
      recipients: [id],
      kind,
      actorId: rootId,
      subject: { type: "workspace", id: GLOBAL_WORKSPACE_ID },
      params: { workspace: "global", role: "user" },
    });
    if (readAt)
      await t.db
        .updateTable("notifications")
        .set({ read_at: readAt })
        .where("user_id", "=", id)
        .where("kind", "=", kind)
        .execute();
  }
  await notify(t.db, t.dialect, {
    recipients: [rootId],
    kind: "request.join_waiting",
    actorId: id,
    subject: { type: "workspace", id: GLOBAL_WORKSPACE_ID },
    params: { workspace: "global" },
  });
  for (const name of ["phone", "tablet"])
    await t.db
      .insertInto("device_grants")
      .values({
        id: newId(),
        device_code_hash: newId() + newId(),
        user_code: newId().slice(-8),
        client_id: "rmk",
        name,
        status: "approved",
        user_id: id,
        requester_ip: IP,
        approver_ip: IP,
        interval_seconds: 5,
        last_polled_at: null,
        decided_at: at(),
        created_at: at(),
        expires_at: at(),
      })
      .execute();
  // Two-factor on, and a setup record.
  await t.db
    .insertInto("two_factor")
    .values({
      id: newId(),
      user_id: id,
      secret: "encrypted",
      backup_codes: "encrypted",
      verified: toDbBoolean(true, t.dialect),
    })
    .execute();
  await t.db
    .updateTable("user")
    .set({
      two_factor_enabled: toDbBoolean(true, t.dialect),
      image: "https://x/ana.png",
      locale: "fr",
    })
    .where("id", "=", id)
    .execute();
  await t.db
    .insertInto("verification")
    .values({
      id: newId(),
      identifier: `two-factor-setup:${id}`,
      value: "x",
      expires_at: at(),
      created_at: at(),
      updated_at: at(),
    })
    .execute();
  // An identity provider's link (106), a SCIM link, a tombstone and a group membership (108).
  await insertProvider("acme");
  await insertProvider("other");
  await kyselySsoRepository(t.db, t.dialect).linkAccount(id, "acme", "sub-ana", new Date());
  const scim = kyselyScimUserRepository(t.db, t.dialect);
  const link = (providerId: string, externalId: string) =>
    scim.insertLink({
      providerId,
      userId: id,
      externalId,
      userName: "ana@example.com",
      givenName: "Ana",
      familyName: "Silva",
      displayName: "Ana Silva",
      active: true,
      createdAt: new Date(),
    });
  const live = await link("acme", "ext-ana");
  const dead = await link("other", "ext-ana-old");
  await scim.tombstoneLink(dead, new Date());
  const groupId = newId();
  await t.db
    .insertInto("scim_groups")
    .values({
      id: groupId,
      provider_id: "acme",
      display_name: "Engineering",
      external_id: "g-eng",
      created_at: at(),
      updated_at: at(),
    })
    .execute();
  await t.db
    .insertInto("scim_group_members")
    .values({ group_id: groupId, user_id: id, created_at: at() })
    .execute();
  // Workspaces: a member of two shared ones (never their admin, so a scope move she asks stays
  // open), open requests to two others, an open scope move.
  for (const name of ["team", "platform", "sales", "legal"])
    await createWorkspace(asRoot, { name, description: `${name}.`, visibility: "public" }, app);
  const workspaceId = async (name: string) =>
    (
      await t.db
        .selectFrom("workspaces")
        .select("id")
        .where("name", "=", name)
        .executeTakeFirstOrThrow()
    ).id;
  await addMembers(
    asRoot,
    { workspaceId: await workspaceId("team"), userIds: [id], role: "user" },
    app,
  );
  await addMembers(
    asRoot,
    { workspaceId: await workspaceId("platform"), userIds: [id], role: "user" },
    app,
  );
  expect(await requestAccess(asAna, { workspace: "sales", message: "Please" }, app)).toBe("sent");
  expect(await requestAccess(asAna, { workspace: "legal" }, app)).toBe("sent");
  const personal = await t.db
    .selectFrom("workspaces")
    .select(["id", "name"])
    .where("owner_id", "=", id)
    .executeTakeFirstOrThrow();
  const scopes = kyselyScopeRepository(t.db, t.dialect, UNFILTERED);
  const tools = await scopes.insert({
    name: "tools",
    description: "Tools.",
    workspaceId: personal.id,
    createdBy: id,
    createdAt: new Date(),
  });
  const moving = await scopes.insert({
    name: "moving",
    description: "Moving.",
    workspaceId: personal.id,
    createdBy: id,
    createdAt: new Date(),
  });
  await askScopeMove(asAna, { scopeId: moving, to: "team" }, app);
  // Her record: an item released in her personal workspace, a submitted submission in global, a
  // comment on root's submission; and two drafts, which are hers alone.
  const itemId = await release(tools, "helper", id);
  await scopes.insert({
    name: "shared",
    description: "Shared.",
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: rootId,
    createdAt: new Date(),
  });
  const submittedId = await draft(asAna, "shared", "style", true);
  const rootsSubmission = await draft(asRoot, "shared", "house", true);
  await comment(asAna, rootsSubmission, { body: "Looks fine to me." }, app);
  const drafts = [
    await draft(asAna, "shared", "draft-one"),
    await draft(asAna, "shared", "draft-two"),
  ];
  return {
    id,
    personalId: personal.id,
    personalName: personal.name,
    itemId,
    submittedId,
    drafts,
    scimLinks: [live, dead],
    requestWorkspaces: ["sales", "legal"],
    moveScopeId: moving,
  };
};

describe("eraseUser (103)", () => {
  it("replaces, deletes, keeps and renames what the spec's table says, in one go", async () => {
    const ana = await seedAna();
    // Another person whose address contains Ana's: their events must stay as they are.
    await adminCreateUser(
      asRoot,
      { email: "sub-ana@example.com", name: "Sub", role: "user", password },
      app,
    );
    const before = await events();
    expect(before.some((e) => e.ipAddress === IP && e.actorId === ana.id)).toBe(true);
    expect(before.some((e) => JSON.stringify(e.metadata).includes("ana@example.com"))).toBe(true);

    // Her notifications: the two seeded here, and the ones the services wrote for her on the way.
    const mine = (await rows("notifications", "user_id", ana.id)).length;
    expect(mine).toBeGreaterThanOrEqual(2);
    const result = await adminEraseUser(asRoot, ana.id, "ana@example.com", app);
    expect(result).toEqual({
      sessionsEnded: 2,
      tokensDeleted: 2,
      scimLinksDeleted: 2,
      draftsDeleted: 2,
      eventsRewritten: expect.any(Number),
      personalWorkspace: "renamed",
      requestsCancelled: 2,
      movesCancelled: 1,
      feedbackDeleted: 1,
      notificationsDeleted: mine,
    });
    expect(result.eventsRewritten).toBeGreaterThanOrEqual(2);

    // The row: the pseudonym, nothing personal, disabled and erased.
    const user = await userRow(ana.id);
    expect(user).toMatchObject({
      email: erasedEmail(ana.id),
      name: erasedName(ana.id),
      image: null,
      locale: null,
      role: "user",
    });
    expect(Boolean(user.email_verified)).toBe(false);
    expect(Boolean(user.two_factor_enabled)).toBe(false);
    expect(user.disabled_at).not.toBeNull();
    expect(user.erased_at).not.toBeNull();
    // Deleted: credentials and links, sessions, tokens, grants, SCIM rows, memberships, drafts.
    for (const [table, column] of [
      ["account", "user_id"],
      ["session", "user_id"],
      ["two_factor", "user_id"],
      ["access_tokens", "user_id"],
      ["device_grants", "user_id"],
      ["user_onboarding", "user_id"],
      ["feedback", "user_id"],
      ["notifications", "user_id"],
      ["scim_users", "user_id"],
      ["scim_group_members", "user_id"],
      ["workspace_members", "user_id"],
      ["user_erasures", "user_id"],
    ] as const)
      expect(await rows(table, column, ana.id), table).toEqual([]);
    expect(await rows("verification", "identifier", `two-factor-setup:${ana.id}`)).toEqual([]);
    // What she caused for someone else stays: root's notification, its actor now the pseudonym.
    const forRoot = (await rows("notifications", "user_id", rootId)).filter(
      (n) => n.actor_id === ana.id,
    );
    expect(forRoot.map((n) => n.kind)).toContain("request.join_waiting");
    for (const id of ana.drafts) expect(await rows("submissions", "id", id)).toEqual([]);
    expect(await rows("submission_files", "submission_id", ana.drafts[0] as string)).toEqual([]);
    // Cancelled, with no reason text.
    const requests = await t.db
      .selectFrom("workspace_access_requests")
      .select(["status", "reason"])
      .where("user_id", "=", ana.id)
      .execute();
    expect(requests).toEqual([
      { status: "cancelled", reason: null },
      { status: "cancelled", reason: null },
    ]);
    const moves = await t.db
      .selectFrom("scope_moves")
      .select(["status", "reason"])
      .where("requested_by", "=", ana.id)
      .execute();
    expect(moves).toEqual([{ status: "cancelled", reason: null }]);
    // Kept, under the id: the item, its version, the submitted submission, the comment.
    expect(await rows("items", "owner_id", ana.id)).toHaveLength(1);
    expect(await rows("item_versions", "published_by", ana.id)).toHaveLength(1);
    expect(await rows("submissions", "author_id", ana.id)).toMatchObject([{ status: "submitted" }]);
    // Her submit's event and her comment on root's thread.
    expect(await rows("review_events", "actor_id", ana.id)).toHaveLength(2);
    // The personal workspace held the record: renamed by 114's rule from the pseudonym, the old
    // item name an alias (118), as any rename leaves it.
    const personal = await t.db
      .selectFrom("workspaces")
      .select(["name", "owner_id"])
      .where("id", "=", ana.personalId)
      .executeTakeFirstOrThrow();
    expect(personal.name).toBe(erasedName(ana.id).toLowerCase());
    expect(personal.owner_id).toBe(ana.id);
    expect(await rows("item_aliases", "item_id", ana.itemId)).toMatchObject([
      { name: `@${ana.personalName}/tools/helper` },
    ]);
    // The audit log: her events' IPs cleared now; the address nowhere, the pseudonym in its place;
    // the look-alike's `user.created` untouched; `user.erased` with the counts and nothing personal.
    const after = await events();
    // Every event of hers, but `user.erased` itself, which is root's act with root's address.
    for (const e of after)
      if (
        e.action !== "user.erased" &&
        (e.actorId === ana.id || (e.targetType === "user" && e.targetId === ana.id))
      )
        expect(e.ipAddress, e.action).toBeNull();
    expect(after.filter((e) => e.actorId !== ana.id && e.ipAddress === IP).length).toBeGreaterThan(
      0,
    );
    expect(after.some((e) => JSON.stringify(e.metadata).includes('"ana@example.com"'))).toBe(false);
    const created = after.filter((e) => e.action === "user.created");
    expect(created.map((e) => e.metadata.email).sort()).toEqual(
      [erasedEmail(ana.id), "sub-ana@example.com"].sort(),
    );
    expect(after.filter((e) => e.action === "auth.sign_in_failed")[0]?.metadata).toMatchObject({
      email: erasedEmail(ana.id),
    });
    const erased = after.filter((e) => e.action === "user.erased");
    expect(erased).toHaveLength(1);
    expect(erased[0]).toMatchObject({
      actorId: rootId,
      targetId: ana.id,
      targetEmail: erasedEmail(ana.id),
      ipAddress: IP,
      metadata: {
        sessionsEnded: 2,
        tokensDeleted: 2,
        scimLinksDeleted: 2,
        draftsDeleted: 2,
        personalWorkspace: "renamed",
        requestsCancelled: 2,
        movesCancelled: 1,
        feedbackDeleted: 1,
        notificationsDeleted: mine,
      },
    });
    expect(JSON.stringify(erased[0]?.metadata)).not.toMatch(/ana@example|Ana Silva/);
    expect(after.filter((e) => e.actorId === ana.id)[0]?.actorEmail).toBe(erasedEmail(ana.id));
    // The users list: the erased row under the `erased` status, never under `disabled` or `active`.
    const listed = async (status: "active" | "disabled" | "erased") =>
      (await adminListUsers(asRoot, { status }, app)).users.map((u) => u.id);
    // A disabled account that isn't erased: under `disabled`, never under `erased`.
    const benched = await adminCreateUser(
      asRoot,
      { email: "benched@example.com", name: "Benched", role: "user", password },
      app,
    );
    await adminDisableUser(asRoot, benched.id, app);
    expect(await listed("erased")).toEqual([ana.id]);
    expect(await listed("disabled")).toContain(benched.id);
    expect(await listed("disabled")).not.toContain(ana.id);
    expect(await listed("active")).not.toContain(ana.id);
    // The old email is free at once.
    const again = await adminCreateUser(
      asRoot,
      { email: "ana@example.com", name: "New Ana", role: "user", password },
      app,
    );
    expect(again.id).not.toBe(ana.id);
  });

  it("deletes an empty personal workspace with its scopes, and keeps the record elsewhere", async () => {
    const bob = await adminCreateUser(
      asRoot,
      { email: "bob@example.com", name: "Bob", role: "user", password },
      app,
    );
    const asBob = await signedIn("bob@example.com");
    const personal = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", bob.id)
      .executeTakeFirstOrThrow();
    const scopes = kyselyScopeRepository(t.db, t.dialect, UNFILTERED);
    const own = await scopes.insert({
      name: "own",
      description: "Own.",
      workspaceId: personal.id,
      createdBy: bob.id,
      createdAt: new Date(),
    });
    // A draft in his own workspace: his alone, gone with it.
    await createDraft(
      asBob,
      { scope: `@${personal.name}/own`, name: "private-draft", type: "rule" },
      app,
    );
    expect(await rows("submissions", "scope_id", own)).toHaveLength(1);
    const result = await adminEraseUser(asRoot, bob.id, "bob@example.com", app);
    expect(result).toMatchObject({ personalWorkspace: "deleted", draftsDeleted: 1 });
    // He had no notifications: nothing is reported for them.
    expect(result).not.toHaveProperty("notificationsDeleted");
    expect(await rows("workspaces", "id", personal.id)).toEqual([]);
    expect(await rows("scopes", "workspace_id", personal.id)).toEqual([]);
    expect(await rows("submissions", "scope_id", own)).toEqual([]);
    expect(await userRow(bob.id)).toMatchObject({ email: erasedEmail(bob.id) });
    expect(await getCurrentUser(asBob, app)).toBeNull();
  });

  it("keeps an empty personal workspace that holds another person's draft, renamed", async () => {
    const bob = await adminCreateUser(
      asRoot,
      { email: "bob@example.com", name: "Bob", role: "user", password },
      app,
    );
    const personal = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", bob.id)
      .executeTakeFirstOrThrow();
    await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
      name: "own",
      description: "Own.",
      workspaceId: personal.id,
      createdBy: bob.id,
      createdAt: new Date(),
    });
    // Root's draft there, which is root's work: the scope can't go, so the workspace is renamed.
    const draftId = (
      await createDraft(
        asRoot,
        { scope: `@${personal.name}/own`, name: "roots-draft", type: "rule" },
        app,
      )
    ).id;
    expect(await adminEraseUser(asRoot, bob.id, "bob@example.com", app)).toMatchObject({
      personalWorkspace: "renamed",
      draftsDeleted: 0,
    });
    expect(await rows("workspaces", "id", personal.id)).toMatchObject([
      { name: erasedName(bob.id).toLowerCase() },
    ]);
    expect(await rows("submissions", "id", draftId)).toMatchObject([{ status: "draft" }]);
  });

  it("refuses self, a second erase, an unknown id and anyone who isn't root, changing nothing", async () => {
    const ana = await seedAna();
    const mod = await createTestUser(app, {
      email: "mod@example.com",
      password,
      role: "moderator",
    });
    const asMod = await signedIn("mod@example.com");
    const snapshot = async () => ({
      ana: await userRow(ana.id),
      events: (await events()).length,
      sessions: (await rows("session", "user_id", ana.id)).length,
    });
    const before = await snapshot();
    await expect(adminEraseUser(asRoot, rootId, "root@example.com", app)).rejects.toThrow(
      CannotModifySelfError,
    );
    await expect(adminEraseUser(asMod, ana.id, "ana@example.com", app)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(adminEraseUser(new Headers(), ana.id, "ana@example.com", app)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(adminEraseUser(asRoot, "01NOPE", "nope@example.com", app)).rejects.toThrow(
      UserNotFoundError,
    );
    // The typed email must be the account's (103's dialog), checked against the locked row.
    await expect(adminEraseUser(asRoot, ana.id, "anna@example.com", app)).rejects.toThrow(
      EraseConfirmationError,
    );
    expect(await snapshot()).toEqual(before);
    expect(await userRow(mod)).toMatchObject({ erased_at: null });
    await adminEraseUser(asRoot, ana.id, "ana@example.com", app);
    const once = await snapshot();
    await expect(adminEraseUser(asRoot, ana.id, "ana@example.com", app)).rejects.toThrow(
      UserErasedError,
    );
    expect(await snapshot()).toEqual(once);
  });

  it("leaves no name of the sender in root's new-feedback notification, only the pseudonym", async () => {
    const ana = await adminCreateUser(
      asRoot,
      { email: "ana-feedback@example.com", name: "Ana Silva", role: "user", password },
      app,
    );
    await kyselyFeedbackRepository(t.db, t.dialect).insert(
      ana.id,
      { kind: "idea", message: "Dark mode, please", page: null },
      { version: "1.0.0", at: new Date() },
    );
    const before = await rows("notifications", "user_id", rootId);
    expect(before.map((n) => n.kind)).toContain("feedback.new");
    await adminEraseUser(asRoot, ana.id, "ana-feedback@example.com", app);
    // The feedback is deleted; root's notification stays, its actor now the pseudonym, and no
    // stored text names the person.
    const after = (await rows("notifications", "user_id", rootId)).filter(
      (n) => n.kind === "feedback.new",
    );
    expect(after).toHaveLength(1);
    expect(JSON.stringify(after)).not.toContain("Ana Silva");
    expect(JSON.stringify(after)).not.toContain("Dark mode");
    expect(after[0]?.actor_id).toBe(ana.id);
    const viewer = await loadViewer(t.db, { id: rootId, role: "root", workspaces: {} });
    const [shown] = await latestVisible(t.db, t.dialect, viewer, rootId, 10);
    expect(shown?.actor?.name).toBe(erasedName(ana.id));
  });

  it("erases another root, whose role goes with the row, and never the actor's own", async () => {
    const second = await adminCreateUser(
      asRoot,
      { email: "second@example.com", name: "Second", role: "root", password },
      app,
    );
    const asSecond = await signedIn("second@example.com");
    await expect(adminEraseUser(asSecond, second.id, "second@example.com", app)).rejects.toThrow(
      CannotModifySelfError,
    );
    await adminEraseUser(asSecond, rootId, " Root@Example.com ", app);
    expect(await userRow(rootId)).toMatchObject({ role: "user", email: erasedEmail(rootId) });
    expect(await getCurrentUser(asRoot, app)).toBeNull();
    const roots = await t.db.selectFrom("user").select("id").where("role", "=", "root").execute();
    expect(roots).toEqual([{ id: second.id }]);
  });

  it("finds an address that holds LIKE's wildcards, in events that aren't about the user", async () => {
    // `_` and `%` are wildcards, `!` the escape; a failed sign-in's event targets nobody.
    const odd = "a_n%a!@example.com";
    const ana = await adminCreateUser(
      asRoot,
      { email: odd, name: "Odd", role: "user", password },
      app,
    );
    for (let i = 0; i < 2; i++)
      await signIn(
        new Headers(),
        { email: odd, password: "wrong password here", rememberMe: false },
        app,
      );
    const result = await adminEraseUser(asRoot, ana.id, odd, app);
    expect(result.eventsRewritten).toBe(3);
    const after = await events();
    expect(after.some((e) => JSON.stringify(e.metadata).includes(odd))).toBe(false);
    expect(
      after.filter((e) => e.action === "auth.sign_in_failed").map((e) => e.metadata.email),
    ).toEqual([erasedEmail(ana.id), erasedEmail(ana.id)]);
  });

  it("leaves a longer address that contains the erased one alone", async () => {
    const ana = await adminCreateUser(
      asRoot,
      { email: "ana@example.com", name: "Ana", role: "user", password },
      app,
    );
    await adminCreateUser(
      asRoot,
      { email: "sub-ana@example.com", name: "Sub", role: "user", password },
      app,
    );
    await adminCreateUser(
      asRoot,
      { email: "ana@example.com.au", name: "Au", role: "user", password },
      app,
    );
    await adminEraseUser(asRoot, ana.id, "ana@example.com", app);
    const created = (await events()).filter((e) => e.action === "user.created");
    expect(created.map((e) => e.metadata.email).sort()).toEqual(
      ["ana@example.com.au", erasedEmail(ana.id), "sub-ana@example.com"].sort(),
    );
  });
});

describe("an erasure whose rewrite is interrupted after the commit (103, MySQL)", () => {
  /** The repository, with a rewrite that fails after its first page. */
  const failingOnce = (): EraseRepository => {
    const real = kyselyEraseRepository(t.db, t.dialect);
    let failed = false;
    return {
      ...real,
      rewriteEmail: (job, options) =>
        real.rewriteEmail(job, {
          ...options,
          onBatch: async (done) => {
            await options.onBatch?.(done);
            if (!failed) {
              failed = true;
              throw new Error("the connection dropped");
            }
          },
        }),
    };
  };
  const actor = async () => ({ user: await getCurrentUser(asRoot, app), ip: IP });

  const interrupted = async () => {
    const ana = await adminCreateUser(
      asRoot,
      { email: "ana@example.com", name: "Ana", role: "user", password },
      app,
    );
    // Enough events holding her address for two pages of two.
    for (let i = 0; i < 3; i++)
      await signIn(
        new Headers(),
        { email: "ana@example.com", password: "wrong password here", rememberMe: false },
        app,
      );
    await expect(
      eraseUser(
        { repo: failingOnce(), rewriteBatch: 2, rewriteAfterCommit: true },
        await actor(),
        ana.id,
      ),
    ).rejects.toThrow("the connection dropped");
    // The row is the pseudonym already, the rewrite is partly done, and the event isn't recorded.
    expect(await userRow(ana.id)).toMatchObject({ email: erasedEmail(ana.id) });
    expect((await events()).filter((e) => e.action === "user.erased")).toEqual([]);
    expect(await adminPendingErasures(asRoot, app)).toMatchObject([{ userId: ana.id }]);
    return ana.id;
  };

  const finished = async (id: string, via: string) => {
    const after = await events();
    expect(after.some((e) => JSON.stringify(e.metadata).includes('"ana@example.com"'))).toBe(false);
    expect(after.filter((e) => e.action === "auth.sign_in_failed")).toHaveLength(3);
    const erased = after.filter((e) => e.action === "user.erased");
    expect(erased).toHaveLength(1);
    expect(erased[0]).toMatchObject({ targetId: id, metadata: { via, eventsRewritten: 4 } });
    expect(await adminPendingErasures(asRoot, app)).toEqual([]);
  };

  it("is finished by the Privacy tab's Retry, once", async () => {
    const id = await interrupted();
    expect(await adminRetryErasures(asRoot, app)).toBe(1);
    await finished(id, "retry");
    expect(await adminRetryErasures(asRoot, app)).toBe(0);
    expect((await events()).filter((e) => e.action === "user.erased")).toHaveLength(1);
  });

  it("is finished by the retention job, which counts it", async () => {
    const id = await interrupted();
    const run = await runRetentionJob({ db: t.db, dialect: t.dialect });
    expect(run).toMatchObject({ status: "done", counts: { erasuresFinished: 1 } });
    await finished(id, "job");
  });

  it("is refused to anyone but root, and listed to root only", async () => {
    await interrupted();
    const asNobody = new Headers();
    await expect(adminPendingErasures(asNobody, app)).rejects.toThrow(ForbiddenError);
    await expect(adminRetryErasures(asNobody, app)).rejects.toThrow(ForbiddenError);
    await expect(
      finishErasures(
        { repo: kyselyEraseRepository(t.db, t.dialect) },
        { actor: { user: null, ip: null } },
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(await adminPendingErasures(asRoot, app)).toHaveLength(1);
  });
});
