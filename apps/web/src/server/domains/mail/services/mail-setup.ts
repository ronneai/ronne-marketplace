import { requirePermission } from "../../identity/models/permissions";
import type { Resolver } from "../../scans/models/endpoint";
import type { SettingsRepository } from "../../settings/repositories/settings-repository";
import { turnOffPasswordResetForContact } from "../../settings/services/password-reset";
import type { SettingsActor } from "../../settings/services/settings";
import {
  InvalidMailSetupError,
  MailHostInternalError,
  MailHostUnresolvedError,
  MailPlainSmtpError,
} from "../exceptions/errors";
import {
  instanceContact,
  isMailTransportKind,
  isSafeText,
  MAIL_KEYS,
  type MailLastStatus,
  type MailTransportKind,
  openMailSecret,
  parseLastStatus,
  SECRET_FIELDS,
  type SecretField,
  STORED_FIELDS,
  type StoredMailSetup,
  sealMailSecret,
  secretFieldOf,
  setupFingerprint,
  targetOf,
  UNTESTED_FIELDS,
} from "../models/mail-settings";
import type { MailAddress, MailTransport } from "../models/message";
import { isMailAddress } from "../models/message";
import { checkSmtpHost } from "../models/smtp-host";
import {
  isMailDomain,
  mailgunTransport,
  postmarkTransport,
  resendTransport,
} from "../repositories/transports/apis";
import { isAwsRegion, sesTransport } from "../repositories/transports/ses";
import { isSmtpTls, smtpTransport } from "../repositories/transports/smtp";

export type MailSetupDeps = { repo: SettingsRepository; now?: () => Date };

/** What a save and the sender need besides the form: the secret to seal with, and the host check. */
export type MailSetupContext = {
  authSecret: string | undefined;
  /** The operator's `RONNE_MAIL_HOSTS`. */
  allowedHosts: ReadonlySet<string>;
  resolve?: Resolver;
};

/** The setup as stored, every field a string. */
export const storedMailSetup = async (repo: SettingsRepository): Promise<StoredMailSetup> => {
  const values = await Promise.all(STORED_FIELDS.map((field) => repo.get(MAIL_KEYS[field])));
  return Object.fromEntries(
    STORED_FIELDS.map((field, i) => [field, values[i]?.value ?? ""]),
  ) as StoredMailSetup;
};

/** What the Email tab shows: every field but the secrets, which say only whether one is saved. */
export type MailSetupShown = Omit<StoredMailSetup, SecretField> & {
  /** Whether a secret is saved for the transport and target shown (write-only: never its value). */
  secretSaved: boolean;
  /** `unreadable` when the AUTH_SECRET can't open the saved secret: replace it. */
  secretProblem: "unreadable" | null;
  /** Set up but neither tested nor used yet: `untested`. */
  status: "not_set_up" | "untested" | MailLastStatus;
  /** The operator's relays, which may skip the host check and use plain SMTP. */
  relayHosts: string[];
};

const RESOLVE_NOT_SET: Resolver = async () => [];

/**
 * The status the tab shows (194): a result through another setup (before root changed it) says
 * nothing about this one, so it's untested, as is a success that names no setup (recorded before
 * 194), since 194's switch doesn't count it either. A failure that names none (its credentials
 * couldn't be read) is shown. The setup's fingerprint stays on the server.
 */
const shownStatus = (
  stored: StoredMailSetup,
  last: MailLastStatus | null,
): MailSetupShown["status"] => {
  if (!isMailTransportKind(stored.transport)) return "not_set_up";
  if (!last) return "untested";
  const fingerprint = setupFingerprint(stored);
  if (last.status === "working")
    return last.setup === fingerprint ? { status: "working", at: last.at } : "untested";
  if (last.setup !== undefined && last.setup !== fingerprint) return "untested";
  return { status: "failing", at: last.at, reason: last.reason };
};

/** The tab's view of the setup (189). Root only. */
export const mailSetup = async (
  deps: MailSetupDeps,
  actor: SettingsActor,
  context: MailSetupContext,
): Promise<MailSetupShown> => {
  requirePermission(actor.user, "settings.manage");
  const stored = await storedMailSetup(deps.repo);
  const last = parseLastStatus((await deps.repo.get(MAIL_KEYS.lastStatus))?.value);
  const { smtpPassword: _p, apiKey: _k, sesSecret: _s, ...shown } = stored;
  let secretSaved = false;
  let secretProblem: "unreadable" | null = null;
  if (isMailTransportKind(stored.transport)) {
    const field = secretFieldOf(stored.transport);
    if (stored[field]) {
      // Without an AUTH_SECRET a saved secret can't be opened, as the sender finds too.
      const opened = context.authSecret
        ? openMailSecret(context.authSecret, field, stored[field], {
            transport: stored.transport,
            target: targetOf(stored),
          })
        : "unreadable";
      secretSaved = typeof opened === "object";
      if (opened === "unreadable") secretProblem = "unreadable";
    }
  }
  return {
    ...shown,
    secretSaved,
    secretProblem,
    status: shownStatus(stored, last),
    relayHosts: [...context.allowedHosts].sort(),
  };
};

export type MailSetupInput = Partial<
  Record<Exclude<keyof StoredMailSetup, SecretField>, unknown>
> & {
  /** The credential, typed only to set or replace it: empty keeps the saved one. */
  secret?: unknown;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const MAX_NAME = 100;
const MAX_USER = 256;
const MAX_SECRET = 4096;
const ACCESS_KEY_ID = /^[A-Z0-9]{16,128}$/;

/** What the audit keeps of a setup: never a secret, a user name or an access key ID. */
const summary = (setup: StoredMailSetup) => ({
  transport: setup.transport || null,
  from: setup.fromAddress || null,
  fromName: setup.fromName || null,
  replyTo: setup.replyTo || null,
  contact: setup.contact || null,
  ...(setup.transport === "smtp"
    ? {
        smtpHost: setup.smtpHost || null,
        smtpPort: setup.smtpPort || null,
        smtpTls: setup.smtpTls || null,
      }
    : {}),
  ...(setup.transport === "ses" || setup.transport === "mailgun"
    ? { region: setup.region || null }
    : {}),
  ...(setup.transport === "mailgun" ? { domain: setup.domain || null } : {}),
});

/** Checks every field for the chosen transport, and returns the setup to store (secrets aside). */
const checkedSetup = async (
  input: MailSetupInput,
  context: MailSetupContext,
): Promise<{ setup: Omit<StoredMailSetup, SecretField>; transport: MailTransportKind }> => {
  const transport = text(input.transport);
  if (!isMailTransportKind(transport)) throw new InvalidMailSetupError("transport");
  const fromAddress = text(input.fromAddress);
  if (!isMailAddress(fromAddress)) throw new InvalidMailSetupError("fromAddress");
  const fromName = text(input.fromName);
  if (Array.from(fromName).length > MAX_NAME || !isSafeText(fromName))
    throw new InvalidMailSetupError("fromName");
  const replyTo = text(input.replyTo);
  if (!isMailAddress(replyTo)) throw new InvalidMailSetupError("replyTo");
  const typedContact = text(input.contact);
  const contact = typedContact ? instanceContact(typedContact) : "";
  if (contact === null) throw new InvalidMailSetupError("contact");

  const setup = {
    transport,
    fromAddress,
    fromName,
    replyTo,
    contact,
    smtpHost: "",
    smtpPort: "",
    smtpTls: "",
    smtpUser: "",
    region: "",
    domain: "",
    sesAccessKeyId: "",
  };
  if (transport === "smtp") {
    const tls = text(input.smtpTls);
    if (!isSmtpTls(tls)) throw new InvalidMailSetupError("smtpTls");
    const portText =
      text(input.smtpPort) || (tls === "tls" ? "465" : tls === "starttls" ? "587" : "25");
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535)
      throw new InvalidMailSetupError("smtpPort");
    const user = text(input.smtpUser);
    if (user.length > MAX_USER || !isSafeText(user)) throw new InvalidMailSetupError("smtpUser");
    const checked = await checkSmtpHost(text(input.smtpHost), {
      allowedHosts: context.allowedHosts,
      resolve: context.resolve ?? RESOLVE_NOT_SET,
    });
    if (!checked.ok) {
      if (checked.problem === "internal address") throw new MailHostInternalError();
      if (checked.problem === "unresolved") throw new MailHostUnresolvedError();
      throw new InvalidMailSetupError("smtpHost");
    }
    if (tls === "none" && (checked.addresses !== null || user)) throw new MailPlainSmtpError();
    Object.assign(setup, {
      smtpHost: checked.host,
      smtpPort: String(port),
      smtpTls: tls,
      smtpUser: user,
    });
  } else if (transport === "ses") {
    const region = text(input.region);
    if (!isAwsRegion(region)) throw new InvalidMailSetupError("region");
    const id = text(input.sesAccessKeyId);
    if (!ACCESS_KEY_ID.test(id)) throw new InvalidMailSetupError("sesAccessKeyId");
    Object.assign(setup, { region, sesAccessKeyId: id });
  } else if (transport === "mailgun") {
    const region = text(input.region);
    if (region !== "us" && region !== "eu") throw new InvalidMailSetupError("region");
    const domain = text(input.domain).toLowerCase();
    if (!isMailDomain(domain)) throw new InvalidMailSetupError("domain");
    Object.assign(setup, { region, domain });
  }
  return { setup, transport };
};

/**
 * Root saves how email leaves the server (189). The host is checked as on every connection; a
 * secret is write-only, sealed with the transport and target it was typed for, and a kept one is
 * dropped when either changes, so it never goes elsewhere. Audited as `settings.mail` with what
 * changed and what happened to the secret, never the secret, the user name or the access key ID.
 */
export const saveMailSetup = async (
  deps: MailSetupDeps,
  actor: SettingsActor,
  input: MailSetupInput,
  context: MailSetupContext,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const { setup, transport } = await checkedSetup(input, context);
  // The credential as typed, kept only in this call: never logged, returned or audited.
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";
  if (secret.length > MAX_SECRET || (secret && !isSafeText(secret)))
    throw new InvalidMailSetupError("secretInvalid");
  if (secret && !context.authSecret) throw new InvalidMailSetupError("noAuthSecret");
  // A password with no user name would be dropped: said, rather than lost without a word.
  if (secret && transport === "smtp" && !setup.smtpUser)
    throw new InvalidMailSetupError("secretWithoutUser");
  const field = secretFieldOf(transport);
  const typedFor = { transport, target: targetOf(setup) };

  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const from = await storedMailSetup(repo);
    const to: StoredMailSetup = { ...from, ...setup };
    let credentialChange: "set" | "replaced" | "removed" | null = null;
    // Every secret but the transport's own goes: it was typed for something else.
    for (const other of SECRET_FIELDS)
      if (other !== field && from[other]) {
        to[other] = "";
        credentialChange = "removed";
      }
    const kept =
      from[field] && context.authSecret
        ? openMailSecret(context.authSecret, field, from[field], typedFor)
        : "elsewhere";
    if (secret) {
      to[field] = sealMailSecret(context.authSecret as string, field, secret, typedFor);
      credentialChange = from[field] ? "replaced" : "set";
    } else if (from[field] && typeof kept !== "object") {
      to[field] = "";
      credentialChange = "removed";
    }
    // SMTP may go without a user name; every other transport needs its credential.
    const needsSecret = transport !== "smtp" || setup.smtpUser !== "";
    if (needsSecret && !to[field]) throw new InvalidMailSetupError("secret");
    if (transport === "smtp" && !setup.smtpUser && to[field]) {
      to[field] = "";
      if (from[field]) credentialChange = "removed";
    }
    const changed = STORED_FIELDS.filter((f) => (from[f] ?? "") !== (to[f] ?? ""));
    if (changed.length === 0) return { changed: false };
    const by = actor.user?.id ?? null;
    // Every field, in one order, not only the changed ones: two saves at once then end as one
    // save's whole setup (the second waits for the first's rows, then writes all of its own),
    // never a mix of the two that neither would have saved.
    for (const f of STORED_FIELDS) await repo.set(MAIL_KEYS[f], to[f], by, at);
    // A change to how email is sent makes the last test or send about another setup: cleared, so
    // the tab says untested and 194's switch waits for a test of this one. The contact, the
    // sender's name and the reply-to address don't change whether email goes out.
    if (changed.some((f) => !UNTESTED_FIELDS.has(f)))
      await repo.set(MAIL_KEYS.lastStatus, "", by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.mail",
        target: { type: "instance" },
        metadata: {
          setup: { from: summary(from), to: summary(to) },
          ...(credentialChange ? { credentialChange } : {}),
        },
        ipAddress: actor.ip,
      },
      at,
    );
    // No contact, no reset by email (194): every notice must say whom to tell.
    if (to.contact === "") await turnOffPasswordResetForContact(repo, by, actor.ip, at);
    return { changed: true };
  });
};

/** The sender the outbox and the test email use, or why there's none (189). */
export type MailSender =
  | {
      ok: true;
      transport: MailTransport;
      from: MailAddress;
      replyTo: string;
      /** The instance contact, printed in every security notice; "" when root set none. */
      contact: string;
      /** Which setup this is (`setupFingerprint`), recorded with a success. */
      setup: string;
    }
  | { ok: false; problem: "not_set_up" | "credentials_unreadable" };

/**
 * The transport as set now, with its secret opened: each message is sent through the setup at the
 * time it's sent. A secret this AUTH_SECRET can't open makes it `credentials_unreadable`, and
 * nothing is sent.
 */
export const mailSender = async (
  repo: SettingsRepository,
  context: MailSetupContext & { ca?: string },
): Promise<MailSender> => {
  const setup = await storedMailSetup(repo);
  if (!isMailTransportKind(setup.transport) || !setup.fromAddress || !setup.replyTo)
    return { ok: false, problem: "not_set_up" };
  const field = secretFieldOf(setup.transport);
  let secret = "";
  if (setup[field]) {
    if (!context.authSecret) return { ok: false, problem: "credentials_unreadable" };
    const opened = openMailSecret(context.authSecret, field, setup[field], {
      transport: setup.transport,
      target: targetOf(setup),
    });
    if (typeof opened !== "object") return { ok: false, problem: "credentials_unreadable" };
    secret = opened.value;
  } else if (setup.transport !== "smtp" || setup.smtpUser) {
    return { ok: false, problem: "not_set_up" };
  }
  const transport = (() => {
    switch (setup.transport) {
      case "smtp":
        return smtpTransport(
          {
            host: setup.smtpHost,
            port: Number(setup.smtpPort),
            tls: setup.smtpTls as "tls" | "starttls" | "none",
            ...(setup.smtpUser ? { user: setup.smtpUser, password: secret } : {}),
          },
          { allowedHosts: context.allowedHosts, resolve: context.resolve, ca: context.ca },
        );
      case "ses":
        return sesTransport({
          region: setup.region,
          accessKeyId: setup.sesAccessKeyId,
          secretAccessKey: secret,
        });
      case "mailgun":
        return mailgunTransport({
          apiKey: secret,
          domain: setup.domain,
          region: setup.region as "us" | "eu",
        });
      case "postmark":
        return postmarkTransport({ serverToken: secret });
      case "resend":
        return resendTransport({ apiKey: secret });
    }
  })();
  return {
    ok: true,
    transport,
    from: setup.fromName
      ? { address: setup.fromAddress, name: setup.fromName }
      : { address: setup.fromAddress },
    replyTo: setup.replyTo,
    contact: setup.contact,
    setup: setupFingerprint(setup),
  };
};

/** Records the last test's or delivery's result, the tab's status: never an address. */
export const recordMailStatus = (
  repo: SettingsRepository,
  status: MailLastStatus,
  at: Date,
): Promise<void> => repo.set(MAIL_KEYS.lastStatus, JSON.stringify(status), null, at);
