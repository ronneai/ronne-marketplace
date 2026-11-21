import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";
import type { Limit, RateLimitStore } from "../../../rate-limit/rate-limiter";

/**
 * One-time codes sent by email (190; 194's forgot password and 197's email change use them too).
 * A code is 6 random digits. Only an HMAC of it is stored, under a key HKDF-SHA256 derives from
 * AUTH_SECRET for this purpose, so a copy of the database can't be searched offline for the code
 * (a million codes would fall to a plain hash at once). It's bound to its purpose and subject, so a
 * code for one sign-up never works for another.
 */
export const EMAIL_CODE_PURPOSES = ["sign_up", "password_reset", "email_change"] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

/** Wrong tries that end a code. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Seconds before another code can be sent for the same purpose and subject. */
export const EMAIL_CODE_RESEND_SECONDS = 60;
/** Codes for one purpose that may go to one address in an hour. */
export const EMAIL_CODES_PER_HOUR = 3;
/** The code lifetime root sets (5 to 60 minutes, 15 by default), shared by every purpose. */
export const EMAIL_CODE_MINUTES = { min: 5, max: 60, default: 15 } as const;

const HOUR_MS = 60 * 60_000;
const CODE = /^\d{6}$/;

/** A new code: 6 digits, uniformly from 000000 to 999999. */
export const newEmailCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** A lifetime in minutes as root set it, held between 5 and 60 (15 when it isn't a number). */
export const emailCodeMinutes = (value: unknown): number => {
  const minutes = typeof value === "string" ? Number(value) : value;
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) return EMAIL_CODE_MINUTES.default;
  return Math.min(EMAIL_CODE_MINUTES.max, Math.max(EMAIL_CODE_MINUTES.min, minutes));
};

const keys = new Map<string, Buffer>();
const keyOf = (authSecret: string): Buffer => {
  let key = keys.get(authSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), "email-code", 32));
    if (keys.size >= 8) keys.clear();
    keys.set(authSecret, key);
  }
  return key;
};
const hmac = (authSecret: string, value: string): string =>
  createHmac("sha256", keyOf(authSecret)).update(value, "utf8").digest("hex");

/** The code as stored: bound to its purpose and subject. */
export const codeHmac = (
  authSecret: string,
  purpose: EmailCodePurpose,
  subjectId: string,
  code: string,
): string => hmac(authSecret, `code:${purpose}:${subjectId}:${code}`);

/** The address as stored, for the hourly cap without keeping it: trimmed, lowercased. */
export const emailHmac = (authSecret: string, email: string): string =>
  hmac(authSecret, `email:${email.trim().toLowerCase()}`);

/** A code as a person typed it: spaces and dashes dropped; null unless it's 6 digits. */
export const typedCode = (typed: string): string | null => {
  const code = typed.replace(/[\s-]/g, "");
  return CODE.test(code) ? code : null;
};

/** A stored code, as `checkEmailCode` reads it. */
export type StoredEmailCode = {
  purpose: EmailCodePurpose;
  subjectId: string;
  codeHmac: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type EmailCodeCheck =
  | { result: "ok" }
  | { result: "wrong"; attemptsLeft: number }
  | { result: "expired" | "used" | "spent" };

/**
 * What a typed code does to a stored one, checked in this order: used once already, out of tries,
 * expired, then the code itself, compared in constant time. A wrong code spends a try; the fifth
 * ends it. A malformed code is a wrong one.
 */
export const checkEmailCode = (
  authSecret: string,
  stored: StoredEmailCode,
  typed: string,
  now: Date,
): EmailCodeCheck => {
  if (stored.consumedAt) return { result: "used" };
  if (stored.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { result: "spent" };
  if (stored.expiresAt.getTime() <= now.getTime()) return { result: "expired" };
  const code = typedCode(typed);
  const expected = Buffer.from(stored.codeHmac, "hex");
  const given = Buffer.from(
    codeHmac(authSecret, stored.purpose, stored.subjectId, code ?? "------"),
    "hex",
  );
  const same = expected.length === given.length && timingSafeEqual(expected, given);
  if (code && same) return { result: "ok" };
  return { result: "wrong", attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - stored.attempts - 1 };
};

export type EmailCodeSend =
  | { ok: true }
  | { ok: false; reason: "wait"; seconds: number }
  | { ok: false; reason: "hourly" };

/**
 * Whether a code may be sent now: 60 seconds after the last one for this purpose and subject, and
 * at most 3 to this address for this purpose in the past hour (whatever became of them).
 */
export const emailCodeSendable = (
  input: { lastForSubject: Date | null; forAddressLastHour: readonly Date[] },
  now: Date,
): EmailCodeSend => {
  if (input.lastForSubject) {
    const waited = now.getTime() - input.lastForSubject.getTime();
    const wait = EMAIL_CODE_RESEND_SECONDS * 1000 - waited;
    if (wait > 0) return { ok: false, reason: "wait", seconds: Math.ceil(wait / 1000) };
  }
  const since = now.getTime() - HOUR_MS;
  const recent = input.forAddressLastHour.filter((at) => at.getTime() > since);
  if (recent.length >= EMAIL_CODES_PER_HOUR) return { ok: false, reason: "hourly" };
  return { ok: true };
};

/** The two send limits as 109's limiter counts them, shared by every replica. */
export const EMAIL_CODE_RESEND_LIMIT: Limit = {
  name: "email-code-resend",
  max: 1,
  windowMs: EMAIL_CODE_RESEND_SECONDS * 1000,
};
export const EMAIL_CODE_HOURLY_LIMIT: Limit = {
  name: "email-code-hourly",
  max: EMAIL_CODES_PER_HOUR,
  windowMs: HOUR_MS,
};

/**
 * Counts a send before the transaction that issues the code and queues its email: one a minute
 * for the purpose and subject, and 3 an hour for the purpose and address, in 109's limiter, which
 * counts both at once under row locks, all or nothing, so sends racing on several replicas can't
 * pass either window. Its windows are fixed: the hour starts at a window's first send. `issue`
 * then checks the stored codes again, to the second, which holds sends one after another to 3 in
 * any 60 minutes; sends racing just as a window opens can reach 5 in 60 minutes, never more. A
 * code leaves the hour exactly 60 minutes after it was sent (a span that includes its last moment
 * and not its first). A send refused here
 * counts against neither; one reserved whose transaction then rolls back still counts, which errs
 * towards fewer emails.
 */
export const reserveEmailCodeSend = async (
  store: RateLimitStore,
  authSecret: string,
  input: { purpose: EmailCodePurpose; subjectId: string; email: string },
  now: Date,
): Promise<EmailCodeSend> => {
  const decision = await store.consume(
    [
      { limit: EMAIL_CODE_RESEND_LIMIT, key: `${input.purpose}:${input.subjectId}` },
      {
        limit: EMAIL_CODE_HOURLY_LIMIT,
        key: `${input.purpose}:${emailHmac(authSecret, input.email)}`,
      },
    ],
    now.getTime(),
  );
  if (decision.allowed) return { ok: true };
  // Waiting a minute or less is the resend's wait; longer is the hour's.
  return decision.retryAfterSeconds <= EMAIL_CODE_RESEND_SECONDS
    ? { ok: false, reason: "wait", seconds: decision.retryAfterSeconds }
    : { ok: false, reason: "hourly" };
};
