import { SIGN_UP_KEYS } from "../../settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyTermsRepository } from "../repositories/kysely-terms-repository";
import * as service from "../services/terms";
import { getCurrentUser } from "./session";

const deps = (app: AppAuth): service.TermsDeps => ({
  repo: kyselyTermsRepository(app.db, app.dialect),
});

/**
 * Root's terms as saved (190). Read on every page and action, so the version asked of everyone
 * comes first, alone: with none (most instances, most of the time) that's the only query.
 */
export const instanceTerms = async (
  app: AppAuth = getAppAuth(),
): Promise<service.InstanceTerms> => {
  const settings = kyselySettingsRepository(app.db, app.dialect);
  const asked = await settings.get(SIGN_UP_KEYS.termsRequiredVersion);
  const required = asked?.value ?? "";
  if (!required) return { url: "", current: "", required: "", requiredSince: null };
  const [url, current] = await Promise.all([
    settings.get(SIGN_UP_KEYS.termsUrl),
    settings.get(SIGN_UP_KEYS.termsVersion),
  ]);
  return {
    url: url?.value ?? "",
    current: current?.value ?? "",
    required,
    requiredSince: asked?.updatedAt ?? null,
  };
};

/**
 * The terms the request's signed-in person must accept before going on, or null. Root's settings
 * are read first: with no version asked of everyone, no account is read at all.
 */
export const termsToAccept = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const terms = await instanceTerms(app);
  if (!terms.url || !terms.required) return null;
  const user = await getCurrentUser(headers, app);
  return user ? service.termsToAccept(deps(app), user.id, terms) : null;
};

/** **Continue** on the hold page. */
export const acceptTerms = async (
  headers: Headers,
  input: { accepted: unknown; version: unknown },
  app: AppAuth = getAppAuth(),
): Promise<service.TermsAccepted | { ok: false; error: "signed_out" }> => {
  const user = await getCurrentUser(headers, app);
  if (!user) return { ok: false, error: "signed_out" };
  return service.acceptTerms(
    deps(app),
    { userId: user.id, ip: clientIp(headers, app.trustProxy) },
    input,
    await instanceTerms(app),
  );
};
