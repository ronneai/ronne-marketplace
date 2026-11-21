import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { endSessionsForNewSecret } from "../../identity/actions/instance-access";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { Resolver } from "../../scans/models/endpoint";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import {
  InvalidMailSetupError,
  MailHostInternalError,
  MailPlainSmtpError,
} from "../exceptions/errors";
import { MAIL_KEYS, openMailSecret, parseMailRelays } from "../models/mail-settings";
import {
  type MailSetupContext,
  type MailSetupDeps,
  type MailSetupInput,
  mailSender,
  mailSetup,
  saveMailSetup,
  storedMailSetup,
} from "./mail-setup";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let deps: MailSetupDeps;
const at = new Date("2026-11-21T12:00:00.000Z");
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const KEY = "re_live_SECRET_0123456789";
const dns: Record<string, string[]> = {
  "smtp.example.com": ["93.184.215.14"],
  "smtp2.example.com": ["93.184.215.15"],
  "inside.example.com": ["10.0.0.9"],
  "relay.corp.internal": ["10.0.0.25"],
};
const resolve: Resolver = async (host) => {
  const found = dns[host];
  if (!found) throw new Error("ENOTFOUND");
  return found;
};
const context = (extra: Partial<MailSetupContext> = {}): MailSetupContext => ({
  authSecret: AUTH_SECRET,
  allowedHosts: new Set(),
  resolve,
  ...extra,
});
const actor = () => ({ user: root, ip: "203.0.113.9" });
const sender = {
  fromAddress: "marketplace@acme.example",
  fromName: "Acme Marketplace",
  replyTo: "it-help@acme.example",
};
const save = (input: MailSetupInput, ctx = context()) =>
  saveMailSetup(deps, actor(), { ...sender, ...input }, ctx);
const audits = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === "settings.mail");

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  deps = { repo: kyselySettingsRepository(t.db, t.dialect), now: () => at };
});
afterEach(() => t.cleanup());

describe("saveMailSetup (189)", () => {
  it("saves each transport with its fields, and builds a sender for it", async () => {
    const cases: [MailSetupInput, string][] = [
      [
        {
          transport: "smtp",
          smtpHost: "smtp.example.com",
          smtpTls: "starttls",
          smtpUser: "u",
          secret: "pw-1",
        },
        "smtp",
      ],
      [
        {
          transport: "ses",
          region: "eu-west-1",
          sesAccessKeyId: "AKIAEXAMPLE000000000",
          secret: "ses-secret",
        },
        "ses",
      ],
      [
        { transport: "mailgun", region: "eu", domain: "MG.Acme.Example", secret: "mg-key" },
        "mailgun",
      ],
      [{ transport: "postmark", secret: "pm-token" }, "postmark"],
      [{ transport: "resend", secret: KEY }, "resend"],
    ];
    for (const [input, kind] of cases) {
      await save(input);
      const built = await mailSender(deps.repo, context());
      expect(built).toMatchObject({
        ok: true,
        from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
        replyTo: "it-help@acme.example",
      });
      expect(built.ok && built.transport.kind).toBe(kind);
      // The domain as checked, in lower case; other transports' fields are cleared.
      if (kind === "mailgun")
        expect((await storedMailSetup(deps.repo)).domain).toBe("mg.acme.example");
      if (kind === "resend") expect((await storedMailSetup(deps.repo)).domain).toBe("");
    }
  });

  it("fills the SMTP port from the TLS mode, and keeps a typed one", async () => {
    await save({ transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "tls" });
    expect((await storedMailSetup(deps.repo)).smtpPort).toBe("465");
    await save({
      transport: "smtp",
      smtpHost: "smtp.example.com",
      smtpTls: "starttls",
      smtpPort: "2525",
    });
    expect((await storedMailSetup(deps.repo)).smtpPort).toBe("2525");
  });

  it("never reads a secret back: the view says only that one is saved", async () => {
    await save({ transport: "resend", secret: KEY });
    const shown = await mailSetup(deps, actor(), context());
    expect(shown.secretSaved).toBe(true);
    expect(JSON.stringify(shown)).not.toContain(KEY);
    const row = await deps.repo.get(MAIL_KEYS.apiKey);
    expect(row?.value).toMatch(/^v1\./);
    expect(row?.value).not.toContain(KEY);
    const [event] = await audits();
    expect(JSON.stringify(event)).not.toContain(KEY);
    expect(event?.metadata).toMatchObject({ credentialChange: "set" });
  });

  it("keeps a secret while its transport and target stay, and replaces it when typed", async () => {
    await save({ transport: "resend", secret: KEY });
    await save({ transport: "resend", fromName: "Acme" });
    expect((await mailSetup(deps, actor(), context())).secretSaved).toBe(true);
    await save({ transport: "resend", secret: "re_live_OTHER" });
    const stored = await storedMailSetup(deps.repo);
    expect(
      openMailSecret(AUTH_SECRET, "apiKey", stored.apiKey, { transport: "resend", target: "" }),
    ).toEqual({
      value: "re_live_OTHER",
    });
    expect((await audits()).map((e) => e.metadata.credentialChange ?? null)).toEqual([
      "replaced",
      null,
      "set",
    ]);
  });

  it("drops a kept secret when the transport or its target changes, so it never goes elsewhere", async () => {
    await save({ transport: "resend", secret: KEY });
    // Postmark takes an API key too, but the saved one was typed for Resend: it's not kept.
    await expect(save({ transport: "postmark" })).rejects.toThrow(InvalidMailSetupError);
    await save({ transport: "postmark", secret: "pm-token" });
    await save({
      transport: "smtp",
      smtpHost: "smtp.example.com",
      smtpTls: "starttls",
      smtpUser: "u",
      secret: "pw-1",
    });
    // Another host: the password typed for smtp.example.com isn't sent to smtp2.
    await expect(
      save({
        transport: "smtp",
        smtpHost: "smtp2.example.com",
        smtpTls: "starttls",
        smtpUser: "u",
      }),
    ).rejects.toThrow(InvalidMailSetupError);
    const stored = await storedMailSetup(deps.repo);
    expect(stored.apiKey).toBe("");
    expect(stored.smtpPassword).not.toBe("");
  });

  it("drops the API keys of other transports when the transport changes", async () => {
    await save({ transport: "resend", secret: KEY });
    await save({ transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "starttls" });
    const stored = await storedMailSetup(deps.repo);
    expect(stored.apiKey).toBe("");
    expect((await audits())[0]?.metadata).toMatchObject({ credentialChange: "removed" });
  });

  it("refuses a line break, a non-ASCII address and a contact that isn't https or has a user", async () => {
    const refused: MailSetupInput[] = [
      { fromName: "Acme\r\nBcc: x@example.com" },
      { fromAddress: "market@acme.example\r\nBcc: x@example.com" },
      { replyTo: "help@bücher.example" },
      { replyTo: "" },
      { contact: "http://help.acme.example" },
      { contact: "https://user:pw@help.acme.example" },
      { contact: "not a contact" },
    ];
    for (const input of refused)
      await expect(save({ transport: "resend", secret: KEY, ...input })).rejects.toThrow(
        InvalidMailSetupError,
      );
    await save({ transport: "resend", secret: KEY, contact: "https://help.acme.example/it" });
    await save({ transport: "resend", contact: "it-help@acme.example" });
    expect((await storedMailSetup(deps.repo)).contact).toBe("it-help@acme.example");
  });

  it("refuses an SMTP host on a private network unless the operator lists it", async () => {
    await expect(
      save({ transport: "smtp", smtpHost: "inside.example.com", smtpTls: "starttls" }),
    ).rejects.toThrow(MailHostInternalError);
    await expect(
      save({ transport: "smtp", smtpHost: "10.0.0.5", smtpTls: "starttls" }),
    ).rejects.toThrow(MailHostInternalError);
    await save(
      { transport: "smtp", smtpHost: "relay.corp.internal", smtpTls: "none" },
      context({ allowedHosts: new Set(["relay.corp.internal"]) }),
    );
    expect((await storedMailSetup(deps.repo)).smtpTls).toBe("none");
  });

  it("refuses plain SMTP to an unlisted host, and to a listed one with a user name", async () => {
    await expect(
      save({ transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "none" }),
    ).rejects.toThrow(MailPlainSmtpError);
    await expect(
      save(
        {
          transport: "smtp",
          smtpHost: "relay.corp.internal",
          smtpTls: "none",
          smtpUser: "u",
          secret: "pw",
        },
        context({ allowedHosts: new Set(["relay.corp.internal"]) }),
      ),
    ).rejects.toThrow(MailPlainSmtpError);
  });

  it("refuses a TLS mode, region, domain or access key ID it doesn't know", async () => {
    for (const input of [
      { transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "STARTTLS" },
      {
        transport: "ses",
        region: "evil.example/x",
        sesAccessKeyId: "AKIAEXAMPLE000000000",
        secret: "s",
      },
      { transport: "ses", region: "eu-west-1", sesAccessKeyId: "not an id", secret: "s" },
      { transport: "mailgun", region: "EU", domain: "mg.acme.example", secret: "k" },
      { transport: "mailgun", region: "us", domain: "mg.acme.example/../x", secret: "k" },
      { transport: "carrier-pigeon" },
    ])
      await expect(save(input)).rejects.toThrow(InvalidMailSetupError);
  });

  it("is root's alone", async () => {
    await expect(
      saveMailSetup(
        deps,
        { user: { ...root, role: "user" }, ip: null },
        { ...sender, transport: "resend", secret: KEY },
        context(),
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(mailSetup(deps, { user: null, ip: null }, context())).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("audits what changed, never the secret, the user name or the access key ID", async () => {
    await save({
      transport: "ses",
      region: "eu-west-1",
      sesAccessKeyId: "AKIAEXAMPLE000000000",
      secret: "ses-secret",
    });
    const [event] = await audits();
    const text = JSON.stringify(event?.metadata);
    for (const hidden of ["ses-secret", "AKIAEXAMPLE000000000"]) expect(text).not.toContain(hidden);
    expect(event?.metadata).toMatchObject({
      setup: { from: { transport: null }, to: { transport: "ses", region: "eu-west-1" } },
      credentialChange: "set",
    });
    expect(
      await save({ transport: "ses", region: "eu-west-1", sesAccessKeyId: "AKIAEXAMPLE000000000" }),
    ).toEqual({
      changed: false,
    });
  });
});

describe("saveMailSetup, its edges (189)", () => {
  it("bounds the instance contact, and keeps a URL as the parser reads it", async () => {
    await expect(
      save({
        transport: "resend",
        secret: KEY,
        contact: `https://help.acme.example/${"x".repeat(600)}`,
      }),
    ).rejects.toThrow(InvalidMailSetupError);
    for (const mended of [
      "https:/help.acme.example",
      "https:\\\\help.acme.example",
      "HTTPS://@help.acme.example",
    ])
      await expect(save({ transport: "resend", secret: KEY, contact: mended })).rejects.toThrow(
        InvalidMailSetupError,
      );
    await save({ transport: "resend", secret: KEY, contact: "https://Help.Acme.Example/it" });
    expect((await storedMailSetup(deps.repo)).contact).toBe("https://help.acme.example/it");
  });

  it("refuses every line break and control character in the sender's name", async () => {
    for (const fromName of ["A\u2028B", "A\u0085B", "A\u0000B", "A\u2029B", "A\tB"])
      await expect(save({ transport: "resend", secret: KEY, fromName })).rejects.toThrow(
        InvalidMailSetupError,
      );
  });

  it("refuses a password typed without a user name, and never says one was removed when none was", async () => {
    await expect(
      save({ transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "starttls", secret: "pw" }),
    ).rejects.toThrow(InvalidMailSetupError);
    await save({ transport: "smtp", smtpHost: "smtp.example.com", smtpTls: "starttls" });
    await save({
      transport: "smtp",
      smtpHost: "smtp.example.com",
      smtpTls: "starttls",
      smtpPort: "2525",
    });
    expect((await audits()).map((e) => e.metadata.credentialChange ?? null)).toEqual([null, null]);
  });

  it("drops a Mailgun key when the region changes, and keeps it when only the domain's case does", async () => {
    await save({ transport: "mailgun", region: "us", domain: "mg.acme.example", secret: "mg-key" });
    await save({ transport: "mailgun", region: "us", domain: "MG.ACME.EXAMPLE" });
    await expect(
      save({ transport: "mailgun", region: "eu", domain: "mg.acme.example" }),
    ).rejects.toThrow(InvalidMailSetupError);
  });

  it("binds the SES secret to its access key ID: a region change keeps it, a new ID drops it", async () => {
    const ses = { transport: "ses", sesAccessKeyId: "AKIAEXAMPLE000000000" };
    await save({ ...ses, region: "eu-west-1", secret: "ses-secret" });
    await save({ ...ses, region: "us-east-1" });
    expect((await mailSender(deps.repo, context())).ok).toBe(true);
    await expect(
      save({ transport: "ses", region: "us-east-1", sesAccessKeyId: "AKIAOTHER00000000000" }),
    ).rejects.toThrow(InvalidMailSetupError);
  });

  it("ends two saves made at once as one of them, never a mix neither would save", async () => {
    const relays = new Set(["relay.corp.internal"]);
    await save(
      { transport: "smtp", smtpHost: "relay.corp.internal", smtpTls: "starttls" },
      context({ allowedHosts: relays }),
    );
    // A: a public server with a user and password; B: the listed relay in plain text.
    const a = {
      transport: "smtp",
      smtpHost: "smtp.example.com",
      smtpTls: "starttls",
      smtpUser: "u",
      secret: "pw-1",
    };
    const b = { transport: "smtp", smtpHost: "relay.corp.internal", smtpTls: "none" };
    await Promise.allSettled([
      save(a, context({ allowedHosts: relays })),
      saveMailSetup(
        { repo: kyselySettingsRepository(t.db, t.dialect), now: () => at },
        actor(),
        { ...sender, ...b },
        context({ allowedHosts: relays }),
      ),
    ]);
    const end = await storedMailSetup(deps.repo);
    const isA =
      end.smtpHost === "smtp.example.com" && end.smtpTls === "starttls" && end.smtpUser === "u";
    const isB =
      end.smtpHost === "relay.corp.internal" && end.smtpTls === "none" && end.smtpUser === "";
    expect(isA || isB).toBe(true);
  });
});

describe("what root is told (189)", () => {
  it("says the saved secret can't be read when the server has no AUTH_SECRET", async () => {
    await save({ transport: "resend", secret: KEY });
    const shown = await mailSetup(deps, actor(), context({ authSecret: undefined }));
    expect(shown).toMatchObject({ secretSaved: false, secretProblem: "unreadable" });
  });

  it("names the field for a secret that can't be kept, or can't be sealed", async () => {
    for (const secret of ["a\nb", "x".repeat(4097)])
      await expect(save({ transport: "resend", secret })).rejects.toMatchObject({
        field: "secretInvalid",
      });
    await expect(
      save({ transport: "resend", secret: KEY }, context({ authSecret: undefined })),
    ).rejects.toMatchObject({
      field: "noAuthSecret",
    });
  });
});

describe("RONNE_MAIL_HOSTS (189)", () => {
  it("is read as names or addresses, comma- or space-separated, in any case", () => {
    expect([...parseMailRelays(" Relay.Corp.Internal., 10.0.0.25  [fd00::1]")].sort()).toEqual([
      "10.0.0.25",
      "fd00::1",
      "relay.corp.internal",
    ]);
    expect(parseMailRelays(undefined).size).toBe(0);
  });
});

describe("the sender (189)", () => {
  it("is not set up until root saves a transport", async () => {
    expect(await mailSender(deps.repo, context())).toEqual({ ok: false, problem: "not_set_up" });
    expect((await mailSetup(deps, actor(), context())).status).toBe("not_set_up");
  });

  it("says the credentials can't be read under another AUTH_SECRET, and sends nothing", async () => {
    await save({ transport: "resend", secret: KEY });
    const other = context({ authSecret: "another-secret-another-secret-0000" });
    expect(await mailSender(deps.repo, other)).toEqual({
      ok: false,
      problem: "credentials_unreadable",
    });
    expect((await mailSetup(deps, actor(), other)).secretProblem).toBe("unreadable");
  });

  it("opens again after rotate-secret, which re-seals the mail secrets with the others", async () => {
    await save({ transport: "resend", secret: KEY });
    const next = "rotated-secret-rotated-secret-00000";
    await endSessionsForNewSecret(t.db, t.dialect, () => {}, { from: AUTH_SECRET, to: next });
    expect(await mailSender(deps.repo, context())).toEqual({
      ok: false,
      problem: "credentials_unreadable",
    });
    const built = await mailSender(deps.repo, context({ authSecret: next }));
    expect(built.ok).toBe(true);
  });
});
