import { passwordChangeRequired } from "../domains/identity/actions/session";
import { getAppAuthIfConfigured } from "../domains/identity/repositories/auth-instance";
import { errorResponse } from "./errors";

/** Where a person who must replace the password root chose is held until they have (128). */
export const PASSWORD_PATH = "/account/password";

/**
 * Whether the request's signed-in person is held on the change-password page (feature 128). Like
 * the two-factor hold (105) it is read on every page and server action, so it stops early: no
 * session cookie or no instance yet, and nothing more is read.
 */
export const passwordChangeHold = async (headers: Headers): Promise<boolean> => {
  if (!(headers.get("cookie") ?? "").includes("session_token")) return false;
  const app = getAppAuthIfConfigured();
  if (!app) return false;
  return passwordChangeRequired(headers, app);
};

/** The API's refusal while the hold is on: 403 `password_change_required`, with what to do about it. */
export const changeRequiredResponse = (message: string) =>
  errorResponse(403, "password_change_required", message);
