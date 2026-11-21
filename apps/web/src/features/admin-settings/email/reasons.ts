/** The reasons a message didn't go (189), as `admin.settings.email.reasons` names them. */
export const MAIL_REASONS = [
  "connection",
  "timeout",
  "tls",
  "auth",
  "rate_limited",
  "server",
  "rejected",
  "config",
  "credentials",
  "interrupted",
] as const;
export type MailReasonKey = (typeof MAIL_REASONS)[number] | "other";

/** The key for a stored reason; anything unknown is `other`. */
export const reasonKey = (reason: string): MailReasonKey =>
  (MAIL_REASONS as readonly string[]).includes(reason) ? (reason as MailReasonKey) : "other";
