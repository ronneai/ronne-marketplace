import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { runRetentionJob } from "../../../jobs/retention-job";
import { listAuditEvents } from "../../audit/actions/audit";
import { openBody } from "../../mail/models/outbox";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { authenticateToken, createMyToken, exchangePassword } from "../actions/access-tokens";
import { approvalDeps } from "../actions/approval";
import { getCurrentUser, signIn } from "../actions/session";
import { ApprovalAnsweredError } from "../exceptions/errors";
import type { CurrentUser } from "../models/user";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselySignUpRepository } from "../repositories/kysely-sign-up-repository";
import { cookieHeaders, createTestUser, TEST_SECRET, testAppAuth } from "../testing/test-auth";
import { approveAccount, declineAccount, declineExpiredAccounts } from "./approval";

let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
let other: CurrentUser;
const PASSWORD = "correct horse battery";
const DAY = 24 * 60 * 60_000;

const deps = (now?: () => Date) =>
  approvalDeps(t.db, t.dialect, {
    authSecret: TEST_SECRET,
    publicUrl: "https://marketplace.acme.com",
    ...(now ? { now } : {}),
  });
const asRoot = (user: CurrentUser) => ({ user, ip: null });

/** An account as sign-up makes it with approval on: the same write, waiting since `at`. */
const waiting = async (email: string, at = new Date()) =>
  kyselySignUpRepository(t.db, t.dialect, TEST_SECRET).createAccount({
    email,
    name: "Ana Lima",
    passwordHash: await argon2PasswordHasher.hash(PASSWORD),
    locale: "pt",
    approval: true,
    termsVersion: "2026-11",
    termsAcceptedAt: at,
    now: at,
  });

const mails = async () => {
  const rows = await t.db
    .selectFrom("mail_outbox")
    .select(["id", "template", "user_id", "body_enc", "locale"])
    .orderBy("created_at")
    .execute();
  return rows.map((row) => ({
    template: row.template,
    userId: row.user_id,
    locale: row.locale,
    ...(row.body_enc ? openBody(TEST_SECRET, row.id, row.body_enc) : null),
  }));
};
const audits = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter((e) => e.action === action);
const userRow = (id: string) =>
  t.db.selectFrom("user").selectAll().where("id", "=", id).executeTakeFirst();

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  const make = async (email: string) => {
    const id = await createTestUser(app, { email, password: PASSWORD, role: "root" });
    return { id, email, name: "Root", role: "root" as const, workspaces: {} };
  };
  root = await make("root@acme.com");
  other = await make("root2@acme.com");
  await saveMailSetup(
    { repo: kyselySettingsRepository(t.db, t.dialect) },
    { user: root, ip: null },
    {
      transport: "resend",
      fromAddress: "marketplace@acme.com",
      replyTo: "it-help@acme.com",
      contact: "it-help@acme.com",
      secret: "re_test_key",
    },
    { authSecret: TEST_SECRET, allowedHosts: new Set() },
  );
});
afterEach(() => t.cleanup());

describe("an account waiting for approval (190)", () => {
  it("is refused at web sign-in, once the password is right, and gets no session", async () => {
    await waiting("ana@acme.com");
    const wrong = await signIn(
      new Headers(),
      { email: "ana@acme.com", password: "not the password at all", rememberMe: false },
      app,
    );
    // A wrong password says nothing of approval.
    expect(wrong).toEqual({ ok: false, error: "invalid_credentials" });
    const right = await signIn(
      new Headers(),
      { email: "ana@acme.com", password: PASSWORD, rememberMe: false },
      app,
    );
    expect(right).toEqual({ ok: false, error: "approval_pending" });
    const id = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "ana@acme.com")
        .executeTakeFirstOrThrow()
    ).id;
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", id).execute(),
    ).toEqual([]);
    expect((await audits("auth.sign_in_failed")).map((e) => e.metadata.reason).sort()).toEqual([
      "approval_pending",
      "invalid",
    ]);
  });

  it("is refused by the token exchange (rmk login), once the password is right", async () => {
    await waiting("ana@acme.com");
    expect(
      await exchangePassword(
        { email: "ana@acme.com", password: "not the password at all" },
        new Headers(),
        app,
      ),
    ).toEqual({ ok: false, error: "invalid_credentials" });
    expect(
      await exchangePassword({ email: "ana@acme.com", password: PASSWORD }, new Headers(), app),
    ).toEqual({
      ok: false,
      error: "approval_pending",
    });
    expect(await t.db.selectFrom("access_tokens").select("id").execute()).toEqual([]);
  });

  it("is no signed-in person, even with a session: so it can't approve a device code either", async () => {
    // An account that had a session when it was marked waiting (made in the database by hand).
    const id = await createTestUser(app, { email: "bo@acme.com", password: PASSWORD });
    const result = await signIn(
      new Headers(),
      { email: "bo@acme.com", password: PASSWORD, rememberMe: false },
      app,
    );
    if (!result.ok) throw new Error("sign-in refused");
    const session = cookieHeaders(result.headers.getSetCookie().join(", "));
    expect(await getCurrentUser(session, app)).toMatchObject({ id });
    await t.db
      .updateTable("user")
      .set({ approval_pending_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", id)
      .execute();
    expect(await getCurrentUser(session, app)).toBeNull();
  });

  it("is approved by a root: it signs in, and its owner is emailed in their language", async () => {
    const id = await waiting("ana@acme.com");
    await approveAccount(deps(), asRoot(root), id);
    expect((await userRow(id))?.approval_pending_at).toBeNull();
    expect(
      await signIn(
        new Headers(),
        { email: "ana@acme.com", password: PASSWORD, rememberMe: false },
        app,
      ),
    ).toMatchObject({ ok: true });
    expect(await mails()).toMatchObject([
      { template: "sign_up_approved", to: "ana@acme.com", userId: id, locale: "pt" },
    ]);
    expect((await audits("user.approved"))[0]).toMatchObject({
      actorId: root.id,
      metadata: { email: "ana@acme.com" },
    });
  });

  it("is declined by a root: the account and all it had are deleted, and its owner is emailed", async () => {
    const id = await waiting("ana@acme.com");
    await declineAccount(deps(), asRoot(root), id);
    expect(await userRow(id)).toBeUndefined();
    for (const table of ["account", "workspace_members", "terms_acceptances"] as const)
      expect(
        await t.db.selectFrom(table).select("user_id").where("user_id", "=", id).execute(),
        table,
      ).toEqual([]);
    expect(
      await t.db.selectFrom("workspaces").select("id").where("owner_id", "=", id).execute(),
    ).toEqual([]);
    // The address is free again.
    await waiting("ana@acme.com");
    expect((await mails())[0]).toMatchObject({
      template: "sign_up_declined",
      to: "ana@acme.com",
      userId: null,
    });
    expect((await audits("user.declined"))[0]).toMatchObject({
      actorId: root.id,
      metadata: { email: "ana@acme.com", by: "root" },
    });
  });

  it("answers once when two roots answer at once; the other hears it was answered", async () => {
    const id = await waiting("ana@acme.com");
    const results = await Promise.allSettled([
      approveAccount(deps(), asRoot(root), id),
      declineAccount(deps(), asRoot(other), id),
    ]);
    const done = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(done).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApprovalAnsweredError);
    expect(await mails()).toHaveLength(1);
    // And a later answer is refused the same way.
    await expect(approveAccount(deps(), asRoot(root), id)).rejects.toBeInstanceOf(
      ApprovalAnsweredError,
    );
  });

  it("is only for roots, to approve or decline", async () => {
    const id = await waiting("ana@acme.com");
    const user = { ...root, id: "01NOTROOT00000000000000000", role: "user" as const };
    await expect(approveAccount(deps(), asRoot(user), id)).rejects.toThrow(/permission/i);
    await expect(declineAccount(deps(), asRoot(user), id)).rejects.toThrow(/permission/i);
    expect((await userRow(id))?.approval_pending_at).not.toBeNull();
    expect(await mails()).toEqual([]);
  });

  it("is listed under Awaiting approval, and not under Active", async () => {
    const id = await waiting("ana@acme.com");
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    const list = (status: "active" | "awaiting") =>
      repo
        .pageUsers({ sort: "created", dir: "asc", size: 50, status })
        .then((p) => p.rows.map((u) => u.id));
    expect(await list("awaiting")).toEqual([id]);
    expect(await list("active")).not.toContain(id);
    expect((await repo.findUser(id))?.approvalPendingAt).toBeInstanceOf(Date);
  });

  it("can't use a token made before it was marked waiting", async () => {
    const id = await createTestUser(app, { email: "bo@acme.com", password: PASSWORD });
    const result = await signIn(
      new Headers(),
      { email: "bo@acme.com", password: PASSWORD, rememberMe: false },
      app,
    );
    if (!result.ok) throw new Error("sign-in refused");
    const made = await createMyToken(
      cookieHeaders(result.headers.getSetCookie().join(", ")),
      { name: "laptop" },
      app,
    );
    expect((await authenticateToken(made.token, app)).ok).toBe(true);
    await t.db
      .updateTable("user")
      .set({ approval_pending_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", id)
      .execute();
    expect((await authenticateToken(made.token, app)).ok).toBe(false);
  });

  it("skips an account the job can't decline, and still declines the others", async () => {
    const now = new Date("2026-12-31T12:00:00.000Z");
    const stuck = await waiting("stuck@acme.com", new Date(now.getTime() - 32 * DAY));
    const other = await waiting("other@acme.com", new Date(now.getTime() - 31 * DAY));
    const base = deps(() => now);
    const failing = (repo: typeof base.repo): typeof base.repo => ({
      ...repo,
      transaction: (work) => repo.transaction((trx) => work(failing(trx))),
      deleteWaiting: async (id) => {
        if (id === stuck) throw new Error("a foreign key refused it");
        await repo.deleteWaiting(id);
      },
    });
    expect(await declineExpiredAccounts({ ...base, repo: failing(base.repo) })).toBe(1);
    expect(await userRow(stuck)).toBeDefined();
    expect(await userRow(other)).toBeUndefined();
    expect((await mails()).map((m) => m.to)).toEqual(["other@acme.com"]);
    // The next run, with nothing in the way, declines it.
    expect(await declineExpiredAccounts(base)).toBe(1);
    expect(await userRow(stuck)).toBeUndefined();
  });

  it("is declined by the retention job after 30 days, with the same email", async () => {
    const now = new Date("2026-12-31T12:00:00.000Z");
    const old = await waiting("old@acme.com", new Date(now.getTime() - 31 * DAY));
    const recent = await waiting("new@acme.com", new Date(now.getTime() - 29 * DAY));
    expect(await declineExpiredAccounts(deps(() => now))).toBe(1);
    expect(await userRow(old)).toBeUndefined();
    expect(await userRow(recent)).toBeDefined();
    expect((await mails()).map((m) => [m.template, m.to])).toEqual([
      ["sign_up_declined", "old@acme.com"],
    ]);
    expect((await audits("user.declined"))[0]).toMatchObject({
      actorId: null,
      metadata: { by: "retention" },
    });
    // Through the job itself, which counts it (it reads AUTH_SECRET, for the emails).
    vi.stubEnv("AUTH_SECRET", TEST_SECRET);
    const later = new Date(now.getTime() + 2 * DAY);
    const run = await runRetentionJob({ db: t.db, dialect: t.dialect, now: () => later });
    expect(run).toMatchObject({ status: "done" });
    expect(await userRow(recent)).toBeUndefined();
    expect(run).toMatchObject({ counts: { signUpsDeclined: 1 } });
    vi.unstubAllEnvs();
  });
});
