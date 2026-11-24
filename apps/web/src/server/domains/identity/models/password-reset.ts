import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { Limit } from "../../../rate-limit/rate-limiter";
import type { PasswordSignInPolicy } from "../../settings/models/password-sign-in-policy";

/**
 * Forgot password by email (194). A request always ends on the same page with the same words;
 * what is emailed is decided here, on the server, and never shown. An emailed code never signs
 * anyone in: it opens the next step of a reset flow, which only sets a new password.
 */

export const RESET_PURPOSE = "password_reset" as const;

const HOUR = 60 * 60_000;

/** Per client IP, only with TRUST_PROXY=true: 10 reset requests an hour. */
export const RESET_REQUEST_IP_LIMIT: Limit = {
  name: "password-reset-ip",
  max: 10,
  windowMs: HOUR,
};
/** Per client IP: 30 reset code tries an hour (task 4). */
export const RESET_CODE_IP_LIMIT: Limit = {
  name: "password-reset-code-ip",
  max: 30,
  windowMs: HOUR,
};

/** Wrong reset codes for one account in `RESET_PAUSE_MS` that pause reset by email for it. */
export const RESET_PAUSE_AFTER = 20;
export const RESET_PAUSE_MS = 24 * HOUR;
/** How long the new-password page works after the last step was passed. */
export const RESET_GRANT_MS = 10 * 60_000;

/** A reset flow's step, as `password_reset_flows.step` keeps it. */
export const RESET_STEPS = ["code", "two_factor", "new_password"] as const;
export type ResetStep = (typeof RESET_STEPS)[number];

/**
 * A new flow token: 32 random bytes for the browser's cookie, and what the row keeps of it, an
 * HMAC-SHA256 under a key derived from AUTH_SECRET, so a copy of the database can't continue a
 * flow, or even check a guess. Rotating the secret ends the flows still open, as it ends their codes.
 */
export const newResetToken = (authSecret: string): { token: string; hash: string } => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: resetTokenHash(authSecret, token) };
};

const keys = new Map<string, Buffer>();
const keyOf = (authSecret: string): Buffer => {
  let key = keys.get(authSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), "password-reset-flow", 32));
    if (keys.size >= 8) keys.clear();
    keys.set(authSecret, key);
  }
  return key;
};

/** What a flow row keeps of its token: its HMAC-SHA256 (hex). */
export const resetTokenHash = (authSecret: string, token: string): string =>
  createHmac("sha256", keyOf(authSecret)).update(token, "utf8").digest("hex");

/** An account as a reset request reads it: what decides the email, and nothing more. */
export type ResetAccount = {
  id: string;
  /** As stored: on MySQL an address the database calls equal may differ (accents). */
  email: string;
  role: "root" | "user";
  disabled: boolean;
  erased: boolean;
  approvalPending: boolean;
  hasPassword: boolean;
  /** The names of the identity providers the account is linked to (106), root named them. */
  providers: readonly string[];
};

/** What a request emails, decided on the server (SPEC "What is sent"). */
export type ResetEmail = "code" | "root" | "providers" | "none";

/**
 * The SPEC's "What is sent" table, read top to bottom for the address typed:
 * - no account, or one the database only calls equal (MySQL's accent-blind comparison), or an
 *   erased one (its address is a pseudonym): nothing;
 * - a disabled account, or one waiting for root's approval (190): nothing;
 * - a root account: "reset on the server", never a code (Decision 3);
 * - an account with no password, or one *Root only* keeps off passwords: "you sign in with …";
 * - else, an active account that may use a password: the code.
 */
export const resetEmailFor = (
  account: ResetAccount | null,
  email: string,
  passwordPolicy: PasswordSignInPolicy,
): ResetEmail => {
  if (!account || account.email !== email || account.erased) return "none";
  if (account.disabled || account.approvalPending) return "none";
  if (account.role === "root") return "root";
  if (!account.hasPassword || passwordPolicy === "root_only") return "providers";
  return "code";
};

/**
 * Whether reset by email is paused for an account at `now` (194): 20 wrong codes fell within 24
 * hours, and the 20th of them less than 24 hours ago. So the pause lasts a full 24 hours from the
 * 20th, however spread out the 20 were. `times` oldest first.
 */
export const resetPaused = (times: readonly Date[], now: Date): boolean => {
  for (let last = RESET_PAUSE_AFTER - 1; last < times.length; last++) {
    const first = times[last - (RESET_PAUSE_AFTER - 1)] as Date;
    const twentieth = times[last] as Date;
    if (
      twentieth.getTime() - first.getTime() <= RESET_PAUSE_MS &&
      now.getTime() - twentieth.getTime() < RESET_PAUSE_MS
    )
      return true;
  }
  return false;
};
