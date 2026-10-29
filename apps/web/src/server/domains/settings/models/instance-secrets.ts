import { open, reseal, type SealPurpose, seal } from "../../../crypto/sealed";

/**
 * Instance settings that hold a secret (136), such as the security scan's API key: a row of
 * `instance_settings` whose key ends in `_enc`, sealed by `crypto/sealed.ts` with its own HKDF
 * `info` and the setting's key as associated data, so a value copied to another setting doesn't
 * open. `rotate-secret` re-seals every such row.
 */
const INFO = "ronne:instance-setting-secret:v1";

/** Whether a setting's key names a sealed secret. */
export const isSecretSettingKey = (key: string): boolean => key.endsWith("_enc");

const purpose = (key: string): SealPurpose => {
  if (!isSecretSettingKey(key)) throw new Error(`Not a secret setting: ${key}`);
  return { info: INFO, boundTo: key };
};

export const sealSetting = (authSecret: string, key: string, value: string): string =>
  seal(authSecret, purpose(key), value);

/** The value, or SealedValueUnreadableError. */
export const openSetting = (authSecret: string, key: string, stored: string): string =>
  open(authSecret, purpose(key), stored);

/** For `rotate-secret`: the value under the new AUTH_SECRET, or null when the old can't open it. */
export const resealSetting = (from: string, to: string, key: string, stored: string) =>
  reseal(from, to, purpose(key), stored);
