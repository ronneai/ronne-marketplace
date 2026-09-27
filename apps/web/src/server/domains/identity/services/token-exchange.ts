import { TokenNameTakenError } from "../exceptions/errors";
import { MAX_ACTIVE_TOKENS, TOKEN_NAME_MAX_LENGTH } from "../models/access-token";
import { type LoginRateLimiter, loginRateLimitKeys } from "../models/login-rate-limiter";
import { PASSWORD_MAX_LENGTH } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import { normalizeEmail } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";
import { createToken, type NewToken, type TokenDeps } from "./access-tokens";

/**
 * `rmk login` (feature 009): an email and password in exchange for a 90-day token. It checks the
 * password directly, with the same hasher Better Auth uses, so no web session is created. It shares
 * the sign-in limit (006), and every failure gives the same answer.
 */
export type ExchangeDeps = {
  identity: IdentityRepository;
  tokens: TokenDeps;
  hasher: PasswordHasher;
  limiter: LoginRateLimiter;
  now?: () => Date;
};

export type ExchangeResult =
  | { ok: true; token: NewToken }
  | { ok: false; error: "invalid_credentials" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

// Checked against when the email is unknown, so the response takes as long as for a real account.
let dummyHash: Promise<string> | undefined;
const timingDummy = (hasher: PasswordHasher) => {
  dummyHash ??= hasher.hash("a password that no account has");
  return dummyHash;
};

/** `rmk/0.1.0 (laptop)` → `rmk on laptop`; anything else → `rmk`. 022 sends this User-Agent. */
export const tokenNameFromUserAgent = (userAgent: string | null): string => {
  const host = /^rmk\/\S+ \(([^;)]+)/.exec(userAgent ?? "")?.[1]?.trim();
  return host ? `rmk on ${host}`.slice(0, TOKEN_NAME_MAX_LENGTH) : "rmk";
};

/** `rmk on laptop`, then `rmk on laptop (2)` and so on, so logging in again never fails on the name. */
const createWithFreeName = async (
  deps: TokenDeps,
  user: Parameters<typeof createToken>[1]["user"],
  ip: string | null,
  base: string,
): Promise<NewToken> => {
  for (let n = 1; n <= MAX_ACTIVE_TOKENS + 1; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const name = `${base.slice(0, TOKEN_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    try {
      return await createToken(deps, { user, ip }, { name, lifetime: 90, via: "cli" });
    } catch (error) {
      if (!(error instanceof TokenNameTakenError)) throw error;
    }
  }
  // Unreachable: with at most 50 active tokens, one of 51 names is free.
  throw new TokenNameTakenError(base);
};

export const exchangePasswordForToken = async (
  deps: ExchangeDeps,
  input: { email: unknown; password: unknown; name?: unknown },
  context: { ip: string | null; userAgent: string | null },
): Promise<ExchangeResult> => {
  const at = (deps.now ?? (() => new Date()))();
  const typedEmail = typeof input.email === "string" ? input.email : "";
  const failed = async (reason: "invalid" | "disabled" | "rate_limited") => {
    await deps.identity.recordAudit(
      {
        actorId: null,
        action: "auth.sign_in_failed",
        target: { type: "none" },
        metadata: { email: typedEmail.trim().toLowerCase().slice(0, 255), reason, via: "cli" },
        ipAddress: context.ip,
      },
      at,
    );
  };
  const invalid = async (reason: "invalid" | "disabled"): Promise<ExchangeResult> => {
    await failed(reason);
    return { ok: false, error: "invalid_credentials" };
  };

  const password = typeof input.password === "string" ? input.password : "";
  let email: string;
  try {
    email = normalizeEmail(typedEmail);
  } catch {
    return invalid("invalid");
  }
  if (password.length === 0 || [...password].length > PASSWORD_MAX_LENGTH)
    return invalid("invalid");

  const decision = deps.limiter.consume(loginRateLimitKeys(email, context.ip));
  if (!decision.allowed) {
    await failed("rate_limited");
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  }

  const found = await deps.identity.findCredentialByEmail(email);
  const matches = await deps.hasher.verify(
    found?.passwordHash ?? (await timingDummy(deps.hasher)),
    password,
  );
  if (!found?.passwordHash || !matches) return invalid("invalid");
  if (found.disabledAt) return invalid("disabled");

  const requested = typeof input.name === "string" ? input.name.trim() : "";
  const base = requested || tokenNameFromUserAgent(context.userAgent);
  return { ok: true, token: await createWithFreeName(deps.tokens, found.user, context.ip, base) };
};
