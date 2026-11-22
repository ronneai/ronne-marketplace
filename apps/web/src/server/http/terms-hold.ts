import { termsToAccept } from "../domains/identity/actions/terms";
import { getAppAuthIfConfigured } from "../domains/identity/repositories/auth-instance";

/** Where a person who hasn't accepted the terms root asked everyone to accept is held (190). */
export const TERMS_PATH = "/account/terms";

/**
 * Whether the request's signed-in person is held on the terms page (190), like the password-change
 * hold (128): read on every page and server action, so it stops early. No session cookie, no
 * instance, or no version asked of everyone, and no account is read.
 */
export const termsHold = async (headers: Headers): Promise<boolean> => {
  if (!(headers.get("cookie") ?? "").includes("session_token")) return false;
  const app = getAppAuthIfConfigured();
  if (!app) return false;
  return (await termsToAccept(headers, app)) !== null;
};
