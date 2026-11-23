import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../db/create-db";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { testAppAuth } from "../../identity/testing/test-auth";
import { MAIL_KEYS, setupFingerprint } from "../../mail/models/mail-settings";
import { recordMailStatus, saveMailSetup, storedMailSetup } from "../../mail/services/mail-setup";
import { passwordResetReadiness, readinessIn } from "../actions/password-reset";
import { PasswordResetUnavailableError } from "../exceptions/errors";
import { PASSWORD_RESET_KEYS, type PasswordResetReadiness } from "../models/password-reset-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import { passwordResetPolicy, setPasswordResetPolicy } from "./password-reset";

let t: TestDb;
let root: CurrentUser;
const READY: PasswordResetReadiness = { mail: true, working: true, contact: true };
const NOW = new Date("2026-11-23T12:00:00.000Z");
const SECRET = "test-secret-test-secret-test-secret-00";
const repo = () => kyselySettingsRepository(t.db, t.dialect);
const save = (enabled: unknown, readiness = READY, user: CurrentUser = root) =>
  setPasswordResetPolicy(
    { repo: repo(), now: () => NOW },
    { user, ip: "203.0.113.9" },
    { enabled },
    async () => readiness,
  );
/** Turned on as the Authentication tab does: readiness read from the email setup, in the save. */
const saveFromSetup = (enabled: unknown, repository = repo()) =>
  setPasswordResetPolicy(
    { repo: repository, now: () => NOW },
    { user: root, ip: "203.0.113.9" },
    { enabled },
    readinessIn,
  );
const events = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.filter(
    (e) => e.action === "settings.password_reset_changed",
  );
/** A test or send that worked, through the email setup as it is now. */
const working = async () =>
  recordMailStatus(
    repo(),
    {
      status: "working",
      at: NOW.toISOString(),
      setup: setupFingerprint(await storedMailSetup(repo())),
    },
    NOW,
  );
const saveMail = (contact: string, secret = "re_test_key") =>
  saveMailSetup(
    { repo: repo(), now: () => NOW },
    { user: root, ip: "203.0.113.9" },
    {
      transport: "resend",
      fromAddress: "marketplace@acme.com",
      replyTo: "it-help@acme.com",
      contact,
      secret,
    },
    { authSecret: SECRET, allowedHosts: new Set() },
  );

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
});
afterEach(() => t.cleanup());

describe("the reset by email setting (194)", () => {
  it("reads as off on an instance that never saved it, with no row written", async () => {
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
    expect(await repo().get(PASSWORD_RESET_KEYS.enabled)).toBeNull();
  });

  it("turns on and off, and audits each change with the old and new value", async () => {
    expect(await save(true)).toEqual({ changed: true });
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: true });
    expect(await save("on")).toEqual({ changed: false });
    expect(await save(false)).toEqual({ changed: true });
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
    const audited = await events();
    expect(audited.map((e) => e.metadata)).toEqual([
      { from: true, to: false },
      { from: false, to: true },
    ]);
    expect(audited[0]).toMatchObject({ actorId: root.id, targetType: "instance" });
  });

  it("refuses to turn on without email, while its last test failed, or without a contact", async () => {
    for (const [readiness, reason] of [
      [{ mail: false, working: false, contact: true }, "mail"],
      [{ mail: true, working: false, contact: true }, "working"],
      [{ mail: true, working: true, contact: false }, "contact"],
      [{ mail: false, working: false, contact: false }, "mail"],
    ] as const) {
      const refused = save(true, readiness);
      await expect(refused).rejects.toBeInstanceOf(PasswordResetUnavailableError);
      await expect(refused).rejects.toMatchObject({ reason });
    }
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
    expect(await events()).toEqual([]);
  });

  it("always lets root turn it off, whatever blocks turning it on", async () => {
    await save(true);
    expect(await save(false, { mail: false, working: false, contact: false })).toEqual({
      changed: true,
    });
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
  });

  it("is root's alone", async () => {
    const user: CurrentUser = { ...root, id: "01K6BZ3W1D8J9Q2R4T6V8X0Y30", role: "user" };
    await expect(save(true, READY, user)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reads readiness from the email setup: set up, its last test or send worked, a contact", async () => {
    const app = testAppAuth(t);
    expect(await passwordResetReadiness(app)).toEqual({
      mail: false,
      working: false,
      contact: false,
    });
    await saveMail("it-help@acme.com");
    // Set up, never tested or used: not working yet.
    expect(await passwordResetReadiness(app)).toEqual({
      mail: true,
      working: false,
      contact: true,
    });
    await recordMailStatus(
      repo(),
      { status: "failing", at: NOW.toISOString(), reason: "auth" },
      NOW,
    );
    expect((await passwordResetReadiness(app)).working).toBe(false);
    await working();
    expect(await passwordResetReadiness(app)).toEqual({ mail: true, working: true, contact: true });
    // Email stopped: the transport cleared, so not working either.
    await repo().set(MAIL_KEYS.transport, "", root.id, NOW);
    expect(await passwordResetReadiness(app)).toEqual({
      mail: false,
      working: false,
      contact: true,
    });
  });

  it("turns off when root clears the instance contact, audited with the reason", async () => {
    await saveMail("it-help@acme.com");
    await save(true);
    await saveMail("https://help.acme.example/it");
    // Changing the contact keeps it on.
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: true });
    await saveMail("");
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
    const [cleared, ...rest] = await events();
    expect(cleared).toMatchObject({
      actorId: root.id,
      metadata: { from: true, to: false, reason: "contact_cleared" },
    });
    expect(rest.map((e) => e.metadata)).toEqual([{ from: false, to: true }]);
  });

  it("writes nothing when the contact is cleared while it's off", async () => {
    await saveMail("it-help@acme.com");
    await saveMail("");
    expect(await repo().get(PASSWORD_RESET_KEYS.enabled)).toBeNull();
    expect(await events()).toEqual([]);
  });
});

describe("the reset by email setting against the email setup (194)", () => {
  it("turns on from the email setup only once it's set up, tested and has a contact", async () => {
    await expect(saveFromSetup(true)).rejects.toMatchObject({ reason: "mail" });
    await saveMail("");
    await working();
    await expect(saveFromSetup(true)).rejects.toMatchObject({ reason: "contact" });
    // The contact typed, the key kept as saved (the form posts no secret).
    await saveMail("it-help@acme.com", "");
    expect(await saveFromSetup(true)).toEqual({ changed: true });
  });

  it("leaves the contact row as it was when it reads it", async () => {
    await saveMail("it-help@acme.com");
    await working();
    const before = await repo().get(MAIL_KEYS.contact);
    await saveFromSetup(true);
    expect(await repo().get(MAIL_KEYS.contact)).toEqual(before);
  });

  it("forgets the last test when how email is sent changes, but not for the contact", async () => {
    await saveMail("it-help@acme.com");
    await working();
    await saveMail("https://help.acme.example/it", "");
    expect((await passwordResetReadiness(testAppAuth(t))).working).toBe(true);
    // Another key, never tested: the test was of the one before.
    await saveMail("https://help.acme.example/it", "re_other_key");
    expect((await passwordResetReadiness(testAppAuth(t))).working).toBe(false);
    await expect(saveFromSetup(true)).rejects.toMatchObject({ reason: "working" });
  });

  it("doesn't take a success through the setup before a change for the new one's", async () => {
    await saveMail("it-help@acme.com");
    const before = setupFingerprint(await storedMailSetup(repo()));
    // A test of the old key still going while root saves another one, then ending well.
    await saveMail("it-help@acme.com", "re_other_key");
    await recordMailStatus(
      repo(),
      { status: "working", at: NOW.toISOString(), setup: before },
      NOW,
    );
    expect((await passwordResetReadiness(testAppAuth(t))).working).toBe(false);
    await expect(saveFromSetup(true)).rejects.toMatchObject({ reason: "working" });
  });

  it("is turned off by any save that leaves the contact empty, even one already empty", async () => {
    await saveMail("");
    // On with no contact, as only a direct write can leave it now.
    await repo().set(PASSWORD_RESET_KEYS.enabled, "on", root.id, NOW);
    await saveMail("", "re_other_key");
    expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
    expect((await events()).map((e) => e.metadata)).toEqual([
      { from: true, to: false, reason: "contact_cleared" },
    ]);
  });

  // Two connections at once: the database servers only (SQLite has one connection here).
  it.skipIf(process.env.TEST_DATABASE_URL === undefined)(
    "a contact cleared while it's being turned on ends with it off, or the turn-on refused",
    async () => {
      if (t.dialect === "sqlite") return;
      await saveMail("it-help@acme.com");
      await working();
      const other = createDb(t.url);
      try {
        let held!: () => void;
        const locked = new Promise<void>((resolve) => {
          held = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        // The turn-on reads readiness, holding the contact's row, then waits.
        const turnOn = setPasswordResetPolicy(
          { repo: repo(), now: () => NOW },
          { user: root, ip: null },
          { enabled: true },
          async (trx) => {
            const ready = await readinessIn(trx);
            held();
            await released;
            return ready;
          },
        );
        await locked;
        // Meanwhile another root clears the contact, on another connection: it waits for the row.
        const clear = saveMailSetup(
          { repo: kyselySettingsRepository(other.db, t.dialect), now: () => NOW },
          { user: root, ip: null },
          {
            transport: "resend",
            fromAddress: "marketplace@acme.com",
            replyTo: "it-help@acme.com",
            contact: "",
            secret: "re_test_key",
          },
          { authSecret: SECRET, allowedHosts: new Set() },
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        release();
        await Promise.allSettled([turnOn, clear]);
        await clear;
        expect(await passwordResetPolicy(repo())).toEqual({ enabled: false });
        expect((await repo().get(MAIL_KEYS.contact))?.value).toBe("");
      } finally {
        await other.db.destroy();
      }
    },
  );

  it.skipIf(process.env.TEST_DATABASE_URL === undefined)(
    "of several turn-ons at once, the first ever, one changes it and is audited, none fails",
    async () => {
      // Each on its own connection, all past their readiness check before any writes.
      const dbs = [0, 1, 2].map(() => createDb(t.url));
      try {
        let arrived = 0;
        let go!: () => void;
        const all = new Promise<void>((resolve) => {
          go = resolve;
        });
        const results = await Promise.all(
          dbs.map((other) =>
            setPasswordResetPolicy(
              { repo: kyselySettingsRepository(other.db, t.dialect), now: () => NOW },
              { user: root, ip: null },
              { enabled: true },
              async () => {
                arrived++;
                if (arrived === dbs.length) go();
                await all;
                return READY;
              },
            ),
          ),
        );
        expect(results.filter((r) => r.changed)).toHaveLength(1);
        expect(await events()).toHaveLength(1);
        expect(await passwordResetPolicy(repo())).toEqual({ enabled: true });
      } finally {
        for (const other of dbs) await other.db.destroy();
      }
    },
  );
});
