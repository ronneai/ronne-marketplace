import { openSetting, sealSetting } from "../../settings/models/instance-secrets";
import { isHeaderSafe, isMailAddress } from "./message";

/**
 * How email leaves the server (189), as root sets it on the Email tab and Ronne keeps it in
 * `instance_settings`. Everything is root's; only the operator's internal relays
 * (`RONNE_MAIL_HOSTS`) are read from the server.
 */
export const MAIL_KEYS = {
  transport: "mail_transport",
  fromAddress: "mail_from_address",
  fromName: "mail_from_name",
  replyTo: "mail_reply_to",
  contact: "mail_contact",
  smtpHost: "mail_smtp_host",
  smtpPort: "mail_smtp_port",
  smtpTls: "mail_smtp_tls",
  smtpUser: "mail_smtp_user",
  smtpPassword: "mail_smtp_password_enc",
  apiKey: "mail_api_key_enc",
  region: "mail_region",
  domain: "mail_domain",
  sesAccessKeyId: "mail_ses_access_key_id",
  sesSecret: "mail_ses_secret_access_key_enc",
  lastStatus: "mail_last_status",
} as const;

export const MAIL_TRANSPORTS = ["smtp", "ses", "mailgun", "postmark", "resend"] as const;
export type MailTransportKind = (typeof MAIL_TRANSPORTS)[number];

export const isMailTransportKind = (value: unknown): value is MailTransportKind =>
  typeof value === "string" && (MAIL_TRANSPORTS as readonly string[]).includes(value);

/** The setup as stored, every field a string ("" when unset); secrets still sealed. */
export type StoredMailSetup = {
  transport: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  contact: string;
  smtpHost: string;
  smtpPort: string;
  smtpTls: string;
  smtpUser: string;
  smtpPassword: string;
  apiKey: string;
  region: string;
  domain: string;
  sesAccessKeyId: string;
  sesSecret: string;
};

export const STORED_FIELDS = [
  "transport",
  "fromAddress",
  "fromName",
  "replyTo",
  "contact",
  "smtpHost",
  "smtpPort",
  "smtpTls",
  "smtpUser",
  "smtpPassword",
  "apiKey",
  "region",
  "domain",
  "sesAccessKeyId",
  "sesSecret",
] as const satisfies readonly (keyof StoredMailSetup)[];

export type SecretField = "smtpPassword" | "apiKey" | "sesSecret";
export const SECRET_FIELDS: readonly SecretField[] = ["smtpPassword", "apiKey", "sesSecret"];

/** Which secret a transport uses. */
export const secretFieldOf = (transport: MailTransportKind): SecretField =>
  transport === "smtp" ? "smtpPassword" : transport === "ses" ? "sesSecret" : "apiKey";

/**
 * What a secret was typed for: the transport, and where it goes (the SMTP host, the Mailgun
 * domain and region). Sealed with the secret, so it opens only for the same pair (136's rule):
 * a key typed for Resend never goes to Postmark, a password typed for one host never to another.
 */
export const targetOf = (
  setup: Pick<StoredMailSetup, "transport" | "smtpHost" | "domain" | "region" | "sesAccessKeyId">,
) => {
  if (setup.transport === "smtp") return setup.smtpHost.toLowerCase().replace(/\.$/, "");
  if (setup.transport === "mailgun") return `${setup.domain.toLowerCase()}@${setup.region}`;
  // SES's endpoint is always AWS's own, and the secret pairs with its access key ID: bound to
  // that, so a region change keeps it and a new ID drops it.
  if (setup.transport === "ses") return setup.sesAccessKeyId;
  return "";
};

export const sealMailSecret = (
  authSecret: string,
  field: SecretField,
  value: string,
  typedFor: { transport: string; target: string },
): string =>
  sealSetting(
    authSecret,
    MAIL_KEYS[field],
    JSON.stringify({ transport: typedFor.transport, target: typedFor.target, value }),
  );

/**
 * The secret, when this AUTH_SECRET opens it and it was typed for this transport and target;
 * `unreadable` when the AUTH_SECRET can't open it (the settings file was replaced); `elsewhere`
 * when it was typed for another transport or target.
 */
export const openMailSecret = (
  authSecret: string,
  field: SecretField,
  stored: string,
  usedFor: { transport: string; target: string },
): { value: string } | "unreadable" | "elsewhere" => {
  let sealed: unknown;
  try {
    sealed = JSON.parse(openSetting(authSecret, MAIL_KEYS[field], stored));
  } catch {
    return "unreadable";
  }
  if (sealed === null || typeof sealed !== "object") return "unreadable";
  const { transport, target, value } = sealed as Record<string, unknown>;
  if (typeof value !== "string" || value === "") return "unreadable";
  return transport === usedFor.transport && target === usedFor.target ? { value } : "elsewhere";
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;

/** A value with no control character in it: a CR or LF would end a header (injection). */
export const isSafeText = (value: string): boolean => !CONTROL.test(value) && isHeaderSafe(value);

/**
 * The instance contact (189): an email address, or an absolute `https://` URL with no user name or
 * password, such as a company's help page. Printed in every security notice.
 */
/** The longest instance contact: it's printed in every notice, and kept in one setting. */
export const MAX_CONTACT = 500;

/**
 * The contact as stored: an address as typed, or the URL as the parser reads it (`href`), never a
 * spelling another reader could take otherwise; null when it can't be one.
 */
export const instanceContact = (value: string): string | null => {
  if (value.length > MAX_CONTACT) return null;
  if (isMailAddress(value)) return value;
  // `https://` as typed: no other scheme, and no `https:/x` or `https:\\x` the parser mends.
  if (!/^https:\/\/[^/\\@\s]/i.test(value) || !isSafeText(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    const ok =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname !== "";
    return ok && url.href.length <= MAX_CONTACT ? url.href : null;
  } catch {
    return null;
  }
};

export const isInstanceContact = (value: string): boolean => instanceContact(value) !== null;

/** The operator's `RONNE_MAIL_HOSTS`: names or addresses, comma- or space-separated, any case. */
export { parseAllowedHosts as parseMailRelays } from "../../scans/models/endpoint";

/** What the reason category was, and when, of the last test or delivery: the tab's status. */
export type MailLastStatus =
  | { status: "working"; at: string }
  | { status: "failing"; at: string; reason: string };

export const parseLastStatus = (value: string | null | undefined): MailLastStatus | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.status === "working" && typeof parsed.at === "string")
      return { status: "working", at: parsed.at };
    if (
      parsed.status === "failing" &&
      typeof parsed.at === "string" &&
      typeof parsed.reason === "string"
    )
      return { status: "failing", at: parsed.at, reason: parsed.reason };
  } catch {}
  return null;
};
