import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { comment } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { addMembers, createWorkspace, requestAccess } from "../../workspaces/actions/workspaces";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { createMyToken } from "../actions/access-tokens";
import { createRoot } from "../actions/root-account";
import { getCurrentUser, signIn } from "../actions/session";
import { adminCreateUser, adminDisableUser } from "../actions/user-admin";
import {
  DataExportLimitError,
  ForbiddenError,
  UserErasedError,
  UserNotFoundError,
} from "../exceptions/errors";
import { USER_DATA_WINDOW_MS } from "../models/user-data";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyEraseRepository } from "../repositories/kysely-erase-repository";
import { kyselyScimUserRepository } from "../repositories/kysely-scim-user-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { kyselyUserDataRepository } from "../repositories/kysely-user-data-repository";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../testing/test-auth";
import { eraseUser } from "./erase-user";
import { exportUserData, lastExport } from "./user-data-export";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// A person's data file (104, task 1): a person with a row of every kind, exported.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
const password = "correct horse battery";
const IP = "203.0.113.7";
const SECRETS = {
  totp: "SEEDED-TOTP-SECRET-7f3a",
  backup: "SEEDED-BACKUP-CODES-91bc",
  idpAccess: "SEEDED-IDP-ACCESS-TOKEN-5d2e",
  idpRefresh: "SEEDED-IDP-REFRESH-TOKEN-8a41",
  idpId: "SEEDED-IDP-ID-TOKEN-c0de",
};

const signedIn = async (email: string) => {
  const result = await signIn(
    new Headers({ "x-forwarded-for": IP, "user-agent": "TestBrowser/1.0" }),
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

const at = (date = new Date()) => toDbDate(date, t.dialect);
const repo = () => kyselyUserDataRepository(t.db, t.dialect);
/** Exports as the person behind `headers`, at `now`. */
const exportAs = async (
  headers: Headers,
  userId: string,
  options: { now?: Date; maxRows?: number; commentMax?: number } = {},
) =>
  exportUserData(
    {
      repo: repo(),
      url: "https://ronne.example",
      now: options.now ? () => options.now as Date : undefined,
      maxRows: options.maxRows,
      commentMax: options.commentMax,
    },
    { user: await getCurrentUser(headers, app), ip: IP },
    userId,
  );

const release = async (scopeId: string, name: string, userId: string, version = "1.0.0") => {
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
    version,
    manifest: { name, type: "skill", description: `${name}.`, version },
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

type Ana = { id: string; headers: Headers; tokenValue: string; submissionId: string };

/** Ana, with a row of every kind the file has a section for, and every secret we could leak. */
const seedAna = async (): Promise<Ana> => {
  const created = await adminCreateUser(
    asRoot,
    { email: "ana@example.com", name: "Ana Silva", role: "user", password },
    app,
  );
  const id = created.id;
  await setWorkspaceRole(app, id, "moderator");
  const headers = await signedIn("ana@example.com");
  await signedIn("ana@example.com");
  const token = await createMyToken(headers, { name: "laptop" }, app);
  await createMyToken(headers, { name: "desk" }, app);
  await t.db
    .insertInto("device_grants")
    .values({
      id: newId(),
      device_code_hash: "SEEDED-DEVICE-CODE-HASH-aa11",
      user_code: "ABCDEFGH",
      client_id: "rmk",
      name: "phone",
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
  await t.db
    .insertInto("two_factor")
    .values({
      id: newId(),
      user_id: id,
      secret: SECRETS.totp,
      backup_codes: SECRETS.backup,
      verified: toDbBoolean(true, t.dialect),
    })
    .execute();
  await t.db
    .updateTable("user")
    .set({ two_factor_enabled: toDbBoolean(true, t.dialect), locale: "pt" })
    .where("id", "=", id)
    .execute();
  await t.db
    .insertInto("identity_providers")
    .values({
      id: "acme",
      type: "oidc",
      preset: "entra",
      name: "Acme SSO",
      config: "{}",
      secret_enc: "SEEDED-CLIENT-SECRET-enc",
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
  await kyselySsoRepository(t.db, t.dialect).linkAccount(id, "acme", "sub-ana", new Date());
  await t.db
    .updateTable("account")
    .set({
      access_token: SECRETS.idpAccess,
      refresh_token: SECRETS.idpRefresh,
      id_token: SECRETS.idpId,
    })
    .where("user_id", "=", id)
    .where("provider_id", "=", "acme")
    .execute();
  await kyselyScimUserRepository(t.db, t.dialect).insertLink({
    providerId: "acme",
    userId: id,
    externalId: "ext-ana",
    userName: "ana@example.com",
    givenName: "Ana",
    familyName: "Silva",
    displayName: "Ana Silva",
    active: true,
    createdAt: new Date(),
  });
  for (const name of ["team", "sales"])
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
  await requestAccess(headers, { workspace: "sales", message: "Please" }, app);
  const personal = await t.db
    .selectFrom("workspaces")
    .select("id")
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
  await release(tools, "helper", id);
  // An item root owns, in which Ana published one version: hers is listed, not root's.
  const shared = await scopes.insert({
    name: "shared",
    description: "Shared.",
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: rootId,
    createdAt: new Date(),
  });
  const rootsItem = await release(shared, "house", rootId);
  await kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertVersion({
    itemId: rootsItem,
    version: "1.1.0",
    manifest: { name: "house", type: "skill", description: "house.", version: "1.1.0" },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${rootsItem}-2.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: id,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
    reviewed: false,
  });
  const submissionId = await draft(headers, "shared", "style", true);
  const rootsSubmission = await draft(asRoot, "shared", "rooms", true);
  await comment(headers, rootsSubmission, { body: "Looks fine to me." }, app);
  return { id, headers, tokenValue: token.token, submissionId };
};

describe("exportUserData (104)", () => {
  it("fills every section from a person's rows, oldest first, with no secret in the text", async () => {
    const ana = await seedAna();
    const { data, rows, by } = await exportAs(ana.headers, ana.id, {
      now: new Date("2026-10-18T14:03:22.417Z"),
    });
    expect(by).toBe("self");
    const text = JSON.stringify(data);

    expect(data.version).toBe(1);
    expect(data.exportedAt).toEqual(new Date("2026-10-18T14:03:22.417Z"));
    expect(data.instance).toEqual({ name: "Ronne AI Marketplace", url: "https://ronne.example" });
    expect(data.truncated).toBeUndefined();
    expect(data.account).toMatchObject({
      id: ana.id,
      name: "Ana Silva",
      email: "ana@example.com",
      role: "user",
      disabledAt: null,
      twoFactorEnabled: true,
      locale: "pt",
      scim: { provider: "Acme SSO", externalId: "ext-ana", active: true },
    });
    expect(data.account.signInMethods).toEqual([
      "password",
      { provider: "Acme SSO", linkedAt: expect.any(Date) },
    ]);
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions[0]).toMatchObject({ ipAddress: IP, userAgent: "TestBrowser/1.0" });
    expect(data.accessTokens.map((x) => x.name)).toEqual(["laptop", "desk"]);
    expect(data.accessTokens[0]).toMatchObject({
      prefix: expect.stringMatching(/^rmk_/),
      revokedAt: null,
    });
    expect(data.deviceGrants).toEqual([
      {
        name: "phone",
        status: "approved",
        createdAt: expect.any(Date),
        decidedAt: expect.any(Date),
      },
    ]);
    expect(data.workspaces.map((w) => w.name).sort()).toEqual(
      ["global", "team", expect.stringContaining("")].sort(),
    );
    expect(data.workspaces.find((w) => w.name === "team")).toMatchObject({
      role: "user",
      source: null,
    });
    expect(data.accessRequests).toEqual([
      { workspace: "sales", status: "open", message: "Please", createdAt: expect.any(Date) },
    ]);
    expect(data.scopes).toEqual([
      { name: "@tools", workspace: expect.any(String), createdAt: expect.any(Date) },
    ]);
    expect(data.items).toEqual([
      {
        name: "@tools/helper",
        workspace: expect.any(String),
        type: "skill",
        owner: true,
        versions: [{ version: "1.0.0", publishedAt: expect.any(Date), publishedByMe: true }],
      },
      {
        name: "@shared/house",
        workspace: "global",
        type: "skill",
        owner: false,
        versions: [{ version: "1.1.0", publishedAt: expect.any(Date), publishedByMe: true }],
      },
    ]);
    expect(data.submissions).toEqual([
      {
        name: "@shared/style",
        workspace: "global",
        status: "submitted",
        createdAt: expect.any(Date),
        submittedAt: expect.any(Date),
        revisions: 1,
        files: ["ronne.yaml", "rule.md"],
      },
    ]);
    expect(data.comments).toEqual([
      {
        submission: "@shared/rooms",
        workspace: "global",
        kind: "comment",
        body: "Looks fine to me.",
        createdAt: expect.any(Date),
      },
    ]);
    // Her events: as the actor (sign-ins, token creation, submits) and as the target (root made her).
    expect(data.auditEvents.some((e) => e.as === "target" && e.action === "user.created")).toBe(
      true,
    );
    expect(
      data.auditEvents.some((e) => e.as === "actor" && e.action === "access_token.created"),
    ).toBe(true);
    // Every list oldest first.
    const ordered = <T extends { createdAt?: Date; at?: Date }>(list: T[]) => {
      const times = list.map((x) => (x.createdAt ?? x.at)?.getTime() ?? 0);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    };
    for (const list of [
      data.sessions,
      data.accessTokens,
      data.deviceGrants,
      data.accessRequests,
      data.submissions,
      data.comments,
      data.auditEvents,
    ])
      ordered(list as { createdAt?: Date; at?: Date }[]);

    // No secret anywhere in the text: not the seeded ones, a hash, a token, the password's hash.
    const hashes = [
      ...(await t.db.selectFrom("access_tokens").select("token_hash").execute()).map(
        (r) => r.token_hash,
      ),
      ...(await t.db.selectFrom("session").select("token").execute()).map((r) => r.token),
      ...(await t.db.selectFrom("account").select("password").execute())
        .map((r) => r.password)
        .filter((p): p is string => Boolean(p)),
      ...Object.values(SECRETS),
      "SEEDED-DEVICE-CODE-HASH-aa11",
      "SEEDED-CLIENT-SECRET-enc",
      ana.tokenValue,
    ];
    expect(hashes.length).toBeGreaterThan(8);
    for (const secret of hashes) expect(text, secret.slice(0, 12)).not.toContain(secret);
    expect(text).not.toMatch(/token_hash|backup_codes|"secret"|"password"\s*:/);

    // The counts the event records.
    expect(rows).toMatchObject({ sessions: 2, accessTokens: 2, deviceGrants: 1, items: 2 });
    const event = (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.find(
      (e) => e.action === "user.data_exported",
    );
    expect(event).toMatchObject({
      actorId: ana.id,
      targetType: "user",
      targetId: ana.id,
      metadata: { by: "self", rows },
    });
    expect(JSON.stringify(event?.metadata)).not.toContain("Looks fine");
  });

  it("replaces other people's emails in the events, and keeps the person's own", async () => {
    const ana = await seedAna();
    await adminCreateUser(
      asRoot,
      { email: "bob@example.com", name: "Bob", role: "user", password },
      app,
    );
    // Root's file holds root's `user.created` for Ana and Bob: Ana's and Bob's addresses are
    // other people's there.
    const { data } = await exportAs(asRoot, rootId);
    const text = JSON.stringify(data);
    expect(text).not.toContain("ana@example.com");
    expect(text).not.toContain("bob@example.com");
    expect(text).toContain("root@example.com");
    expect(text).toContain("[other]");
    // Ana's own file keeps her address in the event that made her, but not root's IP address.
    const mine = await exportAs(ana.headers, ana.id);
    const created = mine.data.auditEvents.find((e) => e.action === "user.created");
    expect(created?.ipAddress).toBeNull();
    expect(mine.data.auditEvents.some((e) => e.as === "actor" && e.ipAddress === IP)).toBe(true);
    expect(JSON.stringify(created?.metadata)).toContain("ana@example.com");
  });

  it("makes root's file for another account, a disabled one too, and records who asked", async () => {
    const ana = await seedAna();
    await adminDisableUser(asRoot, ana.id, app);
    const { data, by } = await exportAs(asRoot, ana.id);
    expect(by).toBe("root");
    expect(data.account).toMatchObject({ id: ana.id });
    expect(data.account.disabledAt).not.toBeNull();
    const event = (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.find(
      (e) => e.action === "user.data_exported",
    );
    expect(event).toMatchObject({ actorId: rootId, targetId: ana.id, metadata: { by: "root" } });
  });

  it("refuses a moderator, a stranger, nobody, and a disabled person's own request", async () => {
    const ana = await seedAna();
    const disabled = await getCurrentUser(ana.headers, app);
    await adminDisableUser(asRoot, ana.id, app);
    await expect(
      exportUserData({ repo: repo() }, { user: disabled, ip: IP }, ana.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const mod = await adminCreateUser(
      asRoot,
      { email: "mod@example.com", name: "Mod", role: "user", password },
      app,
    );
    await setWorkspaceRole(app, mod.id, "moderator");
    const asMod = await signedIn("mod@example.com");
    await expect(exportAs(asMod, ana.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportAs(new Headers(), ana.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportAs(asRoot, newId())).rejects.toBeInstanceOf(UserNotFoundError);
    expect(
      (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.some(
        (e) => e.action === "user.data_exported",
      ),
    ).toBe(false);
  });

  it("allows one download per account per ten minutes, root's counted for the person", async () => {
    const ana = await seedAna();
    const start = new Date("2026-10-18T10:00:00Z");
    await exportAs(ana.headers, ana.id, { now: start });
    const again = await exportAs(ana.headers, ana.id, {
      now: new Date(start.getTime() + 1000),
    }).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(DataExportLimitError);
    expect((again as DataExportLimitError).seconds).toBe(599);
    // Root's attempt for the same person is refused too, and so is the person after root's.
    await expect(
      exportAs(asRoot, ana.id, { now: new Date(start.getTime() + 60_000) }),
    ).rejects.toMatchObject({ seconds: 540 });
    const later = new Date(start.getTime() + USER_DATA_WINDOW_MS);
    await exportAs(asRoot, ana.id, { now: later });
    await expect(
      exportAs(ana.headers, ana.id, { now: new Date(later.getTime() + 1000) }),
    ).rejects.toBeInstanceOf(DataExportLimitError);
    // Another account's limit is its own.
    await exportAs(asRoot, rootId, { now: new Date(start.getTime() + 1000) });
    expect(await lastExport({ repo: repo() }, ana.id)).toEqual(later);
  });

  it("lets only one of two downloads at once through", async () => {
    const ana = await seedAna();
    const results = await Promise.allSettled([
      exportAs(ana.headers, ana.id),
      exportAs(asRoot, ana.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results.filter((r) => r.status === "rejected" && r.reason instanceof DataExportLimitError),
    ).toHaveLength(1);
    const events = (await listAuditEvents(t.db, t.dialect, { size: 100 })).events;
    expect(events.filter((e) => e.action === "user.data_exported")).toHaveLength(1);
  });

  it("cuts a list past the limit, oldest kept, and a long comment, and says so", async () => {
    const ana = await seedAna();
    for (let i = 0; i < 3; i++)
      await t.db
        .insertInto("access_tokens")
        .values({
          id: newId(),
          user_id: ana.id,
          name: `extra-${i}`,
          token_hash: newId() + newId(),
          token_prefix: `rmk_extra${i}`,
          last_used_at: null,
          expires_at: null,
          revoked_at: null,
          created_at: at(new Date(Date.now() + 60_000 * (i + 1))),
          created_via: "web",
        })
        .execute();
    const { data } = await exportAs(ana.headers, ana.id, { maxRows: 3, commentMax: 5 });
    expect(data.accessTokens.map((x) => x.name)).toEqual(["laptop", "desk", "extra-0"]);
    expect(data.truncated).toEqual(expect.arrayContaining(["accessTokens", "comments"]));
    expect(data.comments[0]?.body).toBe("Looks…");
    expect(JSON.parse(JSON.stringify(data)).truncated).toContain("accessTokens");
  });

  it("cuts items by their versions and the audit events, and keeps the oldest", async () => {
    const ana = await seedAna();
    const all = (await exportAs(ana.headers, ana.id)).data;
    // Past the 10-minute limit of the first download.
    const { data } = await exportAs(ana.headers, ana.id, {
      now: new Date(Date.now() + 3 * USER_DATA_WINDOW_MS),
      maxRows: 1,
    });
    expect(data.truncated).toEqual(
      expect.arrayContaining(["items", "auditEvents", "sessions", "accessTokens"]),
    );
    expect(data.items).toHaveLength(1);
    expect(data.items.flatMap((i) => i.versions)).toHaveLength(1);
    expect(data.auditEvents).toHaveLength(1);
    expect(data.auditEvents[0]?.at).toEqual(all.auditEvents[0]?.at);
    expect(data.sessions[0]?.createdAt).toEqual(all.sessions[0]?.createdAt);
  });

  it("names a deleted identity provider", async () => {
    const ana = await seedAna();
    await t.db.deleteFrom("scim_users").where("user_id", "=", ana.id).execute();
    await t.db.deleteFrom("identity_providers").where("id", "=", "acme").execute();
    const { data } = await exportAs(ana.headers, ana.id);
    expect(data.account.signInMethods).toContainEqual({
      provider: "(deleted provider)",
      linkedAt: expect.any(Date),
    });
  });

  it("answers an erased account with UserErasedError and records nothing", async () => {
    const ana = await seedAna();
    await eraseUser(
      { repo: kyselyEraseRepository(t.db, t.dialect) },
      { user: await getCurrentUser(asRoot, app), ip: IP },
      ana.id,
      {
        confirm: "ana@example.com",
      },
    );
    await expect(exportAs(asRoot, ana.id)).rejects.toBeInstanceOf(UserErasedError);
    expect(
      (await listAuditEvents(t.db, t.dialect, { size: 200 })).events.some(
        (e) => e.action === "user.data_exported",
      ),
    ).toBe(false);
  });
});
