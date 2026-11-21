import {
  consumeAll,
  createRateLimiter,
  type RateLimiter,
  type RateLimitStore,
  releaseAll,
} from "../../../rate-limit/rate-limiter";
import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyDeviceGrantRepository } from "../repositories/kysely-device-grant-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/device-grants";
import { getCurrentUser } from "./session";
import { tokenDeps } from "./token-deps";

export type { DeviceExchangeResult, StartResult } from "../services/device-grants";

/**
 * Entry points for `rmk login --web` (feature 107): the two API routes here, the `/device` page's
 * in task 4. Thin: they find who's asking and wire the dependencies. `app` defaults to the server.
 */
export const deviceDeps = ({ db, dialect }: AppAuth): service.DeviceGrantDeps => ({
  grants: kyselyDeviceGrantRepository(db, dialect),
  identity: kyselyIdentityRepository(db, dialect),
  tokens: tokenDeps({ db, dialect }),
});

// Asking for a code writes a row and needs no account, so it's limited: 10 a minute per client IP,
// and when the address isn't known (no trusted proxy) one bucket for the instance, 60 a minute.
// Polling is cheap (a hash look-up), but limited too: 60 a minute per IP, 600 for the instance.
// All counted in the instance's database (109), so every replica shares them.
export type DeviceLimiters = {
  start: RateLimiter;
  startShared: RateLimiter;
  poll: RateLimiter;
  pollShared: RateLimiter;
};

export const createDeviceLimiters = (
  store: RateLimitStore,
  now?: () => number,
): DeviceLimiters => ({
  start: createRateLimiter({ store, name: "device-start", max: 10, now }),
  startShared: createRateLimiter({ store, name: "device-start-shared", max: 60, now }),
  poll: createRateLimiter({ store, name: "device-poll", max: 60, now }),
  pollShared: createRateLimiter({ store, name: "device-poll-shared", max: 600, now }),
});

/** Whether a start or a poll may go on: per client IP, or the shared bucket without one. */
const limit = (stage: "start" | "poll", ip: string | null, limiters: DeviceLimiters) => {
  return ip
    ? limiters[stage].consume([`device-${stage}:ip:${ip}`])
    : limiters[stage === "start" ? "startShared" : "pollShared"].consume([
        `device-${stage}:unknown`,
      ]);
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
  const decision = await limit(
    "start",
    ip,
    options.limiters ?? createDeviceLimiters(app.rateLimits),
  );
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
  const decision = await limit(
    "poll",
    ip,
    options.limiters ?? createDeviceLimiters(app.rateLimits),
  );
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

// Codes typed on `/device`: every refused entry counts, 5 a minute per client address (when it can
// be trusted) and 10 an hour per person, then the page says to wait. Kept apart from the API's,
// and counted in the instance's database too (109).
export type DevicePageLimiters = { ip: RateLimiter; person: RateLimiter };

export const createDevicePageLimiters = (
  store: RateLimitStore,
  now?: () => number,
): DevicePageLimiters => ({
  ip: createRateLimiter({ store, name: "device-page-ip", max: 5, windowMs: 60_000, now }),
  person: createRateLimiter({
    store,
    name: "device-page-person",
    max: 10,
    windowMs: 60 * 60_000,
    now,
  }),
});

export type DevicePageOptions = { limiters?: DevicePageLimiters; now?: () => Date };

export type DevicePageResult<T> = T | Limited;

/**
 * Runs one entry of a code on the page: refused while either limit is used up. Each entry is
 * counted before the work starts (the check and the count happen together, so a burst of requests
 * can't all pass the check), and taken back when the code was right. A refused code counts, wrong,
 * used, expired or malformed alike; a disabled account doesn't. Exported for its tests.
 */
export const limitedEntry = async <T extends { ok: boolean; error?: string }>(
  actor: service.DeviceActor,
  app: AppAuth,
  options: DevicePageOptions,
  work: () => Promise<T>,
): Promise<DevicePageResult<T>> => {
  const limiters = options.limiters ?? createDevicePageLimiters(app.rateLimits);
  const buckets: [RateLimiter, string[]][] = [
    [limiters.person, [`device-page:user:${actor.user?.id ?? "none"}`]],
  ];
  if (actor.ip) buckets.push([limiters.ip, [`device-page:ip:${actor.ip}`]]);
  // Both limits counted together, or neither (109).
  const decision = await consumeAll(buckets);
  if (!decision.allowed)
    return { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await releaseAll(buckets);
    throw error;
  }
  if (result.ok || result.error === "user_disabled") await releaseAll(buckets);
  return result;
};

const pageActor = async (headers: Headers, app: AppAuth): Promise<service.DeviceActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** `/device`: what asked for a typed code, for the signed-in person to confirm. */
export const describeMyDeviceCode = async (
  headers: Headers,
  typed: string,
  app: AppAuth = getAppAuth(),
  options: DevicePageOptions = {},
) => {
  const actor = await pageActor(headers, app);
  return limitedEntry(actor, app, options, () =>
    service.describeDeviceGrant({ ...deviceDeps(app), now: options.now }, actor, typed),
  );
};

/** `/device`: Approve or Deny, by the signed-in person. */
export const decideMyDeviceCode = async (
  headers: Headers,
  typed: string,
  decision: "approve" | "deny",
  app: AppAuth = getAppAuth(),
  options: DevicePageOptions = {},
) => {
  const actor = await pageActor(headers, app);
  const deps = { ...deviceDeps(app), now: options.now };
  return limitedEntry(actor, app, options, () =>
    decision === "approve"
      ? service.approveDeviceGrant(deps, actor, typed)
      : service.denyDeviceGrant(deps, actor, typed),
  );
};
