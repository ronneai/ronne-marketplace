/**
 * One email, as every transport sends it (189): a single recipient, the instance's sender and
 * Reply-To, a subject, and the text and HTML bodies. Never an attachment, a remote image or a
 * second recipient: Ronne only sends notices and codes to one person.
 */
export type MailAddress = { address: string; name?: string };

export type MailMessage = {
  /** The one recipient. */
  to: string;
  from: MailAddress;
  /** Where replies go: required, so a `no-reply@` sender never swallows an answer. */
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  /**
   * A key that is the same every time this message is tried (the outbox row's ID), for the
   * providers that drop a repeated send (Resend's `Idempotency-Key`).
   */
  idempotencyKey?: string;
};

/** Why a message didn't go, by kind: what the tab, the log and the retry rule look at. */
export type MailFailureReason =
  /** The server or API couldn't be reached, or closed the connection. */
  | "connection"
  /** It was reached, but didn't answer in time. */
  | "timeout"
  /** TLS failed: a bad certificate, or a server that won't start TLS. */
  | "tls"
  /** The credentials were refused. */
  | "auth"
  /** The provider said to slow down. */
  | "rate_limited"
  /** The provider failed on its side, for now. */
  | "server"
  /** The provider refused this message for good: the recipient, the sender or the content. */
  | "rejected"
  /** The setup can't work: a host that isn't allowed, plain SMTP with credentials. */
  | "config";

/**
 * What a transport made of one try. `sent`: the provider took it. `retry`: worth another try,
 * after `waitSeconds` when the provider said how long. `failed`: it won't go, whatever the wait.
 * `detail` is the provider's answer, short and cleaned of credentials, for root's test email.
 */
export type SendResult =
  | { status: "sent"; providerId?: string }
  | { status: "retry"; reason: MailFailureReason; waitSeconds?: number; detail?: string }
  | { status: "failed"; reason: MailFailureReason; detail?: string };

/** How email leaves the server: one transport, set by root or the operator. */
export type MailTransport = {
  readonly kind: "smtp" | "ses" | "mailgun" | "postmark" | "resend";
  send: (message: MailMessage) => Promise<SendResult>;
};

// A CR or LF in a header would end it and start another (header injection): refused outright,
// whatever the composer would have encoded.
const LINE_BREAK = /[\r\n]/;

// The address as 106 accepts one: ASCII only, a local part and a domain with a dot. Ronne doesn't
// depend on SMTPUTF8.
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** Whether a value can be an email address here: ASCII, one `@`, a domain with a dot, 254 at most. */
export const isMailAddress = (value: string): boolean =>
  value.length <= 254 && !LINE_BREAK.test(value) && ADDRESS.test(value);

/** Whether a header value (a name, a subject) is safe to send: no line break in it. */
export const isHeaderSafe = (value: string): boolean => !LINE_BREAK.test(value);

/** The reason a message can't be sent as it is, or null when it can. */
export const messageProblem = (message: MailMessage): string | null => {
  for (const [field, value] of [
    ["to", message.to],
    ["from", message.from.address],
    ["replyTo", message.replyTo],
  ] as const)
    if (!isMailAddress(value)) return `${field} isn't an email address`;
  if (message.from.name !== undefined && !isHeaderSafe(message.from.name))
    return "the sender's name has a line break";
  if (!isHeaderSafe(message.subject)) return "the subject has a line break";
  return null;
};
