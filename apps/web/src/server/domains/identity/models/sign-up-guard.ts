import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import type { Limit } from "../../../rate-limit/rate-limiter";
import { DISPOSABLE_DOMAINS } from "../lists/disposable-domains";

/**
 * Self-registration's bot protection (190), with Node.js's own crypto only: the throwaway domains,
 * a signed fill-time stamp, a honeypot, the limits, and an invisible proof of work on Altcha's
 * design. No third party sees a visitor.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const keys = new Map<string, Buffer>();
const keyFor = (authSecret: string, info: string): Buffer => {
  const id = `${info}\0${authSecret}`;
  let key = keys.get(id);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), info, 32));
    if (keys.size >= 16) keys.clear();
    keys.set(id, key);
  }
  return key;
};
const sign = (authSecret: string, info: string, value: string): string =>
  createHmac("sha256", keyFor(authSecret, info)).update(value, "utf8").digest("hex");
// Only a canonical SHA-256 in hex: Node.js's hex decoder drops an odd last digit and stops at the
// first character that isn't hex, so `<sig>0`, `<sig>zz` or an upper-cased copy would decode to the
// same bytes and pass.
const HEX64 = /^[0-9a-f]{64}$/;
const sameHex = (given: string, expected: string): boolean =>
  HEX64.test(given) &&
  HEX64.test(expected) &&
  timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));

// ---- Throwaway domains -------------------------------------------------------------------------

const THROWAWAY = new Set(DISPOSABLE_DOMAINS.split("\n").filter((line) => line !== ""));

/**
 * A domain as mail delivery reads it: trimmed, through IDNA (UTS #46: full-width letters and the
 * ideographic full stop map to their ASCII, a non-ASCII name to its punycode), lower-cased, without
 * the trailing dots that still reach the same server. "" when it isn't a domain at all, or is
 * longer than a domain can be (253 characters), so a crafted name costs nothing to refuse.
 */
export const deliveryDomain = (domain: string): string => {
  // Input past 1,024 characters is refused unread; after IDNA, anything past 253 (the most a
  // domain can have) is refused too.
  if (domain.length > 1024) return "";
  const ascii = domainToASCII(domain.trim()).toLowerCase().replace(/\.+$/, "");
  return ascii.length > 253 || !ascii.split(".").every(readablePunycode) ? "" : ascii;
};

/**
 * Whether an `xn--` label is punycode that decodes and encodes back to itself. Node.js reads a bad
 * one differently by version (24.0 refuses `xn--acme-`, 22.14 and 26 keep it), so it's checked
 * here, the same on every version; mail couldn't reach such a domain anyway (191).
 */
const readablePunycode = (label: string): boolean => {
  if (!label.startsWith("xn--")) return true;
  const unicode = domainToUnicode(label);
  return unicode !== "" && unicode !== label && domainToASCII(unicode) === label;
};

/** Whether a domain, or a domain it's under, is on the bundled throwaway list. */
export const isThrowawayDomain = (domain: string): boolean => {
  const labels = deliveryDomain(domain).split(".");
  // `x.mailinator.com` is as throwaway as `mailinator.com`.
  for (let i = 0; i < labels.length - 1; i++)
    if (THROWAWAY.has(labels.slice(i).join("."))) return true;
  return false;
};

/**
 * Whether sign-up takes an address's domain (190): with a list, the domain is one of them,
 * compared exactly (`example.com` doesn't cover `eu.example.com`, and a listed `*` or `any` is just
 * a domain of that name); with any domain, it isn't throwaway when root blocks those. An empty
 * list lets no domain in. 191's block list applies on top.
 */
export const signUpDomainAllowed = (
  policy: { domains: "any" | readonly string[]; blockThrowaway: boolean },
  email: string,
): boolean => {
  const address = email.trim();
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const domain = deliveryDomain(address.slice(at + 1));
  if (domain === "") return false;
  if (policy.domains === "any") return !(policy.blockThrowaway && isThrowawayDomain(domain));
  return policy.domains.some((listed) => deliveryDomain(listed) === domain);
};

// ---- The fill-time stamp and the honeypot ------------------------------------------------------

/** The least time a person takes to fill the form. */
export const MIN_FILL_MS = 3000;
/** A form older than this is stale: load it again. */
export const MAX_FILL_MS = HOUR;
const STAMP_INFO = "sign-up-form-stamp";

/** The stamp the form carries: when it was drawn, signed, so a bot can't backdate it. */
export const formStamp = (authSecret: string, now: Date): string => {
  const at = String(now.getTime());
  return `${at}.${sign(authSecret, STAMP_INFO, at)}`;
};

export type FormCheck = "ok" | "bot" | "stale";

/**
 * Whether a posted form looks like a person's: the honeypot left empty, and the stamp signed by
 * this server, at least 3 seconds and at most an hour old. A bot gets `bot`, which the page answers
 * with what looks like success; an old form gets `stale`.
 */
export const checkForm = (
  authSecret: string,
  input: { stamp: unknown; honeypot: unknown },
  now: Date,
): FormCheck => {
  if (typeof input.honeypot === "string" && input.honeypot !== "") return "bot";
  if (input.honeypot !== undefined && input.honeypot !== null && typeof input.honeypot !== "string")
    return "bot";
  if (typeof input.stamp !== "string") return "bot";
  const [at, signature, ...rest] = input.stamp.split(".");
  if (rest.length > 0 || !at || !signature || !/^\d{1,16}$/.test(at)) return "bot";
  if (!sameHex(signature, sign(authSecret, STAMP_INFO, at))) return "bot";
  const age = now.getTime() - Number(at);
  if (age < MIN_FILL_MS) return "bot";
  if (age > MAX_FILL_MS) return "stale";
  return "ok";
};

// ---- Limits (109's database-backed limiter) ----------------------------------------------------

/** Per client IP, only with TRUST_PROXY=true: 10 sign-ups an hour. */
export const SIGN_UP_IP_LIMIT: Limit = { name: "sign-up-ip", max: 10, windowMs: HOUR };
/** Per client IP: 20 code tries an hour. */
export const SIGN_UP_CODE_IP_LIMIT: Limit = { name: "sign-up-code-ip", max: 20, windowMs: HOUR };
/** Per address (its trimmed, lower-cased form): 10 sign-up requests an hour. */
export const SIGN_UP_ADDRESS_LIMIT: Limit = { name: "sign-up-address", max: 10, windowMs: HOUR };

// ---- The proof of work -------------------------------------------------------------------------

/** How long a challenge can be answered. */
export const CHALLENGE_MS = 10 * MINUTE;
/**
 * The largest secret number: a browser tries half as many SHA-256 hashes on average. The worst
 * case, every number tried, took 0.18 seconds in the end-to-end Chromium (190,
 * `e2e/sign-up-challenge.e2e.ts`, which fails past 1.5); a phone is several times slower.
 */
export const CHALLENGE_MAX_NUMBER = 50_000;
const CHALLENGE_INFO = "sign-up-challenge";

/** What the browser gets: find `number` with SHA-256(salt + number) = challenge. */
export type Challenge = {
  algorithm: "SHA-256";
  salt: string;
  challenge: string;
  maxNumber: number;
  /** When it stops being accepted, in milliseconds since the epoch. */
  expires: number;
  /** The server's HMAC over the rest, so nothing in it can be changed. */
  signature: string;
};

const challengeBody = (c: Omit<Challenge, "signature">) =>
  `${c.algorithm}:${c.salt}:${c.challenge}:${c.maxNumber}:${c.expires}`;

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** A new challenge: a random salt and a secret number up to the maximum. */
export const issueChallenge = (
  authSecret: string,
  now: Date,
  maxNumber = CHALLENGE_MAX_NUMBER,
): Challenge => {
  const salt = randomBytes(12).toString("hex");
  const number = randomInt(0, maxNumber + 1);
  const unsigned = {
    algorithm: "SHA-256" as const,
    salt,
    challenge: sha256(`${salt}${number}`),
    maxNumber,
    expires: now.getTime() + CHALLENGE_MS,
  };
  return { ...unsigned, signature: sign(authSecret, CHALLENGE_INFO, challengeBody(unsigned)) };
};

/** A challenge and the number a browser found, as the form posts them. */
export type ChallengeAnswer = { challenge: Challenge; number: number };

export type ChallengeCheck =
  | { result: "ok"; challengeHmac: string; expiresAt: Date }
  | { result: "invalid" | "expired" | "wrong" };

/** The answer as the form posts it (JSON), or null when it isn't one. */
export const parseChallengeAnswer = (value: unknown): ChallengeAnswer | null => {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ChallengeAnswer> & {
      challenge?: Partial<Challenge>;
    };
    const c = parsed.challenge;
    // Exactly the fields Ronne sends, nothing more.
    const fields = (o: object) => Object.keys(o).sort().join(",");
    if (
      !c ||
      typeof parsed !== "object" ||
      fields(parsed) !== "challenge,number" ||
      typeof c !== "object" ||
      fields(c) !== "algorithm,challenge,expires,maxNumber,salt,signature" ||
      c.algorithm !== "SHA-256" ||
      typeof c.salt !== "string" ||
      typeof c.challenge !== "string" ||
      typeof c.maxNumber !== "number" ||
      typeof c.expires !== "number" ||
      typeof c.signature !== "string" ||
      typeof parsed.number !== "number" ||
      !Number.isSafeInteger(parsed.number)
    )
      return null;
    return { challenge: c as Challenge, number: parsed.number };
  } catch {
    return null;
  }
};

/**
 * Checks an answer: signed by this server, not expired, and the number right. `challengeHmac` is
 * what `challenges_used` keeps, so the caller refuses an answer used before (a replay).
 */
export const checkChallengeAnswer = (
  authSecret: string,
  answer: ChallengeAnswer,
  now: Date,
): ChallengeCheck => {
  const { challenge: c, number } = answer;
  const { signature, ...unsigned } = c;
  if (!sameHex(signature, sign(authSecret, CHALLENGE_INFO, challengeBody(unsigned))))
    return { result: "invalid" };
  if (c.expires <= now.getTime()) return { result: "expired" };
  if (number < 0 || number > c.maxNumber) return { result: "wrong" };
  if (!sameHex(sha256(`${c.salt}${number}`), c.challenge)) return { result: "wrong" };
  return {
    result: "ok",
    challengeHmac: sign(authSecret, CHALLENGE_INFO, `used:${c.challenge}`),
    expiresAt: new Date(c.expires),
  };
};

// ---- The code page's cookie --------------------------------------------------------------------

/** The cookie that ties the code page to the browser that signed up (190, Decision 10). */
export const SIGN_UP_COOKIE = "ronne_sign_up";
const COOKIE_INFO = "sign-up-cookie";

/** The cookie's value: the pending sign-up's id, signed so no other id can be put there. */
export const signUpCookieValue = (authSecret: string, pendingId: string): string =>
  `${pendingId}.${sign(authSecret, COOKIE_INFO, pendingId)}`;

/** The pending sign-up's id a cookie holds, or null when it isn't one this server signed. */
export const signUpIdFromCookie = (
  authSecret: string,
  value: string | undefined,
): string | null => {
  if (!value || value.length > 200) return null;
  const [id, signature, ...rest] = value.split(".");
  if (rest.length > 0 || !id || !signature || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null;
  return sameHex(signature, sign(authSecret, COOKIE_INFO, id)) ? id : null;
};

/**
 * Root's audit hears of sign-ups that sent nothing (a bot, a failed challenge, a domain that isn't
 * allowed, a limit) at most this often, across the instance: each costs a forged post next to
 * nothing, and without a client IP (TRUST_PROXY off) nothing else bounds them. Every code sent,
 * and every existing address told, is recorded.
 */
export const SIGN_UP_BOT_AUDIT_LIMIT: Limit = {
  name: "sign-up-bot-audit",
  max: 100,
  windowMs: HOUR,
};

/** A name as sign-up takes it: no control, line-separator or bidirectional characters. */
export const plainName = (name: string): boolean =>
  ![...name].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (
      code < 0x20 ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });
