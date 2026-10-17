import { describe, expect, it } from "vitest";
import { ProviderSecretUnreadableError } from "../exceptions/errors";
import { decryptSecret, encryptSecret } from "./provider-secrets";

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const SECRET = "client-s3cret-value";

describe("identity provider secrets", () => {
  it("round-trips, and the stored value isn't the secret", () => {
    const stored = encryptSecret(AUTH_SECRET, "acme", SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored).toMatch(/^v1\.[\w-]{16}\.[\w-]+$/);
    expect(decryptSecret(AUTH_SECRET, "acme", stored)).toBe(SECRET);
  });

  it("uses a fresh nonce for every value", () => {
    const one = encryptSecret(AUTH_SECRET, "acme", SECRET);
    const two = encryptSecret(AUTH_SECRET, "acme", SECRET);
    expect(one).not.toBe(two);
    expect(one.split(".")[1]).not.toBe(two.split(".")[1]);
  });

  it("can't be read under another AUTH_SECRET", () => {
    const stored = encryptSecret(AUTH_SECRET, "acme", SECRET);
    expect(() => decryptSecret("another-secret-another-secret-0000", "acme", stored)).toThrow(
      ProviderSecretUnreadableError,
    );
  });

  it("can't be read on another provider's row", () => {
    const stored = encryptSecret(AUTH_SECRET, "acme", SECRET);
    expect(() => decryptSecret(AUTH_SECRET, "other", stored)).toThrow(
      ProviderSecretUnreadableError,
    );
  });

  it.each([
    ["", "empty"],
    ["v2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", "another version"],
    ["v1.AAAA.AAAAAAAAAAAAAAAAAAAAAA", "a short nonce"],
    ["v1.AAAAAAAAAAAAAAAA.AAAA", "no tag"],
    ["v1.a.b.c", "too many parts"],
  ])("refuses a damaged value (%s: %s)", (stored) => {
    expect(() => decryptSecret(AUTH_SECRET, "acme", stored)).toThrow(ProviderSecretUnreadableError);
  });

  it("refuses a value with one byte changed", () => {
    const stored = encryptSecret(AUTH_SECRET, "acme", SECRET);
    const [v, nonce, sealed] = stored.split(".");
    const bytes = Buffer.from(sealed as string, "base64url");
    bytes[0] = (bytes[0] as number) ^ 1;
    expect(() =>
      decryptSecret(AUTH_SECRET, "acme", `${v}.${nonce}.${bytes.toString("base64url")}`),
    ).toThrow(ProviderSecretUnreadableError);
  });
});
