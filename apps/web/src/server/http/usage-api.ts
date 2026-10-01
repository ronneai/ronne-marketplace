import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { recordUsageAs, usageSettingsAs } from "../domains/usage/actions/usage";
import { InvalidUsageReportError, UsageDisabledError } from "../domains/usage/exceptions/errors";
import { domainErrorResponse, errorResponse, rateLimitedResponse } from "./errors";
import { readJsonObjectWithin } from "./read-json";
import { requireToken, type TokenGuardDeps } from "./require-token";
import { type UsageLimiter, usageLimiter } from "./usage-rate-limit";

/**
 * The usage API (feature 046): `rmk` reports daily counts of installs, removals and runs of the
 * items it installed, under root's usage policy (Admin › Settings). Any token may report unless the
 * policy is `off`. Thin, like the drafts API: the usage domain
 * decides; this parses, limits, maps errors and shapes JSON.
 */
export type UsageApiDeps = {
  app?: AppAuth;
  guard?: TokenGuardDeps;
  limiter?: UsageLimiter;
};

/** 500 events of about 200 bytes each, with room to spare. */
export const USAGE_BODY_MAX_BYTES = 256 * 1024;

const usageErrorResponse = (error: unknown): Response => {
  if (error instanceof UsageDisabledError)
    return errorResponse(403, "usage_disabled", error.message);
  if (error instanceof InvalidUsageReportError)
    return errorResponse(400, "invalid_request", error.message);
  const response = domainErrorResponse(error);
  if (response) return response;
  throw error;
};

/** GET /api/v1/usage: root's usage policy, and how long usage is kept. */
export const getUsage = async (request: Request, deps: UsageApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  try {
    return Response.json(await usageSettingsAs(guard.auth.user, deps.app), {
      headers: { "cache-control": "private, no-cache" },
    });
  } catch (error) {
    return usageErrorResponse(error);
  }
};

/**
 * POST /api/v1/usage: `{ "events": [ … ] }`. In order: the token, the rate, the body's size, then
 * the usage domain, which refuses everything while the policy is `off`. Lines that can't be counted are ignored and reported as such.
 */
export const postUsage = async (request: Request, deps: UsageApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const rate = (deps.limiter ?? usageLimiter()).consume(guard.auth.user.id);
  if (!rate.allowed)
    return rateLimitedResponse(
      "Too many usage reports: at most 60 in 10 minutes. Wait, then try again.",
      rate.retryAfterSeconds,
    );
  const read = await readJsonObjectWithin(request, USAGE_BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  try {
    const result = await recordUsageAs(guard.auth.user, read.body, deps.app);
    return Response.json(result, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return usageErrorResponse(error);
  }
};
