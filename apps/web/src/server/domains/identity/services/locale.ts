import { isLocale, type Locale } from "../models/locale";
import { requirePermission } from "../models/permissions";
import { currentUser, type SessionDeps } from "./session";

export type SetLocaleResult =
  | { ok: true; locale: Locale | null }
  | { ok: false; error: "not_signed_in" | "invalid_locale" };

/**
 * Saves the signed-in person's language (feature 129): `en`, `pt` or `fr`, or null for automatic,
 * where the browser decides. It is their own preference, so nothing is audited; the change shows on
 * their next request.
 */
export const setLocale = async (
  deps: SessionDeps,
  headers: Headers,
  value: unknown,
): Promise<SetLocaleResult> => {
  const user = await currentUser(deps, headers);
  if (!user) return { ok: false, error: "not_signed_in" };
  requirePermission(user, "account.manage_own");
  if (value !== null && !isLocale(value)) return { ok: false, error: "invalid_locale" };
  await deps.repo.setLocale(user.id, value, (deps.now ?? (() => new Date()))());
  return { ok: true, locale: value };
};
