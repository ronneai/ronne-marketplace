import { openSetting, sealSetting } from "./instance-secrets";
import { SKILL_SCAN_KEY_ENC_KEY } from "./skill-scan-policy";

/**
 * The security scan's API key at rest (136), sealed with what it was typed for: the provider and
 * the endpoint's origin. It opens only for that same pair, so a key typed for one provider or host
 * never goes to another, whatever changed the setting since (a save that raced this one, a hand
 * edit). `rotate-secret` re-seals the whole value without reading it.
 */
export type ScanKeyFor = { provider: string; endpoint: string | null };

/** An endpoint's origin (scheme, host and port), or null for none or one that isn't a URL. */
export const originOf = (endpoint: string | null): string | null => {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
};

export const sealScanKey = (authSecret: string, key: string, typedFor: ScanKeyFor): string =>
  sealSetting(
    authSecret,
    SKILL_SCAN_KEY_ENC_KEY,
    JSON.stringify({ provider: typedFor.provider, origin: originOf(typedFor.endpoint), key }),
  );

/**
 * The key, when this AUTH_SECRET opens it and it was typed for this provider and origin; null
 * otherwise (another AUTH_SECRET sealed it, or the setting changed since).
 */
export const openScanKey = (
  authSecret: string,
  stored: string,
  usedFor: ScanKeyFor,
): string | null => {
  let sealed: unknown;
  try {
    sealed = JSON.parse(openSetting(authSecret, SKILL_SCAN_KEY_ENC_KEY, stored));
  } catch {
    return null;
  }
  if (sealed === null || typeof sealed !== "object") return null;
  const { provider, origin, key } = sealed as Record<string, unknown>;
  if (typeof key !== "string" || key === "") return null;
  return provider === usedFor.provider && origin === originOf(usedFor.endpoint) ? key : null;
};
