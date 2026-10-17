import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { ProviderSecretUnreadableError } from "../exceptions/errors";

/**
 * Identity providers' client secrets at rest (feature 106): AES-256-GCM under a key HKDF-SHA256
 * derives from AUTH_SECRET, a fresh 12-byte nonce per value, and the provider's id as associated
 * data, so a value copied onto another provider's row doesn't decrypt. Stored as
 * `v1.<nonce>.<ciphertext and tag>`, base64url. Node.js's own crypto only.
 */
const VERSION = "v1";
const INFO = "ronne:identity-provider-secret:v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

const keyFrom = (authSecret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), INFO, 32));

export const encryptSecret = (authSecret: string, providerId: string, secret: string): string => {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), nonce);
  cipher.setAAD(Buffer.from(providerId, "utf8"));
  const sealed = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${VERSION}.${nonce.toString("base64url")}.${sealed.toString("base64url")}`;
};

/** The secret, or ProviderSecretUnreadableError when another AUTH_SECRET sealed it (or it's damaged). */
export const decryptSecret = (authSecret: string, providerId: string, stored: string): string => {
  const [version, nonceText, sealedText, ...rest] = stored.split(".");
  if (version !== VERSION || !nonceText || !sealedText || rest.length > 0)
    throw new ProviderSecretUnreadableError();
  const nonce = Buffer.from(nonceText, "base64url");
  const sealed = Buffer.from(sealedText, "base64url");
  if (nonce.length !== NONCE_BYTES || sealed.length < TAG_BYTES)
    throw new ProviderSecretUnreadableError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(authSecret), nonce);
    decipher.setAAD(Buffer.from(providerId, "utf8"));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ProviderSecretUnreadableError();
  }
};
