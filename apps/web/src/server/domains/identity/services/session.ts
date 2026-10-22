import { logger } from "../../../log";
import type { AuditMetadata } from "../../audit/models/audit-event";
import { InvalidEmailError, InvalidPasswordError } from "../exceptions/errors";
import { type LoginRateLimiter, loginRateLimitKeys } from "../models/login-rate-limiter";
import { PASSWORD_MAX_LENGTH, validatePassword } from "../models/password";
import { requirePermission } from "../models/permissions";
import { type CurrentUser, normalizeEmail } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { SessionStore } from "../repositories/session-store";

export type SessionDeps = {
  sessions: SessionStore;
  repo: IdentityRepository;
  limiter: LoginRateLimiter;
  /** Who may sign in with a password now (106); everyone when left out. */
  passwordPolicy?: () => Promise<"everyone" | "root_only">;
  now?: () => Date;
};

/** Who's asking, for the audit log: the request headers and the client IP, when it can be trusted. */
export type RequestContext = { headers: Headers; ip: string | null };

const now = (deps: SessionDeps) => (deps.now ?? (() => new Date()))();

/**
 * The signed-in user, or null. The user is read again on every call, so disabling someone (or
 * changing their role) takes effect on their next request, even with a valid session cookie.
 */
export const currentUser = async (
  deps: SessionDeps,
  headers: Headers,
): Promise<CurrentUser | null> => {
  const session = await deps.sessions.currentSession(headers);
  return session ? deps.repo.findActiveUser(session.userId) : null;
};

/**
 * Whether the request's signed-in person must replace their password first (128). Read on every
 * page and server action, so it reads only the session and one column.
 */
export const passwordChangeRequired = async (
  deps: SessionDeps,
  headers: Headers,
): Promise<boolean> => {
  const session = await deps.sessions.currentSession(headers);
  return session ? deps.repo.passwordChangeRequired(session.userId) : false;
};

export type SignInInput = { email: string; password: string; rememberMe: boolean };

export type SignInResult =
  /**
   * Signed in; or, with `twoFactor`, the password was right and the second step (105) comes next:
   * no session yet, and nothing audited until it's done.
   */
  | { ok: true; headers: Headers; twoFactor?: true }
  | { ok: false; error: "invalid_credentials" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

const log = logger.child({ domain: "identity" });

/** An address no account can have (`.invalid` is reserved, RFC 2606), for 106's timing rule. */
const REFUSED_ADDRESS = "refused@sign-in.invalid";

/** The email as typed, lowercased and cut to the column's length, for a failed attempt's event. */
const typedEmail = (email: string) => email.trim().toLowerCase().slice(0, 255);

/**
 * Signs in with email and password. A wrong password, an unknown email and a disabled user get the
 * same answer. Attempts are limited per email, and per client IP when it can be trusted.
 *
 * Every attempt is audited (007). Better Auth writes the session in its own transaction, so the
 * event is recorded right after it, not in the same transaction.
 */
export const signIn = async (
  deps: SessionDeps,
  context: RequestContext,
  input: SignInInput,
): Promise<SignInResult> => {
  const failed = async (reason: "invalid" | "disabled" | "rate_limited" | "password_disabled") => {
    // The log has the reason, never the email: that's in the audit log, under 102's retention.
    if (reason === "rate_limited") log.event("auth.rate_limited", { limit: "sign_in" });
    else log.event("auth.sign_in_failed", { reason });
    const metadata: AuditMetadata = { email: typedEmail(input.email), reason };
    await deps.repo.recordAudit(
      {
        actorId: null,
        action: "auth.sign_in_failed",
        target: { type: "none" },
        metadata,
        ipAddress: context.ip,
      },
      now(deps),
    );
  };

  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch (error) {
    if (!(error instanceof InvalidEmailError)) throw error;
    await failed("invalid");
    return { ok: false, error: "invalid_credentials" };
  }
  // Junk is refused before any hashing: no expensive work for a 10 MB password.
  if (input.password.length === 0 || [...input.password].length > PASSWORD_MAX_LENGTH) {
    await failed("invalid");
    return { ok: false, error: "invalid_credentials" };
  }

  const decision = deps.limiter.consume(loginRateLimitKeys(email, context.ip));
  if (!decision.allowed) {
    await failed("rate_limited");
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  }

  // Root only (106): anyone else gets the same answer as a wrong password, even with the right one.
  if ((await deps.passwordPolicy?.()) === "root_only") {
    const credential = await deps.repo.findCredentialByEmail(email);
    if (credential?.user.role !== "root") {
      // Better Auth's own sign-in, for an address no account can have: the same lookups and hash
      // as root's attempt, so the answer's time doesn't tell which address is root's. It can't
      // open a session.
      const reserved = await deps.sessions.signIn(context.headers, {
        email: REFUSED_ADDRESS,
        password: input.password,
        rememberMe: false,
      });
      // No account may have a `.invalid` address, but MySQL and MariaDB compare emails without
      // accents, so a look-alike (`…inválid`) or one put in by hand can be found: its session ends
      // at once, so it's never usable.
      if (reserved && "session" in reserved) {
        await deps.repo.deleteSessions(reserved.session.userId);
        log.error("A session was opened for the reserved address; it was ended", {});
      }
      await failed(
        !credential ? "invalid" : credential.disabledAt ? "disabled" : "password_disabled",
      );
      return { ok: false, error: "invalid_credentials" };
    }
  }

  const result = await deps.sessions.signIn(context.headers, {
    email,
    password: input.password,
    rememberMe: input.rememberMe,
  });
  if (!result) {
    // The reason is only for the log; the person signing in sees the same message either way.
    await failed(
      (await deps.repo.userStatusByEmail(email)) === "disabled" ? "disabled" : "invalid",
    );
    return { ok: false, error: "invalid_credentials" };
  }
  if ("challenge" in result) return { ok: true, headers: result.headers, twoFactor: true };
  await deps.repo.recordAudit(
    {
      actorId: result.session.userId,
      action: "auth.signed_in",
      target: { type: "session", id: result.session.sessionId },
      metadata: { remember: input.rememberMe },
      ipAddress: context.ip,
    },
    now(deps),
  );
  log.event("auth.signed_in", { userId: result.session.userId });
  return { ok: true, headers: result.headers };
};

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "not_signed_in" | "wrong_password" | "too_short" | "too_long" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * Changes the signed-in user's password. It needs the current one, applies the 003 length rules,
 * keeps this session and ends the others. Wrong current passwords count against the same limit as
 * sign-in, so a stolen session can't be used to guess the password.
 */
export const changePassword = async (
  deps: SessionDeps,
  context: RequestContext,
  input: { current: string; next: string },
): Promise<ChangePasswordResult> => {
  const user = await currentUser(deps, context.headers);
  if (!user) return { ok: false, error: "not_signed_in" };
  requirePermission(user, "account.manage_own");
  try {
    validatePassword(input.next);
  } catch (error) {
    if (error instanceof InvalidPasswordError) return { ok: false, error: error.reason };
    throw error;
  }
  if (input.current.length === 0 || [...input.current].length > PASSWORD_MAX_LENGTH)
    return { ok: false, error: "wrong_password" };

  const decision = deps.limiter.consume(loginRateLimitKeys(user.email, null));
  if (!decision.allowed)
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };

  const before = await deps.repo.countSessions(user.id);
  const changed = await deps.sessions.changePassword(context.headers, input.current, input.next);
  if (!changed) return { ok: false, error: "wrong_password" };
  await deps.repo.recordAudit(
    {
      actorId: user.id,
      action: "user.password_changed",
      target: { type: "user", id: user.id },
      // Every session but this one.
      metadata: { otherSessionsEnded: Math.max(0, before - 1) },
      ipAddress: context.ip,
    },
    now(deps),
  );
  return { ok: true };
};

/** Ends the request's session, and records it. Without a session, there's nothing to do. */
export const signOut = async (deps: SessionDeps, context: RequestContext): Promise<void> => {
  const session = await deps.sessions.currentSession(context.headers);
  await deps.sessions.signOut(context.headers);
  if (!session) return;
  await deps.repo.recordAudit(
    {
      actorId: session.userId,
      action: "auth.signed_out",
      target: { type: "session", id: session.sessionId },
      ipAddress: context.ip,
    },
    now(deps),
  );
};
