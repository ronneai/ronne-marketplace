import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import type { Resolver } from "../../../scans/models/endpoint";
import { composeMime } from "../../models/compose";
import type { MailFailureReason, MailTransport, SendResult } from "../../models/message";
import { checkSmtpHost } from "../../models/smtp-host";
import { cleanDetail } from "./http";

/**
 * How the connection is encrypted: `tls` from the first byte (port 465), `starttls` required
 * (port 587; a server that doesn't offer it fails, never falls back), or `none`, only to a relay
 * the operator lists in `RONNE_MAIL_HOSTS` and never with a user name and password.
 */
export type SmtpTls = "tls" | "starttls" | "none";

export type SmtpConfig = {
  host: string;
  port: number;
  tls: SmtpTls;
  user?: string;
  password?: string;
};

/** Connection, greeting and socket timeouts (189): 10, 10 and 30 seconds. A timeout is retried. */
export const SMTP_TIMEOUTS = { connection: 10_000, greeting: 10_000, socket: 30_000 } as const;

/** Whether a value is one of the three ways a connection may be encrypted. */
export const isSmtpTls = (value: unknown): value is SmtpTls =>
  value === "tls" || value === "starttls" || value === "none";

export type SmtpDeps = {
  /** The operator's `RONNE_MAIL_HOSTS`: hosts that skip the address check and may use `none`. */
  allowedHosts: ReadonlySet<string>;
  resolve?: Resolver;
  /** Extra trusted certificates, for tests; an operator's internal CA is `NODE_EXTRA_CA_CERTS`. */
  ca?: string;
  timeouts?: { connection: number; greeting: number; socket: number };
  /** The host check; the real one unless a test needs an address the check would refuse. */
  check?: typeof checkSmtpHost;
};

/** Every address a host resolves to, IPv4 and IPv6. */
export const resolveAll: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

type SmtpError = Error & {
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
};

// A reply's code and enhanced status code (`535 5.7.8`), the part of it that's safe to show.
const REPLY_CODES = /^\s*(\d{3})(?:[ -](\d\.\d{1,3}\.\d{1,3}))?/;

/**
 * What of the server's answer may be shown. At the AUTH stage, only the reply's codes: a careless
 * server can echo what the client sent (the password, in any encoding, or split over reply
 * lines), and no list of encodings would catch them all. Elsewhere, the reply cleaned of secrets.
 */
export const detailOf = (error: SmtpError, secrets: readonly string[]): string => {
  const reply = error.response ?? error.message ?? String(error);
  const atAuth = error.code === "EAUTH" || /^AUTH\b/i.test(error.command ?? "");
  if (!atAuth) return cleanDetail(reply, secrets);
  const codes = REPLY_CODES.exec(reply);
  return codes
    ? `authentication refused (${[codes[1], codes[2]].filter(Boolean).join(" ")})`
    : "authentication refused";
};

/** What nodemailer's error means for this try: retried, or failed for good, and why. */
const resultOfError = (error: SmtpError, secrets: readonly string[]): SendResult => {
  const detail = detailOf(error, secrets);
  const retry = (reason: MailFailureReason): SendResult => ({ status: "retry", reason, detail });
  const fail = (reason: MailFailureReason): SendResult => ({ status: "failed", reason, detail });
  // A 4xx reply is temporary whatever stage it came at, AUTH included (454 4.7.0).
  const code = error.responseCode;
  if (typeof code === "number" && code >= 400 && code < 500) return retry("server");
  switch (error.code) {
    case "EAUTH":
    case "ENOAUTH":
      return fail("auth");
    case "ETLS":
    case "EREQUIRETLS":
      return fail("tls");
    case "ETIMEDOUT":
      return retry("timeout");
    case "ECONNECTION":
    case "ESOCKET":
    case "EDNS":
      // A certificate that doesn't verify, or a TLS handshake that breaks after the server said
      // yes to STARTTLS, comes as a socket error: TLS failed, for good, not a retry.
      return /certificate|self.signed|unable to verify|altnames|CERT_|SSL|TLS|wrong version/i.test(
        error.message ?? "",
      )
        ? fail("tls")
        : retry("connection");
    case "ECONFIG":
      return fail("config");
  }
  if (typeof code === "number" && code >= 500) return fail("rejected");
  return retry("connection");
};

/**
 * SMTP through nodemailer (189). The host is checked before each connection, as on save, and
 * nodemailer connects to an address the check returned, with the typed host as the TLS server
 * name: certificates are always verified against it, and there's no switch to turn that off.
 */
export const smtpTransport = (config: SmtpConfig, deps: SmtpDeps): MailTransport => ({
  kind: "smtp",
  send: async (message) => {
    // The password, and the AUTH PLAIN and LOGIN blobs the client builds from it, in case the
    // server echoes one back.
    const secrets = config.password
      ? [config.password, `\u0000${config.user ?? ""}\u0000${config.password}`]
      : [];
    // Anything but the three modes (a typo in the environment, a damaged setting) is refused:
    // nodemailer would otherwise use STARTTLS only when offered, and fall back to plain text.
    if (!isSmtpTls(config.tls))
      return {
        status: "failed",
        reason: "config",
        detail: "not a TLS mode: tls, starttls or none",
      };
    // Composed first: a message that isn't safe to send (a line break in a header) is a mistake
    // in Ronne, thrown before any connection, never a retry.
    const raw = await composeMime(message);
    const checked = await (deps.check ?? checkSmtpHost)(config.host, {
      allowedHosts: deps.allowedHosts,
      resolve: deps.resolve ?? resolveAll,
    });
    if (!checked.ok)
      return checked.problem === "unresolved"
        ? { status: "retry", reason: "connection", detail: "the host doesn't resolve" }
        : {
            status: "failed",
            reason: "config",
            detail: `the host is refused (${checked.problem})`,
          };
    const listed = checked.addresses === null;
    if (config.tls === "none" && (!listed || config.user || config.password))
      return {
        status: "failed",
        reason: "config",
        detail: "plain SMTP is only for a relay in RONNE_MAIL_HOSTS, without a user name",
      };
    const timeouts = deps.timeouts ?? SMTP_TIMEOUTS;
    const transport = nodemailer.createTransport({
      host: checked.addresses?.[0] ?? checked.host,
      port: config.port,
      secure: config.tls === "tls",
      requireTLS: config.tls === "starttls",
      ignoreTLS: config.tls === "none",
      tls: {
        servername: checked.host,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        ...(deps.ca ? { ca: deps.ca } : {}),
      },
      ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
      connectionTimeout: timeouts.connection,
      greetingTimeout: timeouts.greeting,
      socketTimeout: timeouts.socket,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
    try {
      const info = await transport.sendMail({
        envelope: { from: message.from.address, to: [message.to] },
        raw,
      });
      return info.messageId ? { status: "sent", providerId: info.messageId } : { status: "sent" };
    } catch (error) {
      return resultOfError(error as SmtpError, secrets);
    } finally {
      transport.close();
    }
  },
});
