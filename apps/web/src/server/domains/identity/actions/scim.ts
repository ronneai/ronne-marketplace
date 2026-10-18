import { logger } from "../../../log";
import { recordAudit } from "../../audit/actions/audit";
import { clientIp } from "../models/client-ip";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyScimTokenRepository } from "../repositories/kysely-scim-token-repository";
import { checkScimToken, type ScimTokenRefusal } from "../services/scim-tokens";

const log = logger.child({ domain: "identity" });

/**
 * The SCIM guard (feature 108): who an identity provider's request is, from its bearer token only.
 * Cookies are never read. Every refusal is answered the same way (401), whatever the reason, which
 * the audit log and the logs keep.
 */
export type ScimCaller = { providerId: string; tokenId: string };

export type ScimGuardResult =
  | { ok: true; caller: ScimCaller }
  | { ok: false; status: 401 }
  | { ok: false; status: 429; retryAfterSeconds: number };

// A working token: 600 requests a minute (a provider's full sync is bursty). A refused one: 20 a
// minute per client address, or, when the address can't be trusted, 100 for the instance; past
// that, the refusals aren't audited either, so a flood can't fill the audit log.
const shared = globalThis as typeof globalThis & { __ronneScimLimiters?: ScimLimiters };

export type ScimLimiters = {
  token: LoginRateLimiter;
  refused: LoginRateLimiter;
  refusedShared: LoginRateLimiter;
};

export const createScimLimiters = (now?: () => number): ScimLimiters => ({
  token: new LoginRateLimiter({ max: 600, now }),
  refused: new LoginRateLimiter({ max: 20, now }),
  refusedShared: new LoginRateLimiter({ max: 100, now }),
});

const appLimiters = () => {
  shared.__ronneScimLimiters ??= createScimLimiters();
  return shared.__ronneScimLimiters;
};

export type ScimOptions = { limiters?: ScimLimiters; now?: () => Date };

/** The token from `Authorization: Bearer <token>`, or null when the header isn't that. */
const bearer = (headers: Headers): string | null => {
  const value = headers.get("authorization");
  if (!value) return null;
  const space = value.indexOf(" ");
  if (space < 0 || value.slice(0, space).toLowerCase() !== "bearer") return null;
  const token = value.slice(space + 1).trim();
  return token.length > 0 ? token : null;
};

export const authenticateScim = async (
  headers: Headers,
  app: AppAuth = getAppAuth(),
  options: ScimOptions = {},
): Promise<ScimGuardResult> => {
  const limiters = options.limiters ?? appLimiters();
  const now = options.now ?? (() => new Date());
  const ip = clientIp(headers, app.trustProxy);
  const token = bearer(headers);
  const check = token
    ? await checkScimToken({ repo: kyselyScimTokenRepository(app.db, app.dialect), now }, token)
    : ({ ok: false, reason: "missing" } as const);

  if (check.ok) {
    const decision = limiters.token.consume([`scim-token:${check.tokenId}`]);
    if (!decision.allowed)
      return { ok: false, status: 429, retryAfterSeconds: decision.retryAfterSeconds };
    return { ok: true, caller: { providerId: check.providerId, tokenId: check.tokenId } };
  }

  const decision = ip
    ? limiters.refused.consume([`scim-refused:ip:${ip}`])
    : limiters.refusedShared.consume(["scim-refused:unknown"]);
  if (!decision.allowed)
    return { ok: false, status: 429, retryAfterSeconds: decision.retryAfterSeconds };
  await refuse(app, check.reason, "providerId" in check ? check.providerId : undefined, ip, now());
  return { ok: false, status: 401 };
};

/** `scim.request_refused`: the reason, and the provider when the token was one of its own. */
const refuse = async (
  app: AppAuth,
  reason: ScimTokenRefusal | "missing",
  providerId: string | undefined,
  ip: string | null,
  at: Date,
) => {
  const metadata: Record<string, string> = providerId
    ? { reason, provider: providerId }
    : { reason };
  await recordAudit(
    app.db,
    app.dialect,
    {
      actorId: null,
      action: "scim.request_refused",
      target: { type: "instance" },
      metadata,
      ipAddress: ip,
    },
    at,
  );
  log.event("scim.request_refused", metadata);
};
