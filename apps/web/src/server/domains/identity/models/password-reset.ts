import { createHash, randomBytes } from "node:crypto";
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

/** A reset flow's step, as `password_reset_flows.step` keeps it. */
export const RESET_STEPS = ["code", "two_factor", "new_password"] as const;
export type ResetStep = (typeof RESET_STEPS)[number];

/**
 * A new flow token: 32 random bytes for the browser's cookie, and the SHA-256 the row keeps, so a
 * database read can't continue a flow.
 */
export const newResetToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: resetTokenHash(token) };
};

/** The SHA-256 a flow row keeps of its token (hex). */
export const resetTokenHash = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

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
