import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { openBody } from "../../mail/models/outbox";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { onMailQueued } from "../../mail/services/notices";
import { SIGN_UP_KEYS } from "../../settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { setPasswordResetPolicy } from "../../settings/services/password-reset";
import { passwordResetDeps } from "../actions/password-reset";
import { createRoot } from "../actions/root-account";
import { signIn } from "../actions/session";
import { confirmTwoFactor, startTwoFactor } from "../actions/two-factor";
import { RESET_GRANT_MS, resetTokenHash } from "../models/password-reset";
import { formStamp } from "../models/sign-up-guard";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, TEST_SECRET, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import * as reset from "./password-reset";

// Feature 194, task 5: the reset itself.
let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
let ana: string;
let clock: Date;
const OLD = "correct horse battery";
const NEW = "a brand new passphrase";
const settings = () => kyselySettingsRepository(t.db, t.dialect);
const deps = (): reset.PasswordResetDeps => ({
  ...passwordResetDeps(app, {
    authSecret: TEST_SECRET,
    publicUrl: "https://marketplace.acme.com",
    now: () => clock,
  }),
  minimumMs: 0,
});
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

/** The code from the latest email. */
const latestCode = async () => {
  const [row] = await t.db
    .selectFrom("mail_outbox")
    .select(["id", "body_enc"])
    .where("template", "=", "reset_code")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  const text = row?.body_enc ? (openBody(TEST_SECRET, row.id, row.body_enc)?.text ?? "") : "";
  return /\b(\d{6})\b/.exec(text)?.[1] ?? "";
};
/** A request, then its code: the new-password page's cookie. */
const granted = async () => {
  const asked = await reset.requestPasswordReset(deps(), {
    email: "ana@acme.com",
    locale: "en",
    stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
    honeypot: "",
    challenge: undefined,
    ip: null,
  });
  if (!asked.ok) throw new Error(asked.refusal);
  const step = await reset.checkResetCode(deps(), {
    token: asked.token,
    code: await latestCode(),
    ip: null,
  });
  if (!step.ok) throw new Error(step.refusal);
  return step;
};
const complete = (
  token: string | null,
  extra: Partial<{ password: string; confirm: string; revokeTokens: boolean }> = {},
) =>
  reset.completePasswordReset(deps(), {
    token,
    password: extra.password ?? NEW,
    confirm: extra.confirm ?? extra.password ?? NEW,
    revokeTokens: extra.revokeTokens ?? true,
    ip: "203.0.113.9",
  });
const signInWith = (password: string) =>
  signIn(new Headers(), { email: "ana@acme.com", password, rememberMe: false }, app);
const sessions = async () =>
  (await t.db.selectFrom("session").select("id").where("user_id", "=", ana).execute()).length;
const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter((e) => e.action === action);
const addToken = async () => {
  await t.db
    .insertInto("access_tokens")
    .values({
      id: newId(),
      user_id: ana,
      name: "laptop",
      token_hash: newId().padEnd(64, "0"),
      last_used_at: null,
      expires_at: null,
      revoked_at: null,
      created_at: toDbDate(clock, t.dialect),
    })
    .execute();
};
const liveTokens = async () =>
  (
    await t.db
      .selectFrom("access_tokens")
      .select("id")
      .where("user_id", "=", ana)
      .where("revoked_at", "is", null)
      .execute()
  ).length;

/** An `rmk login --web` sign-in Ana approved and rmk hasn't picked up yet (107). */
const approvedGrant = () =>
  t.db
    .insertInto("device_grants")
    .values({
      id: newId(),
      device_code_hash: "d".repeat(64),
      user_code: "ABCDEFGH",
      client_id: "rmk",
      name: "laptop",
      status: "approved",
      user_id: ana,
      requester_ip: null,
      approver_ip: null,
      interval_seconds: 5,
      last_polled_at: null,
      decided_at: toDbDate(clock, t.dialect),
      created_at: toDbDate(clock, t.dialect),
      expires_at: toDbDate(new Date(clock.getTime() + 600_000), t.dialect),
    })
    .execute();
const grantStatus = async () =>
  (await t.db.selectFrom("device_grants").select("status").executeTakeFirst())?.status;

beforeEach(async () => {
  // The notices read the server's own AUTH_SECRET, as the outbox seals with it (189).
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.com",
    name: "Root",
    password: OLD,
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  ana = await createTestUser(app, { email: "ana@acme.com", password: OLD, name: "Ana" });
  await saveMailSetup(
    { repo: settings() },
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
  await setPasswordResetPolicy(
    { repo: settings() },
    { user: root, ip: null },
    { enabled: true },
    async () => ({ mail: true, working: true, contact: true }),
  );
  await settings().set(SIGN_UP_KEYS.challenge, "off", root.id, clock);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe("the reset (194)", () => {
  it("sets the password, ends every session, revokes tokens, audits, and sends the notice; signs no one in", async () => {
    const signed = await signInWith(OLD);
    expect(signed.ok).toBe(true);
    await addToken();
    expect(await sessions()).toBe(1);
    const grant = await granted();
    expect(await complete(grant.token)).toEqual({ ok: true, done: true });
    // Every session ended, and none made.
    expect(await sessions()).toBe(0);
    expect(await liveTokens()).toBe(0);
    // The new password works, the old one doesn't.
    expect((await signInWith(OLD)).ok).toBe(false);
    expect((await signInWith(NEW)).ok).toBe(true);
    const [event] = await events("user.password_reset_by_email");
    expect(event).toMatchObject({
      actorId: ana,
      targetId: ana,
      metadata: { sessionsEnded: 1, tokensRevoked: 1, tokensKept: false, twoFactor: false },
    });
    const notice = await t.db
      .selectFrom("mail_outbox")
      .select(["template", "user_id"])
      .where("template", "=", "password_reset_by_email")
      .execute();
    expect(notice).toEqual([{ template: "password_reset_by_email", user_id: ana }]);
  });

  it("keeps the access tokens only when the box is unticked", async () => {
    await addToken();
    const grant = await granted();
    expect(await complete(grant.token, { revokeTokens: false })).toEqual({ ok: true, done: true });
    expect(await liveTokens()).toBe(1);
    expect((await events("user.password_reset_by_email"))[0]?.metadata).toMatchObject({
      tokensRevoked: 0,
      tokensKept: true,
    });
  });

  it("clears root's request to change the password (128): the person just chose it", async () => {
    await t.db
      .updateTable("user")
      .set({ password_change_required_at: toDbDate(clock, t.dialect) })
      .where("id", "=", ana)
      .execute();
    const grant = await granted();
    await complete(grant.token);
    const row = await t.db
      .selectFrom("user")
      .select("password_change_required_at")
      .where("id", "=", ana)
      .executeTakeFirst();
    expect(row?.password_change_required_at).toBeNull();
  });

  it("works once: a second submit, or the same cookie again, is refused", async () => {
    const grant = await granted();
    expect(await complete(grant.token)).toEqual({ ok: true, done: true });
    expect(await complete(grant.token, { password: "yet another passphrase" })).toEqual({
      ok: false,
      refusal: "spent",
    });
    expect((await signInWith(NEW)).ok).toBe(true);
  });

  it("works for 10 minutes from the last step", async () => {
    const grant = await granted();
    later(RESET_GRANT_MS);
    expect(await complete(grant.token)).toEqual({ ok: false, refusal: "expired" });
    expect((await signInWith(OLD)).ok).toBe(true);
  });

  it("ends the account's other reset flows and codes, and approved rmk sign-ins", async () => {
    const first = await granted();
    later(61_000);
    const other = await reset.requestPasswordReset(deps(), {
      email: "ana@acme.com",
      locale: "en",
      stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
      honeypot: "",
      challenge: undefined,
      ip: null,
    });
    if (!other.ok) throw new Error(other.refusal);
    await approvedGrant();
    expect(await complete(first.token)).toEqual({ ok: true, done: true });
    expect(
      await t.db
        .selectFrom("password_reset_flows")
        .select("id")
        .where("user_id", "=", ana)
        .execute(),
    ).toEqual([]);
    const live = await t.db
      .selectFrom("email_codes")
      .select("id")
      .where("purpose", "=", "password_reset")
      .where("consumed_at", "is", null)
      .execute();
    expect(live).toEqual([]);
    expect(
      (await t.db.selectFrom("device_grants").select("status").executeTakeFirst())?.status,
    ).toBe("denied");
  });

  it("allows the same password as before (Decision 7), and applies the password rules", async () => {
    const grant = await granted();
    expect(await complete(grant.token, { password: "short" })).toEqual({
      ok: false,
      refusal: "password_short",
    });
    expect(await complete(grant.token, { password: "x".repeat(129) })).toEqual({
      ok: false,
      refusal: "password_long",
    });
    expect(await complete(grant.token, { password: NEW, confirm: "something else" })).toEqual({
      ok: false,
      refusal: "mismatch",
    });
    // A refused form leaves the grant: the person corrects it and saves.
    expect(await complete(grant.token, { password: OLD })).toEqual({ ok: true, done: true });
  });

  it("an account disabled before the save: the reset can't continue", async () => {
    const grant = await granted();
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(clock, t.dialect) })
      .where("id", "=", ana)
      .execute();
    expect(await complete(grant.token)).toEqual({ ok: false, refusal: "cannot_continue" });
    expect(await t.db.selectFrom("password_reset_flows").select("id").execute()).toEqual([]);
  });

  it("two-factor turned on after the code step: back to its step first", async () => {
    const grant = await granted();
    // Ana turns two-factor on in another browser meanwhile.
    const first = await signInWith(OLD);
    if (!first.ok || first.twoFactor) throw new Error("not signed in");
    const session = cookieHeaders(first.headers.get("set-cookie"));
    const started = await startTwoFactor(session, { password: OLD }, app);
    if (!started.ok) throw new Error(started.error);
    await confirmTwoFactor(session, { code: totpCode(started.uri), uri: started.uri }, app);
    const back = await complete(grant.token);
    if (!back.ok || back.done) throw new Error(JSON.stringify(back));
    expect(back.step).toBe("two_factor");
    expect(
      (
        await t.db
          .selectFrom("password_reset_flows")
          .select("step")
          .where("token_hash", "=", resetTokenHash(TEST_SECRET, back.token))
          .executeTakeFirst()
      )?.step,
    ).toBe("two_factor");
    // The old cookie is gone, and the password is unchanged.
    expect(await complete(grant.token)).toEqual({ ok: false, refusal: "spent" });
    expect((await signInWith(OLD)).ok).toBe(true);
  });

  it("no cookie, or one from an earlier step", async () => {
    expect(await complete(null)).toEqual({ ok: false, refusal: "missing" });
    expect(await complete("not-a-token")).toEqual({ ok: false, refusal: "spent" });
  });

  it("withdraws approved rmk sign-ins even with the tokens kept", async () => {
    await approvedGrant();
    const grant = await granted();
    expect(await complete(grant.token, { revokeTokens: false })).toEqual({ ok: true, done: true });
    expect(await grantStatus()).toBe("denied");
  });

  it("hands the notice to the scheduler only once the reset has committed", async () => {
    const grant = await granted();
    // A scheduler that fails can't undo the reset: it runs after the commit.
    onMailQueued(() => {
      throw new Error("the scheduler failed");
    });
    try {
      await expect(complete(grant.token)).rejects.toThrow("the scheduler failed");
    } finally {
      onMailQueued(undefined);
    }
    expect((await signInWith(NEW)).ok).toBe(true);
    expect(await events("user.password_reset_by_email")).toHaveLength(1);
  });

  // The database servers only: each in-memory SQLite connection is its own database.
  it.skipIf(!process.env.TEST_DATABASE_URL)("two submits at once reset once", async () => {
    const grant = await granted();
    const answers = await Promise.all([
      complete(grant.token),
      complete(grant.token, { password: "yet another passphrase" }),
    ]);
    expect(answers.filter((a) => a.ok)).toHaveLength(1);
    expect(await events("user.password_reset_by_email")).toHaveLength(1);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)(
    "an account made root while the reset runs isn't reset",
    async () => {
      const grant = await granted();
      const other = createDb(t.url);
      try {
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let promoted!: () => void;
        const promoting = new Promise<void>((resolve) => {
          promoted = resolve;
        });
        // Another root promotes Ana, and holds the change a moment before it commits.
        const promotion = other.db.transaction().execute(async (trx) => {
          await trx.updateTable("user").set({ role: "root" }).where("id", "=", ana).execute();
          promoted();
          await held;
        });
        await promoting;
        const answer = complete(grant.token);
        await new Promise((resolve) => setTimeout(resolve, 300));
        release();
        await promotion;
        expect(await answer).toEqual({ ok: false, refusal: "cannot_continue" });
        expect((await signInWith(OLD)).ok).toBe(true);
      } finally {
        await other.db.destroy();
      }
    },
  );

  it.skipIf(!process.env.TEST_DATABASE_URL)(
    "a sign-in with the old password while the reset holds the account leaves no session",
    async () => {
      const grant = await granted();
      let held!: () => void;
      const holding = new Promise<void>((resolve) => {
        held = resolve;
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const base = deps();
      // The reset pauses just after taking the account's row.
      const paused: reset.PasswordResetDeps = {
        ...base,
        repo: {
          ...base.repo,
          transaction: (work) =>
            base.repo.transaction((inner) =>
              work({
                ...inner,
                lockAccount: async (id) => {
                  await inner.lockAccount(id);
                  held();
                  await released;
                },
              }),
            ),
        },
      };
      const resetting = reset.completePasswordReset(paused, {
        token: grant.token,
        password: NEW,
        confirm: NEW,
        revokeTokens: true,
        ip: null,
      });
      await holding;
      // Someone signs in with the old password meanwhile: it waits on the account's row.
      const signing = signInWith(OLD);
      await new Promise((resolve) => setTimeout(resolve, 200));
      release();
      expect(await resetting).toEqual({ ok: true, done: true });
      await signing;
      expect(await sessions()).toBe(0);
      expect((await signInWith(NEW)).ok).toBe(true);
    },
  );
});
