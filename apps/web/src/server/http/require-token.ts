import {
  type Authenticated,
  authenticateToken,
  type TokenFailure,
} from "../domains/identity/actions/access-tokens";
import { setRequestUser } from "../log";
import { getSetupState } from "../setup/state";
import { errorResponse, setupRequiredResponse } from "./errors";
import { changeRequiredResponse } from "./password-change-hold";

const MESSAGES: Record<TokenFailure, string> = {
  token_missing: "Send an access token in the Authorization header: `Bearer rmk_…`.",
  // The same for a malformed token and an unknown one, so it doesn't say whether a token existed.
  token_invalid: "The access token isn't valid.",
  token_expired:
    "The access token has expired. Make a new one in Access tokens, or run `rmk login`.",
  token_revoked:
    "The access token was revoked. Make a new one in Access tokens, or run `rmk login`.",
  // 401 rather than 403, so the client signs in again rather than retrying.
  user_disabled: "Your account is disabled. Ask a root administrator.",
};

/**
 * The token in `Authorization: Bearer <token>`, or null. Only this header is read: cookies are
 * ignored on `/api/v1`, which also rules out cross-site request forgery there.
 */
export const bearerToken = (headers: Headers): string | null => {
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(headers.get("authorization") ?? "");
  return match?.[1] ?? null;
};

/** The 401 for a failed token, in the MVP §11 shape, with `WWW-Authenticate: Bearer`. */
export const tokenFailureResponse = (failure: TokenFailure): Response =>
  errorResponse(401, failure, MESSAGES[failure], undefined, {
    "www-authenticate":
      failure === "token_missing"
        ? 'Bearer realm="ronne"'
        : 'Bearer realm="ronne", error="invalid_token"',
  });

export type TokenGuardResult =
  | { ok: true; auth: Authenticated }
  | { ok: false; response: Response };

/**
 * The bearer guard for every `/api/v1` route that needs a user (feature 009, then 019 onward):
 *
 *   const guard = await requireToken(request);
 *   if (!guard.ok) return guard.response;
 *   // guard.auth.user, guard.auth.token
 */
export type TokenGuardDeps = {
  /** The instance is set up (feature 036): the API answers 503 until then. */
  ready: () => Promise<boolean>;
  authenticate: (token: string | null) => ReturnType<typeof authenticateToken>;
};

const appDeps: TokenGuardDeps = {
  ready: async () => (await getSetupState()) === "ready",
  authenticate: (token) => authenticateToken(token),
};

/**
 * `allowPasswordChange` is for `GET /api/v1/me` alone (128): a token of an account that must still
 * replace its password gets 403 `password_change_required` everywhere else, and `/me` lets `rmk`
 * tell the person what to do.
 */
export const requireToken = async (
  request: Request,
  deps: TokenGuardDeps = appDeps,
  options: { allowPasswordChange?: boolean } = {},
): Promise<TokenGuardResult> => {
  if (!(await deps.ready())) return { ok: false, response: setupRequiredResponse() };
  const result = await deps.authenticate(bearerToken(request.headers));
  if (!result.ok) return { ok: false, response: tokenFailureResponse(result.failure) };
  // The request's lines (http.request among them) say whose token it was (feature 100).
  setRequestUser(result.value.user.id);
  if (result.value.passwordChangeRequired && !options.allowPasswordChange)
    return {
      ok: false,
      response: changeRequiredResponse(
        "Choose your own password in the web app first: sign in there and you are taken to it.",
      ),
    };
  return { ok: true, auth: result.value };
};
