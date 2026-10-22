import { getCurrentUser } from "../domains/identity/actions/session";
import { exportUserData } from "../domains/identity/actions/user-data";
import {
  DataExportLimitError,
  ForbiddenError,
  UserErasedError,
  UserNotFoundError,
} from "../domains/identity/exceptions/errors";
import { signInUrl } from "../domains/identity/models/route-guard";
import { type AppAuth, getAppAuth } from "../domains/identity/repositories/auth-instance";
import { errorResponse } from "./errors";
import { passwordChangeHold } from "./password-change-hold";
import { twoFactorHold } from "./two-factor-hold";

/** What the route handlers of `GET /account/data` and `GET /admin/users/<id>/data` share (104). */
export type UserDataRouteDeps = {
  app?: AppAuth;
  /** The two-factor hold on the request's person, for tests; the default reads the policy. */
  hold?: (headers: Headers) => Promise<unknown>;
  /** The password-change hold (128), for tests; the default reads the account's flag. */
  passwordHold?: (headers: Headers) => Promise<boolean>;
};

/** `ronne-data-<id>-<date>.json`: the id is ours (a ULID) and the date is UTC, so both are safe. */
export const dataFileName = (userId: string, at: Date): string =>
  `ronne-data-${userId.replace(/[^A-Za-z0-9_-]/g, "")}-${at.toISOString().slice(0, 10)}.json`;

/**
 * The data file of `target` (null, or a user's id) for the signed-in person (104): their own,
 * or root's for anyone. A web session only, never a token (the route isn't under `/api/v1`):
 * anything sent as `Authorization` is refused, no session goes to sign-in, a person held on the
 * two-factor step (105) is refused. A moderator, an unknown or an erased account all answer 404,
 * so the answer doesn't say which accounts exist; the second download within ten minutes is 429
 * with the time left in `Retry-After`.
 */
export const userDataResponse = async (
  request: Request,
  /** The account's id, or null for the signed-in person's own. */
  target: string | null,
  deps: UserDataRouteDeps = {},
): Promise<Response> => {
  // A download is recorded and counted, so only a person's own click makes one: not a HEAD or a
  // prefetch, and not a link or redirect from another site (Lax cookies go with a top-level GET).
  if (request.method !== "GET")
    return errorResponse(405, "method_not_allowed", "Only GET downloads the file.", undefined, {
      allow: "GET",
    });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return errorResponse(
      403,
      "cross_site",
      "Open this from the Ronne app, signed in: a link from another site can't download it.",
    );
  if (request.headers.has("authorization"))
    return errorResponse(
      401,
      "session_required",
      "Your data is downloaded from the web app, signed in, not with a token.",
    );
  const app = deps.app ?? getAppAuth();
  const user = await getCurrentUser(request.headers, app);
  if (!user)
    return new Response(null, {
      status: 303,
      headers: { location: signInUrl(new URL(request.url).pathname), "cache-control": "no-store" },
    });
  if (await (deps.passwordHold ?? passwordChangeHold)(request.headers))
    return errorResponse(
      403,
      "password_change_required",
      "Choose your own password first (Account › Password).",
    );
  if (await (deps.hold ?? twoFactorHold)(request.headers))
    return errorResponse(
      403,
      "two_factor_required",
      "Set up two-factor sign-in first (Account › Two-factor sign-in).",
    );
  const userId = target ?? user.id;
  try {
    const { data } = await exportUserData(request.headers, userId, app);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${dataFileName(data.account.id, data.exportedAt)}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DataExportLimitError)
      return errorResponse(
        429,
        "rate_limited",
        error.message,
        { retryAfter: error.seconds },
        {
          "retry-after": String(error.seconds),
        },
      );
    if (
      error instanceof ForbiddenError ||
      error instanceof UserNotFoundError ||
      error instanceof UserErasedError
    )
      return errorResponse(404, "not_found", "There is no such account to download.");
    throw error;
  }
};
