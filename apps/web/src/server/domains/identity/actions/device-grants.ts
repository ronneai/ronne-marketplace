import { clientIp } from "../models/client-ip";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyDeviceGrantRepository } from "../repositories/kysely-device-grant-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import * as service from "../services/device-grants";

export type { DeviceExchangeResult, StartResult } from "../services/device-grants";

/**
 * Entry points for `rmk login --web` (feature 107): the two API routes here, the `/device` page's
 * in task 4. Thin: they find who's asking and wire the dependencies. `app` defaults to the server.
 */
export const deviceDeps = ({ db, dialect }: AppAuth): service.DeviceGrantDeps => ({
  grants: kyselyDeviceGrantRepository(db, dialect),
  identity: kyselyIdentityRepository(db, dialect),
  tokens: { repo: kyselyTokenRepository(db, dialect) },
});

// Asking for a code writes a row and needs no account, so it's limited: 10 a minute per client IP,
// and when the address isn't known (no trusted proxy) one bucket for the instance, 60 a minute.
// Polling is cheap (a hash look-up), but limited too: 60 a minute per IP, 600 for the instance.
const shared = globalThis as typeof globalThis & {
  __ronneDeviceLimiters?: DeviceLimiters;
};

export type DeviceLimiters = {
  start: LoginRateLimiter;
  startShared: LoginRateLimiter;
  poll: LoginRateLimiter;
  pollShared: LoginRateLimiter;
};

export const createDeviceLimiters = (now?: () => number): DeviceLimiters => ({
  start: new LoginRateLimiter({ max: 10, now }),
  startShared: new LoginRateLimiter({ max: 60, now }),
  poll: new LoginRateLimiter({ max: 60, now }),
  pollShared: new LoginRateLimiter({ max: 600, now }),
});

const appLimiters = () => {
  shared.__ronneDeviceLimiters ??= createDeviceLimiters();
  return shared.__ronneDeviceLimiters;
};

/** Whether a start or a poll may go on: per client IP, or the shared bucket without one. */
const limit = (stage: "start" | "poll", ip: string | null, limiters: DeviceLimiters) => {
  const decision = ip
    ? limiters[stage].consume([`device-${stage}:ip:${ip}`])
    : limiters[stage === "start" ? "startShared" : "pollShared"].consume([
        `device-${stage}:unknown`,
      ]);
  return decision;
};

export type DeviceOptions = { limiters?: DeviceLimiters; now?: () => Date };

export type Limited = { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/** `POST /api/v1/auth/device/code`. Cookies are never read: the request is anonymous. */
export const startDeviceLogin = async (
  input: { clientId: unknown; name?: unknown },
  headers: Headers,
  app: AppAuth = getAppAuth(),
  options: DeviceOptions = {},
): Promise<service.StartResult | Limited> => {
  const ip = clientIp(headers, app.trustProxy);
  const decision = limit("start", ip, options.limiters ?? appLimiters());
  if (!decision.allowed)
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  return service.startDeviceGrant({ ...deviceDeps(app), now: options.now }, input, {
    ip,
    userAgent: headers.get("user-agent"),
  });
};

/** `POST /api/v1/auth/device/token`. Cookies are never read either. */
export const exchangeDeviceLogin = async (
  input: { grantType: unknown; deviceCode: unknown; clientId: unknown },
  headers: Headers,
  app: AppAuth = getAppAuth(),
  options: DeviceOptions = {},
): Promise<service.DeviceExchangeResult | Limited> => {
  const ip = clientIp(headers, app.trustProxy);
  const decision = limit("poll", ip, options.limiters ?? appLimiters());
  if (!decision.allowed)
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  const deps = { ...deviceDeps(app), now: options.now };
  if (options.now) deps.tokens = { ...deps.tokens, now: options.now };
  return service.exchangeDeviceCode(deps, input, { ip });
};

/** The address people approve codes at: `/device` on the instance's base URL. */
export const verificationUri = async (app: AppAuth = getAppAuth()): Promise<string> => {
  const ctx = await app.auth.$context;
  const base = String(ctx.options.baseURL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/device`;
};
