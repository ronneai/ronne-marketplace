import {
  type DeviceOptions,
  exchangeDeviceLogin,
  startDeviceLogin,
  verificationUri,
} from "../domains/identity/actions/device-grants";
import { formatUserCode } from "../domains/identity/models/device-grant";
import { type AppAuth, getAppAuth } from "../domains/identity/repositories/auth-instance";
import { errorResponse, rateLimitedResponse } from "./errors";
import { readJsonObjectWithin, SMALL_JSON_MAX_BYTES } from "./read-json";

/**
 * `rmk login --web` (feature 107): the device flow of RFC 8628, with the API's error shape
 * (MVP §11): `error.code` is RFC 8628's error name. Nothing is cached, no cookie is read or set.
 */
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache" } });

const MESSAGES = {
  invalid_request: "Send JSON with the fields this request needs.",
  invalid_client: "Unknown client_id: use rmk (or rmk-mcp).",
  unsupported_grant_type: "grant_type must be urn:ietf:params:oauth:grant-type:device_code.",
  authorization_pending: "Not approved yet.",
  slow_down: "Polled too soon: wait 5 seconds more between polls.",
  access_denied: "The sign-in was denied in the browser.",
  expired_token: "The code has expired. Run rmk login --web again.",
  invalid_grant: "Unknown or already used device code. Run rmk login --web again.",
  user_disabled: "This account is disabled.",
  token_limit:
    "You have 50 active tokens, the most allowed. Revoke an old token first, then run rmk login --web again.",
} as const;

const failure = (code: keyof typeof MESSAGES) =>
  errorResponse(400, code, MESSAGES[code], undefined, { pragma: "no-cache" });

/** POST /api/v1/auth/device/code: `{ client_id, name? }` → a device code and a user code. */
export const postDeviceCode = async (
  request: Request,
  app: AppAuth = getAppAuth(),
  options?: DeviceOptions,
) => {
  const read = await readJsonObjectWithin(request, SMALL_JSON_MAX_BYTES);
  if (!read.ok) return read.response;
  if (!read.body) return failure("invalid_request");
  const result = await startDeviceLogin(
    { clientId: read.body.client_id, name: read.body.name },
    request.headers,
    app,
    options,
  );
  if (!result.ok)
    return result.error === "rate_limited"
      ? rateLimitedResponse(
          "Too many sign-in codes asked for, wait a minute.",
          result.retryAfterSeconds,
        )
      : failure(result.error);
  const uri = await verificationUri(app);
  const userCode = formatUserCode(result.grant.userCode);
  return json({
    device_code: result.grant.deviceCode,
    user_code: userCode,
    verification_uri: uri,
    verification_uri_complete: `${uri}?user_code=${encodeURIComponent(userCode)}`,
    expires_in: result.grant.expiresIn,
    interval: result.grant.interval,
  });
};

/** POST /api/v1/auth/device/token: `{ grant_type, device_code, client_id }` → a token, once. */
export const postDeviceToken = async (
  request: Request,
  app: AppAuth = getAppAuth(),
  options?: DeviceOptions,
) => {
  const read = await readJsonObjectWithin(request, SMALL_JSON_MAX_BYTES);
  if (!read.ok) return read.response;
  if (!read.body) return failure("invalid_request");
  const result = await exchangeDeviceLogin(
    {
      grantType: read.body.grant_type,
      deviceCode: read.body.device_code,
      clientId: read.body.client_id,
    },
    request.headers,
    app,
    options,
  );
  if (result.ok) {
    const { token, id, name, expiresAt } = result.token;
    return json({ token, id, name, expiresAt: expiresAt?.toISOString() ?? null });
  }
  if (result.error === "rate_limited")
    return rateLimitedResponse("Polling too fast, wait a minute.", result.retryAfterSeconds);
  return failure(result.error);
};
