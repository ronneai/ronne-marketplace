import { InvalidEmailError, InvalidPasswordError } from "../exceptions/errors";
import { type LoginRateLimiter, loginRateLimitKeys } from "../models/login-rate-limiter";
import { PASSWORD_MAX_LENGTH, validatePassword } from "../models/password";
import { type CurrentUser, normalizeEmail } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { SessionStore } from "../repositories/session-store";

export type SessionDeps = {
  sessions: SessionStore;
  repo: IdentityRepository;
  limiter: LoginRateLimiter;
};

/**
 * The signed-in user, or null. The user is read again on every call, so disabling someone (or
 * changing their role) takes effect on their next request, even with a valid session cookie.
 */
export async function currentUser(
  deps: SessionDeps,
  headers: Headers,
): Promise<CurrentUser | null> {
  const userId = await deps.sessions.sessionUserId(headers);
  return userId ? deps.repo.findActiveUser(userId) : null;
}

export type SignInInput = { email: string; password: string; rememberMe: boolean };

export type SignInResult =
  | { ok: true; headers: Headers }
  | { ok: false; error: "invalid_credentials" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * Signs in with email and password. A wrong password, an unknown email and a disabled user get the
 * same answer. Attempts are limited per email, and per client IP when it can be trusted.
 */
export async function signIn(
  deps: SessionDeps,
  headers: Headers,
  input: SignInInput,
  clientIp: string | null,
): Promise<SignInResult> {
  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return { ok: false, error: "invalid_credentials" };
    throw error;
  }
  // Junk is refused before any hashing: no expensive work for a 10 MB password.
  if (input.password.length === 0 || [...input.password].length > PASSWORD_MAX_LENGTH)
    return { ok: false, error: "invalid_credentials" };

  const decision = deps.limiter.consume(loginRateLimitKeys(email, clientIp));
  if (!decision.allowed)
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };

  const responseHeaders = await deps.sessions.signIn(headers, {
    email,
    password: input.password,
    rememberMe: input.rememberMe,
  });
  return responseHeaders
    ? { ok: true, headers: responseHeaders }
    : { ok: false, error: "invalid_credentials" };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "not_signed_in" | "wrong_password" | "too_short" | "too_long" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * Changes the signed-in user's password. It needs the current one, applies the 003 length rules,
 * keeps this session and ends the others. Wrong current passwords count against the same limit as
 * sign-in, so a stolen session can't be used to guess the password.
 */
export async function changePassword(
  deps: SessionDeps,
  headers: Headers,
  input: { current: string; next: string },
): Promise<ChangePasswordResult> {
  const user = await currentUser(deps, headers);
  if (!user) return { ok: false, error: "not_signed_in" };
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

  const changed = await deps.sessions.changePassword(headers, input.current, input.next);
  return changed ? { ok: true } : { ok: false, error: "wrong_password" };
}

export function signOut(deps: SessionDeps, headers: Headers): Promise<void> {
  return deps.sessions.signOut(headers);
}
