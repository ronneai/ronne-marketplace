import { requirePermission } from "../../identity/models/permissions";
import {
  InvalidSignUpSettingError,
  type SignUpBlocker,
  SignUpUnavailableError,
} from "../exceptions/errors";
import {
  isTermsUrl,
  isTermsVersion,
  parseSignUpDomains,
  SIGN_UP_KEYS,
  type SignUpPolicy,
  signUpPolicyFromRows,
  signUpPolicyRows,
} from "../models/sign-up-policy";
import type { SettingsRepository } from "../repositories/settings-repository";
import type { SettingsActor, SettingsDeps } from "./settings";

/**
 * Whether sign-up can be turned on (190): email is set up (189), the instance contact is set (every
 * notice names whom to tell, NIST SP 800-63B-4 §4.6), and an account made here could sign in with
 * its password (106's *Root only* holds only while an identity provider is on).
 */
export type SignUpReadiness = { mail: boolean; contact: boolean; password: boolean };

/** What still stands in the way, in the order the panel names it. */
export const signUpBlockers = (readiness: SignUpReadiness): SignUpBlocker[] => [
  ...(readiness.mail ? [] : (["mail"] as const)),
  ...(readiness.contact ? [] : (["contact"] as const)),
  ...(readiness.password ? [] : (["password"] as const)),
];

/** The sign-up policy as stored: no permission check, as sign-up's own pages read it. */
export const signUpPolicy = async (repo: SettingsRepository): Promise<SignUpPolicy> => {
  const keys = Object.entries(SIGN_UP_KEYS) as [keyof typeof SIGN_UP_KEYS, string][];
  const rows = await Promise.all(keys.map(([, key]) => repo.get(key)));
  return signUpPolicyFromRows(
    Object.fromEntries(keys.map(([name], i) => [name, rows[i]?.value ?? null])),
  );
};

/** The Self-registration panel (190): root only. */
export const signUpSettings = async (
  deps: SettingsDeps,
  actor: SettingsActor,
): Promise<SignUpPolicy> => {
  requirePermission(actor.user, "settings.manage");
  return signUpPolicy(deps.repo);
};

export type SignUpInput = {
  enabled?: unknown;
  /** `any`, or `list` with `domains`. */
  domainsMode?: unknown;
  domains?: unknown;
  approval?: unknown;
  blockThrowaway?: unknown;
  codeMinutes?: unknown;
  challenge?: unknown;
  termsUrl?: unknown;
  termsVersion?: unknown;
  /** With a new version: everyone accepts it at their next web sign-in. */
  askAgain?: unknown;
};

const on = (value: unknown) => value === true || value === "on";
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** What the audit keeps of a policy: every setting, the terms link included (root typed it). */
const summary = (p: SignUpPolicy) => ({
  enabled: p.enabled,
  domains: p.domains === "any" ? "any" : [...p.domains],
  approval: p.approval,
  blockThrowaway: p.blockThrowaway,
  codeMinutes: p.codeMinutes,
  challenge: p.challenge,
  termsUrl: p.termsUrl || null,
  termsVersion: p.termsVersion || null,
  termsRequiredVersion: p.termsRequiredVersion || null,
});

/**
 * Root saves self-registration (190). The switch turns on only while `readiness` holds; once on,
 * it stays on (closed, the sign-up pages check `readiness` themselves) and the rest still saves. Domains
 * are read as mail delivery reads them, exact; the code lifetime is 5 to 60 minutes; the terms
 * link is https:// or nothing, with a version when it's set. A new version is asked of everyone
 * only with `askAgain`; otherwise only new sign-ups accept it. Only a change is saved and audited,
 * as `settings.sign_up_changed` with the old and new settings.
 */
export const setSignUpPolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  input: SignUpInput,
  readiness: SignUpReadiness,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const enabled = on(input.enabled);
  let domains: "any" | string[] = "any";
  if (input.domainsMode === "list") {
    const parsed = parseSignUpDomains(typeof input.domains === "string" ? input.domains : "");
    if (!parsed || parsed.length === 0) throw new InvalidSignUpSettingError("domains");
    domains = parsed;
  }
  const minutesText = text(input.codeMinutes);
  const minutes = Number(minutesText);
  if (!/^\d{1,2}$/.test(minutesText) || minutes < 5 || minutes > 60)
    throw new InvalidSignUpSettingError("codeMinutes");
  const termsUrl = text(input.termsUrl);
  if (!isTermsUrl(termsUrl)) throw new InvalidSignUpSettingError("termsUrl");
  const termsVersion = termsUrl ? text(input.termsVersion) : "";
  if (termsUrl && !isTermsVersion(termsVersion))
    throw new InvalidSignUpSettingError("termsVersion");

  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const from = await signUpPolicy(repo);
    // Only turning it on needs them; while it's on and closed, root can still save the rest.
    const [blocker] = signUpBlockers(readiness);
    if (enabled && !from.enabled && blocker) throw new SignUpUnavailableError(blocker);
    // The version everyone must have accepted moves only when root asks; no link, nothing asked.
    const termsRequiredVersion = !termsUrl
      ? ""
      : on(input.askAgain) && termsVersion !== from.termsVersion
        ? termsVersion
        : from.termsRequiredVersion;
    const to: SignUpPolicy = {
      enabled,
      domains,
      approval: on(input.approval),
      blockThrowaway: on(input.blockThrowaway),
      codeMinutes: minutes,
      challenge: on(input.challenge),
      termsUrl,
      termsVersion,
      termsRequiredVersion,
    };
    const fromRows = signUpPolicyRows(from);
    const toRows = signUpPolicyRows(to);
    if (Object.keys(toRows).every((key) => fromRows[key] === toRows[key]))
      return { changed: false };
    const by = actor.user?.id ?? null;
    for (const [key, value] of Object.entries(toRows)) await repo.set(key, value, by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.sign_up_changed",
        target: { type: "instance" },
        metadata: { from: summary(from), to: summary(to) },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};
