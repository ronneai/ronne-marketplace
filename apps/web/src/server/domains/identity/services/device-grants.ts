import { logger } from "../../../log";
import { TokenLimitError } from "../exceptions/errors";
import { TOKEN_NAME_MAX_LENGTH } from "../models/access-token";
import {
  DEVICE_GRANT_KEEP_MS,
  DEVICE_GRANT_TTL_SECONDS,
  DEVICE_GRANT_TYPE,
  DEVICE_MAX_WRONG_CODES,
  DEVICE_POLL_INTERVAL_SECONDS,
  DEVICE_SLOW_DOWN_SECONDS,
  type DeviceGrant,
  generateDeviceCode,
  generateUserCode,
  hashDeviceCode,
  isDeviceClientId,
  normalizeUserCode,
} from "../models/device-grant";
import { requirePermission } from "../models/permissions";
import type { CurrentUser } from "../models/user";
import type { DeviceGrantRepository } from "../repositories/device-grant-repository";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { NewToken, TokenDeps } from "./access-tokens";
import { createWithFreeName, tokenNameFromUserAgent } from "./token-exchange";

/**
 * `rmk login --web` (feature 107), the device flow of RFC 8628: `rmk` starts a grant, a signed-in
 * person approves or denies it on `/device`, and `rmk` polls until it can exchange the device code
 * for a 90-day personal access token (009's service). The grant is spent once, before the token is
 * made, and no web session is ever created.
 */
export type DeviceGrantDeps = {
  grants: DeviceGrantRepository;
  identity: Pick<IdentityRepository, "findActiveUser">;
  tokens: TokenDeps;
  now?: () => Date;
};

const now = (deps: DeviceGrantDeps) => (deps.now ?? (() => new Date()))();
const log = logger.child({ domain: "identity" });

export type StartedGrant = {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
};

export type StartResult =
  | { ok: true; grant: StartedGrant }
  | { ok: false; error: "invalid_client" | "invalid_request" };

// A name is shown on the page and in the audit; control characters (a NUL breaks PostgreSQL) aren't.
const CONTROL = /\p{Cc}/u;

// A user code collides with a live one about once in 31⁸ / (live codes); a few draws are plenty.
const MAX_USER_CODE_DRAWS = 5;

// Each start sweeps at most this many unused grants past their expiry, so one request stays short.
const EXPIRY_SWEEP_LIMIT = 50;

/**
 * Marks a grant that ended unused as expired, and audits it once: only the caller whose update
 * changed the row records it.
 */
const expire = async (deps: DeviceGrantDeps, grant: DeviceGrant, at: Date, ip: string | null) => {
  if (!(await deps.grants.transition(grant.id, ["pending", "approved"], "expired"))) return;
  await deps.grants.recordAudit(
    {
      actorId: null,
      action: "auth.device_expired",
      target: { type: "none" },
      metadata: {
        clientId: grant.clientId,
        name: grant.name,
        expiredAt: grant.expiresAt.toISOString(),
      },
      ipAddress: ip,
    },
    at,
  );
};

/** `POST /api/v1/auth/device/code`: anyone may ask; the request's address is kept when trusted. */
export const startDeviceGrant = async (
  deps: DeviceGrantDeps,
  input: { clientId: unknown; name?: unknown },
  context: { ip: string | null; userAgent: string | null },
): Promise<StartResult> => {
  if (typeof input.clientId !== "string") return { ok: false, error: "invalid_request" };
  if (!isDeviceClientId(input.clientId)) return { ok: false, error: "invalid_client" };
  if (input.name !== undefined && input.name !== null && typeof input.name !== "string")
    return { ok: false, error: "invalid_request" };
  const requested = typeof input.name === "string" ? input.name.trim() : "";
  if ([...requested].length > TOKEN_NAME_MAX_LENGTH || CONTROL.test(requested))
    return { ok: false, error: "invalid_request" };
  const name = requested || tokenNameFromUserAgent(context.userAgent);

  const at = now(deps);
  for (const stale of await deps.grants.listUnusedExpired(at, EXPIRY_SWEEP_LIMIT))
    await expire(deps, stale, at, null);
  await deps.grants.pruneExpired(new Date(at.getTime() - DEVICE_GRANT_KEEP_MS));
  const deviceCode = generateDeviceCode();
  const expiresAt = new Date(at.getTime() + DEVICE_GRANT_TTL_SECONDS * 1000);
  for (let draw = 0; draw < MAX_USER_CODE_DRAWS; draw++) {
    const userCode = generateUserCode();
    const id = await deps.grants.insert({
      deviceCodeHash: hashDeviceCode(deviceCode),
      userCode,
      clientId: input.clientId,
      name,
      requesterIp: context.ip,
      intervalSeconds: DEVICE_POLL_INTERVAL_SECONDS,
      createdAt: at,
      expiresAt,
    });
    if (id === null) continue;
    await deps.grants.recordAudit(
      {
        actorId: null,
        action: "auth.device_started",
        target: { type: "none" },
        metadata: { clientId: input.clientId, name },
        ipAddress: context.ip,
      },
      at,
    );
    return {
      ok: true,
      grant: {
        deviceCode,
        userCode,
        expiresIn: DEVICE_GRANT_TTL_SECONDS,
        interval: DEVICE_POLL_INTERVAL_SECONDS,
      },
    };
  }
  throw new Error("Could not draw a free user code");
};

/** What the `/device` page shows about a code before it's approved. */
export type GrantRequest = Pick<
  DeviceGrant,
  "userCode" | "clientId" | "name" | "requesterIp" | "createdAt" | "expiresAt"
>;

/** Every way a code can be wrong, used or expired, which the page never tells apart. */
export type InvalidCode = { ok: false; error: "invalid_code" };
const INVALID: InvalidCode = { ok: false, error: "invalid_code" };

const isLive = (grant: DeviceGrant, at: Date) =>
  grant.status === "pending" && grant.expiresAt.getTime() > at.getTime();

/**
 * Finds the pending grant a typed code names. A well-formed code that matches no grant is a wrong
 * code: it counts against every pending grant, and voids those it takes to 5 (SPEC, *Brute force*).
 * A used, expired or malformed code is refused without counting.
 */
const findLive = async (
  deps: DeviceGrantDeps,
  actor: { userId: string; ip: string | null },
  typed: string,
  at: Date,
): Promise<DeviceGrant | null> => {
  const code = normalizeUserCode(typed);
  if (code === null) return null;
  const grant = await deps.grants.findByUserCode(code);
  if (!grant) {
    const voided = await deps.grants.countWrongCode(at, DEVICE_MAX_WRONG_CODES);
    if (voided > 0) {
      log.event("auth.device_voided", { count: voided });
      await deps.grants.recordAudit(
        {
          actorId: actor.userId,
          action: "auth.device_voided",
          target: { type: "none" },
          metadata: { count: voided },
          ipAddress: actor.ip,
        },
        at,
      );
    }
    return null;
  }
  return isLive(grant, at) ? grant : null;
};

export type DeviceActor = { user: CurrentUser | null; ip: string | null };

/** The `/device` page's look-up: the code's details, for a signed-in person to confirm. */
export const describeDeviceGrant = async (
  deps: DeviceGrantDeps,
  actor: DeviceActor,
  typed: string,
): Promise<{ ok: true; request: GrantRequest } | InvalidCode> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user as CurrentUser;
  const grant = await findLive(deps, { userId: user.id, ip: actor.ip }, typed, now(deps));
  if (!grant) return INVALID;
  const { userCode, clientId, name, requesterIp, createdAt, expiresAt } = grant;
  return { ok: true, request: { userCode, clientId, name, requesterIp, createdAt, expiresAt } };
};

export type DecideResult = { ok: true } | InvalidCode | { ok: false; error: "user_disabled" };

/**
 * Approve binds the code to the signed-in person; deny ends it. Of two decisions at once, only the
 * first counts; the other gets the same answer as a wrong code.
 */
const decide = async (
  deps: DeviceGrantDeps,
  actor: DeviceActor,
  typed: string,
  status: "approved" | "denied",
): Promise<DecideResult> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user as CurrentUser;
  const at = now(deps);
  if (!(await deps.identity.findActiveUser(user.id))) return { ok: false, error: "user_disabled" };
  const grant = await findLive(deps, { userId: user.id, ip: actor.ip }, typed, at);
  if (!grant) return INVALID;
  if (!(await deps.grants.decide(grant.id, { status, userId: user.id, approverIp: actor.ip }, at)))
    return INVALID;
  await deps.grants.recordAudit(
    {
      actorId: user.id,
      action: status === "approved" ? "auth.device_approved" : "auth.device_denied",
      target: { type: "user", id: user.id },
      metadata: {
        clientId: grant.clientId,
        name: grant.name,
        requestedAt: grant.createdAt.toISOString(),
        requesterIp: grant.requesterIp,
      },
      ipAddress: actor.ip,
    },
    at,
  );
  return { ok: true };
};

export const approveDeviceGrant = (deps: DeviceGrantDeps, actor: DeviceActor, typed: string) =>
  decide(deps, actor, typed, "approved");

export const denyDeviceGrant = (deps: DeviceGrantDeps, actor: DeviceActor, typed: string) =>
  decide(deps, actor, typed, "denied");

/** RFC 8628 §3.5's answers, and Ronne's own two (`user_disabled`, `token_limit`). */
export type ExchangeError =
  | "invalid_request"
  | "unsupported_grant_type"
  | "invalid_client"
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token"
  | "invalid_grant"
  | "user_disabled"
  | "token_limit";

export type DeviceExchangeResult =
  | { ok: true; token: NewToken }
  | { ok: false; error: ExchangeError };

/** `POST /api/v1/auth/device/token`: `rmk` polls with the device code until there's an answer. */
export const exchangeDeviceCode = async (
  deps: DeviceGrantDeps,
  input: { grantType: unknown; deviceCode: unknown; clientId: unknown },
  context: { ip: string | null },
): Promise<DeviceExchangeResult> => {
  const fail = (error: ExchangeError): DeviceExchangeResult => ({ ok: false, error });
  if (
    typeof input.grantType !== "string" ||
    typeof input.deviceCode !== "string" ||
    typeof input.clientId !== "string" ||
    input.deviceCode.length === 0
  )
    return fail("invalid_request");
  if (input.grantType !== DEVICE_GRANT_TYPE) return fail("unsupported_grant_type");
  if (!isDeviceClientId(input.clientId)) return fail("invalid_client");

  const at = now(deps);
  const grant = await deps.grants.findByDeviceCodeHash(hashDeviceCode(input.deviceCode));
  if (!grant || grant.clientId !== input.clientId || grant.status === "spent")
    return fail("invalid_grant");

  // Polled too soon: the next poll must wait 5 seconds more (RFC 8628 §3.5).
  const tooSoon =
    grant.lastPolledAt !== null &&
    at.getTime() - grant.lastPolledAt.getTime() < grant.intervalSeconds * 1000;
  const interval = grant.intervalSeconds + (tooSoon ? DEVICE_SLOW_DOWN_SECONDS : 0);
  await deps.grants.markPolled(grant.id, at, interval);
  if (tooSoon) return fail("slow_down");

  if (grant.status === "voided" || grant.status === "expired") return fail("expired_token");
  if (grant.expiresAt.getTime() <= at.getTime()) {
    await expire(deps, grant, at, context.ip);
    return fail("expired_token");
  }
  if (grant.status === "denied") return fail("access_denied");
  if (grant.status === "pending") return fail("authorization_pending");

  // Approved: spend it first (and only before its expiry), so one poll at most makes a token.
  if (!(await deps.grants.spend(grant.id, at))) return fail("invalid_grant");
  const user = grant.userId ? await deps.identity.findActiveUser(grant.userId) : null;
  if (!user) return fail("user_disabled");
  try {
    const token = await createWithFreeName(deps.tokens, user, context.ip, grant.name, "device");
    log.event("token.exchanged", { userId: user.id });
    return { ok: true, token };
  } catch (error) {
    if (error instanceof TokenLimitError) return fail("token_limit");
    throw error;
  }
};
