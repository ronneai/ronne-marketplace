import { mustEnrol } from "../domains/identity/actions/two-factor";
import type { TwoFactorRequirement } from "../domains/identity/models/two-factor-coverage";
import { getAppAuthIfConfigured } from "../domains/identity/repositories/auth-instance";
import { twoFactorPolicy } from "../domains/settings/actions/settings";

/** Where a person root requires to use two-factor is held until they've set it up (105). */
export const SECURITY_PATH = "/account/security";

/**
 * The requirement holding the request's signed-in person on `/account/security` (feature 105), or
 * null: root requires two-factor of them (`reviewers` or `everyone`) and they haven't turned it on.
 * Read on every page of the app frame and every server action, so it stops early: no session
 * cookie, no instance yet, or `optional`, and nothing more is read.
 */
export const twoFactorHold = async (
  headers: Headers,
): Promise<Exclude<TwoFactorRequirement, "optional"> | null> => {
  if (!(headers.get("cookie") ?? "").includes("session_token")) return null;
  const app = getAppAuthIfConfigured();
  if (!app) return null;
  const requirement = await twoFactorPolicy(app);
  if (requirement === "optional") return null;
  return (await mustEnrol(headers, requirement, app)) ? requirement : null;
};
