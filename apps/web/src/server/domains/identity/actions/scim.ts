import { logger } from "../../../log";
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimitStore,
} from "../../../rate-limit/rate-limiter";
import { recordAudit } from "../../audit/actions/audit";
import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyScimTokenRepository } from "../repositories/kysely-scim-token-repository";
import { checkScimToken, type ScimTokenRefusal } from "../services/scim-tokens";

const log = logger.child({ domain: "identity" });

/**
 * The SCIM guard (feature 108): who an identity provider's request is, from its bearer token only.
 * Cookies are never read. Every refusal is answered the same way (401), whatever the reason, which
 * the audit log and the logs keep.
 */
/** Who is calling: the provider, its token, and the client address when it can be trusted. */
export type ScimCaller = { providerId: string; tokenId: string; ip: string | null };

export type ScimGuardResult =
  | { ok: true; caller: ScimCaller }
  | { ok: false; status: 401 }
  | { ok: false; status: 429; retryAfterSeconds: number };

// A working token: 600 requests a minute (a provider's full sync is bursty). A refused one: 20 a
// minute per client address, or, when the address can't be trusted, 100 for the instance; past
// that, the refusals aren't audited either, so a flood can't fill the audit log. Counted in the
// instance's database (109), so every replica shares them.
export type ScimLimiters = {
  token: RateLimiter;
  refused: RateLimiter;
  refusedShared: RateLimiter;
};

export const createScimLimiters = (store: RateLimitStore, now?: () => number): ScimLimiters => ({
  token: createRateLimiter({ store, name: "scim-token", max: 600, now }),
  refused: createRateLimiter({ store, name: "scim-refused", max: 20, now }),
  refusedShared: createRateLimiter({ store, name: "scim-refused-shared", max: 100, now }),
});

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
  const limiters = options.limiters ?? createScimLimiters(app.rateLimits);
  const now = options.now ?? (() => new Date());
  const ip = clientIp(headers, app.trustProxy);
  const token = bearer(headers);
  const check = token
    ? await checkScimToken({ repo: kyselyScimTokenRepository(app.db, app.dialect), now }, token)
    : ({ ok: false, reason: "missing" } as const);

  if (check.ok) {
    const decision = await limiters.token.consume([`scim-token:${check.tokenId}`]);
    if (!decision.allowed)
      return { ok: false, status: 429, retryAfterSeconds: decision.retryAfterSeconds };
    return { ok: true, caller: { providerId: check.providerId, tokenId: check.tokenId, ip } };
  }

  const decision = ip
    ? await limiters.refused.consume([`scim-refused:ip:${ip}`])
    : await limiters.refusedShared.consume(["scim-refused:unknown"]);
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
