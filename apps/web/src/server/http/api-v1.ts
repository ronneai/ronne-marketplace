import { exchangePassword, revokeCallingToken } from "../domains/identity/actions/access-tokens";
import { IdentityError, TokenLimitError } from "../domains/identity/exceptions/errors";
import { type AppAuth, getAppAuth } from "../domains/identity/repositories/auth-instance";
import { errorResponse } from "./errors";
import { readJsonObjectWithin, SMALL_JSON_MAX_BYTES } from "./read-json";
import { requireToken, type TokenGuardDeps } from "./require-token";

/** Token responses are never cached (spec 009). */
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** POST /api/v1/auth/token: `{ email, password, name? }` → a 90-day token, for `rmk login`. */
export const postToken = async (request: Request, app: AppAuth = getAppAuth()) => {
  const read = await readJsonObjectWithin(request, SMALL_JSON_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body;
  if (!body)
    return errorResponse(400, "invalid_request", 'Send JSON: { "email", "password", "name"? }.');
  try {
    const result = await exchangePassword(
      { email: body.email, password: body.password, name: body.name },
      request.headers,
      app,
    );
    if (result.ok) {
      const { token, id, name, expiresAt } = result.token;
      return json({ token, id, name, expiresAt: expiresAt?.toISOString() ?? null }, 201);
    }
    if (result.error === "rate_limited")
      return errorResponse(
        429,
        "rate_limited",
        "Too many attempts, wait a minute.",
        { retryAfterSeconds: result.retryAfterSeconds },
        { "retry-after": String(result.retryAfterSeconds) },
      );
    return errorResponse(401, "invalid_credentials", "Email or password is wrong.");
  } catch (error) {
    if (error instanceof TokenLimitError) return errorResponse(409, "token_limit", error.message);
    if (error instanceof IdentityError) return errorResponse(400, "invalid_request", error.message);
    throw error;
  }
};

/** DELETE /api/v1/auth/token: revokes the calling token, for `rmk logout`. */
export const deleteToken = async (request: Request, app?: AppAuth, guardDeps?: TokenGuardDeps) => {
  // The guard runs first: before setup it answers 503, and getAppAuth() would throw.
  const guard = await requireToken(request, guardDeps);
  if (!guard.ok) return guard.response;
  await revokeCallingToken(guard.auth, request.headers, app ?? getAppAuth());
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
};

/** GET /api/v1/me: the calling user and token, for `rmk whoami` and `rmk login --token`. */
export const getMe = async (request: Request, guardDeps?: TokenGuardDeps) => {
  const guard = await requireToken(request, guardDeps);
  if (!guard.ok) return guard.response;
  const { user, token } = guard.auth;
  return json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    token: { id: token.id, name: token.name, expiresAt: token.expiresAt?.toISOString() ?? null },
  });
};
