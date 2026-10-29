import { describe, expect, it } from "vitest";
import { SealedValueUnreadableError } from "../../../crypto/sealed";
import { encryptSecret } from "../../identity/repositories/provider-secrets";
import { isSecretSettingKey, openSetting, resealSetting, sealSetting } from "./instance-secrets";

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const OTHER = "another-secret-another-secret-0000";
const KEY = "skill_scan_key_enc";
const VALUE = "sk-live-0123456789abcdef";

describe("instance setting secrets (136)", () => {
  it("round-trips, and the stored value isn't the secret", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    expect(stored).not.toContain(VALUE);
    expect(stored).toMatch(/^v1\.[\w-]{16}\.[\w-]+$/);
    expect(openSetting(AUTH_SECRET, KEY, stored)).toBe(VALUE);
  });

  it("round-trips an empty value and one in any script", () => {
    for (const value of ["", "clé-秘密-🔑"])
      expect(openSetting(AUTH_SECRET, KEY, sealSetting(AUTH_SECRET, KEY, value))).toBe(value);
  });

  it("uses a fresh nonce for every value", () => {
    expect(sealSetting(AUTH_SECRET, KEY, VALUE)).not.toBe(sealSetting(AUTH_SECRET, KEY, VALUE));
  });

  it("doesn't open under another AUTH_SECRET", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    expect(() => openSetting(OTHER, KEY, stored)).toThrow(SealedValueUnreadableError);
  });

  it("doesn't open when copied to another setting", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    expect(() => openSetting(AUTH_SECRET, "other_key_enc", stored)).toThrow(
      SealedValueUnreadableError,
    );
  });

  it("doesn't open an identity provider's secret, even one named as the setting", () => {
    // Its own HKDF info: a provider secret copied into a setting row stays shut, and the reverse.
    const stored = encryptSecret(AUTH_SECRET, KEY, VALUE);
    expect(() => openSetting(AUTH_SECRET, KEY, stored)).toThrow(SealedValueUnreadableError);
  });

  it.each([
    ["", "empty"],
    ["plain-text-key", "a plain value"],
    ["v2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", "another version"],
    ["v1.AAAA.AAAAAAAAAAAAAAAAAAAAAA", "a short nonce"],
    ["v1.AAAAAAAAAAAAAAAA.AAAA", "too short for the tag"],
    ["v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.extra", "an extra part"],
  ])("refuses %j (%s) as unreadable", (stored) => {
    expect(() => openSetting(AUTH_SECRET, KEY, stored)).toThrow(SealedValueUnreadableError);
  });

  it("refuses a sealed value with anything added that isn't base64url", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    const [v, nonce, sealed] = stored.split(".");
    for (const damaged of [
      `${stored}\r\n`,
      `${v}.${nonce}!!.${sealed}`,
      `${v}.${nonce}.${sealed}==`,
    ])
      expect(() => openSetting(AUTH_SECRET, KEY, damaged)).toThrow(SealedValueUnreadableError);
  });

  it("refuses a value with one byte changed", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    const [v, nonce, sealed] = stored.split(".");
    const bytes = Buffer.from(sealed as string, "base64url");
    bytes[0] = (bytes[0] as number) ^ 1;
    expect(() =>
      openSetting(AUTH_SECRET, KEY, `${v}.${nonce}.${bytes.toString("base64url")}`),
    ).toThrow(SealedValueUnreadableError);
  });

  it("re-seals under a new AUTH_SECRET, and gives null for a value the old one can't open", () => {
    const stored = sealSetting(AUTH_SECRET, KEY, VALUE);
    const next = resealSetting(AUTH_SECRET, OTHER, KEY, stored);
    expect(next).not.toBeNull();
    expect(openSetting(OTHER, KEY, next as string)).toBe(VALUE);
    expect(() => openSetting(AUTH_SECRET, KEY, next as string)).toThrow(SealedValueUnreadableError);
    expect(resealSetting(OTHER, AUTH_SECRET, KEY, stored)).toBeNull();
  });

  it("seals only keys ending in _enc", () => {
    expect(isSecretSettingKey(KEY)).toBe(true);
    expect(isSecretSettingKey("skill_scan_enabled")).toBe(false);
    expect(() => sealSetting(AUTH_SECRET, "skill_scan_model", VALUE)).toThrow(/Not a secret/);
  });
});
