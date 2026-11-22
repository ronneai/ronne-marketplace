import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import type { CurrentUser } from "../../identity/models/user";
import { testAppAuth } from "../../identity/testing/test-auth";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { signUpReadiness } from "../actions/sign-up";
import { InvalidSignUpSettingError, SignUpUnavailableError } from "../exceptions/errors";
import { PASSWORD_SIGN_IN_POLICY_KEY } from "../models/password-sign-in-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import { type SignUpInput, setSignUpPolicy, signUpPolicy } from "./sign-up";

let t: TestDb;
let root: CurrentUser;
const READY = { mail: true, contact: true, password: true };
const NOW = new Date("2026-11-21T12:00:00.000Z");
const repo = () => kyselySettingsRepository(t.db, t.dialect);
const save = (input: SignUpInput, readiness = READY) =>
  setSignUpPolicy(
    { repo: repo(), now: () => NOW },
    { user: root, ip: "203.0.113.9" },
    input,
    readiness,
  );
const base: SignUpInput = {
  enabled: true,
  domainsMode: "list",
  domains: "acme.com, ACME.co.uk\nacme.com",
  approval: true,
  blockThrowaway: true,
  codeMinutes: "20",
  challenge: true,
  termsUrl: "https://acme.com/terms",
  termsVersion: "2026-11",
};

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

describe("saving self-registration (190)", () => {
  it("reads as off on an instance that never saved it", async () => {
    expect(await signUpPolicy(repo())).toMatchObject({ enabled: false, domains: "any" });
  });

  it("saves every field, the domains as delivery reads them, once each, and audits before and after", async () => {
    expect(await save(base)).toEqual({ changed: true });
    expect(await signUpPolicy(repo())).toEqual({
      enabled: true,
      domains: ["acme.com", "acme.co.uk"],
      approval: true,
      blockThrowaway: true,
      codeMinutes: 20,
      challenge: true,
      termsUrl: "https://acme.com/terms",
      termsVersion: "2026-11",
      termsRequiredVersion: "",
    });
    const [event, ...rest] = (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.filter(
      (e) => e.action === "settings.sign_up_changed",
    );
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      actorId: root.id,
      metadata: {
        from: { enabled: false, domains: "any", codeMinutes: 15, termsUrl: null },
        to: {
          enabled: true,
          domains: ["acme.com", "acme.co.uk"],
          codeMinutes: 20,
          termsVersion: "2026-11",
        },
      },
    });
    // The same again changes nothing and records nothing.
    expect(await save(base)).toEqual({ changed: false });
  });

  it("refuses a bad domain, a lifetime out of range and a link that isn't https", async () => {
    for (const [input, field] of [
      [{ ...base, domains: "*.acme.com" }, "domains"],
      [{ ...base, domains: "acme" }, "domains"],
      [{ ...base, domains: "" }, "domains"],
      [
        { ...base, domains: Array.from({ length: 101 }, (_, i) => `d${i}.example`).join(" ") },
        "domains",
      ],
      [{ ...base, codeMinutes: "4" }, "codeMinutes"],
      [{ ...base, codeMinutes: "61" }, "codeMinutes"],
      [{ ...base, codeMinutes: "7.5" }, "codeMinutes"],
      [{ ...base, termsUrl: "http://acme.com/terms" }, "termsUrl"],
      [{ ...base, termsUrl: "https://user:pw@acme.com/terms" }, "termsUrl"],
      [{ ...base, termsUrl: "javascript:alert(1)" }, "termsUrl"],
      [{ ...base, termsVersion: "" }, "termsVersion"],
      [{ ...base, termsVersion: "two\nlines" }, "termsVersion"],
      [{ ...base, termsVersion: "2026\u202e11" }, "termsVersion"],
      [{ ...base, termsUrl: "https:acme.com/terms" }, "termsUrl"],
      [{ ...base, domains: "1.2.3.4" }, "domains"],
    ] as const) {
      const error = await save(input).catch((e: unknown) => e);
      expect(error, JSON.stringify(input).slice(0, 80)).toBeInstanceOf(InvalidSignUpSettingError);
      expect((error as InvalidSignUpSettingError).field).toBe(field);
    }
    expect(await signUpPolicy(repo())).toMatchObject({ enabled: false });
  });

  it("can't turn sign-up on without email, the contact or password sign-in, and says which", async () => {
    for (const [readiness, reason] of [
      [{ ...READY, mail: false }, "mail"],
      [{ ...READY, contact: false }, "contact"],
      [{ ...READY, password: false }, "password"],
    ] as const) {
      const error = await save(base, readiness).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SignUpUnavailableError);
      expect((error as SignUpUnavailableError).reason).toBe(reason);
    }
    // On already and then closed (email gone): the rest still saves, and it stays on.
    await save(base);
    expect(await save({ ...base, codeMinutes: "45" }, { ...READY, mail: false })).toEqual({
      changed: true,
    });
    expect(await signUpPolicy(repo())).toMatchObject({ enabled: true, codeMinutes: 45 });
    // Off, the rest saves whatever is missing.
    expect(
      await save({ ...base, enabled: false }, { mail: false, contact: false, password: false }),
    ).toEqual({
      changed: true,
    });
  });

  it("asks everyone to accept a new terms version only when root ticks the box", async () => {
    await save(base);
    await save({ ...base, termsVersion: "2026-12" });
    expect(await signUpPolicy(repo())).toMatchObject({
      termsVersion: "2026-12",
      termsRequiredVersion: "",
    });
    await save({ ...base, termsVersion: "2027-01", askAgain: true });
    expect(await signUpPolicy(repo())).toMatchObject({
      termsVersion: "2027-01",
      termsRequiredVersion: "2027-01",
    });
    // No link, nothing asked.
    await save({ ...base, termsUrl: "", termsVersion: "ignored" });
    expect(await signUpPolicy(repo())).toMatchObject({
      termsUrl: "",
      termsVersion: "",
      termsRequiredVersion: "",
    });
  });

  it("is root's only", async () => {
    const user = { ...root, id: "01NOTROOT00000000000000000", role: "user" as const };
    await expect(
      setSignUpPolicy({ repo: repo() }, { user, ip: null }, base, READY),
    ).rejects.toThrow();
  });
});

describe("what sign-up needs first (190)", () => {
  it("reads email, the contact and password sign-in from the instance", async () => {
    const app = testAppAuth(t);
    expect(await signUpReadiness(app)).toEqual({ mail: false, contact: false, password: true });
    await saveMailSetup(
      { repo: repo() },
      { user: root, ip: null },
      {
        transport: "resend",
        fromAddress: "marketplace@acme.com",
        replyTo: "it-help@acme.com",
        secret: "re_test_key",
      },
      { authSecret: "test-secret-test-secret-test-secret-00", allowedHosts: new Set() },
    );
    expect(await signUpReadiness(app)).toEqual({ mail: true, contact: false, password: true });
  });

  it("reads Root only as sign-in does: it holds while an identity provider is on, tested or not", async () => {
    const app = testAppAuth(t);
    await repo().set(PASSWORD_SIGN_IN_POLICY_KEY, "root_only", root.id, NOW);
    // No provider on: everyone still signs in with a password.
    expect((await signUpReadiness(app)).password).toBe(true);
    const at = toDbDate(NOW, t.dialect);
    await t.db
      .insertInto("identity_providers")
      .values({
        id: "acme",
        type: "oidc",
        preset: "okta",
        name: "Acme SSO",
        enabled: toDbBoolean(true, t.dialect),
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
        created_at: at,
        updated_at: at,
      })
      .execute();
    expect((await signUpReadiness(app)).password).toBe(false);
  });
});
