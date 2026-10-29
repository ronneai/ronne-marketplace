import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * A secret sealed at rest (106, 136): AES-256-GCM under a key HKDF-SHA256 derives from AUTH_SECRET
 * and a purpose (`info`), a fresh 12-byte nonce per value, and what the value belongs to as
 * associated data, so a value copied onto another row or setting doesn't open. Stored as
 * `v1.<nonce>.<ciphertext and tag>`, base64url. Node.js's own crypto only.
 */
const VERSION = "v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
// Node.js's base64url decoder skips what isn't base64url: only exact values are opened.
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** What a sealed value is for: its HKDF `info`, and what it's bound to. */
export type SealPurpose = { info: string; boundTo: string };

/** The value doesn't open: another AUTH_SECRET sealed it, it belongs elsewhere, or it's damaged. */
export class SealedValueUnreadableError extends Error {
  override readonly name: string = "SealedValueUnreadableError";
  constructor() {
    super("The stored secret can't be read with this instance's AUTH_SECRET.");
  }
}

const keyFrom = (authSecret: string, info: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), info, 32));

export const seal = (authSecret: string, purpose: SealPurpose, value: string): string => {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret, purpose.info), nonce);
  cipher.setAAD(Buffer.from(purpose.boundTo, "utf8"));
  const sealed = Buffer.concat([cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${nonce.toString("base64url")}.${sealed.toString("base64url")}`;
};

/** The value, or SealedValueUnreadableError. */
export const open = (authSecret: string, purpose: SealPurpose, stored: string): string => {
  const [version, nonceText, sealedText, ...rest] = stored.split(".");
  if (
    version !== VERSION ||
    !nonceText ||
    !sealedText ||
    rest.length > 0 ||
    !BASE64URL.test(nonceText) ||
    !BASE64URL.test(sealedText)
  )
    throw new SealedValueUnreadableError();
  const nonce = Buffer.from(nonceText, "base64url");
  const sealed = Buffer.from(sealedText, "base64url");
  if (nonce.length !== NONCE_BYTES || sealed.length < TAG_BYTES)
    throw new SealedValueUnreadableError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(authSecret, purpose.info), nonce);
    decipher.setAAD(Buffer.from(purpose.boundTo, "utf8"));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SealedValueUnreadableError();
  }
};

/** The stored value under a new AUTH_SECRET, or null when the old one can't open it. */
export const reseal = (
  from: string,
  to: string,
  purpose: SealPurpose,
  stored: string,
): string | null => {
  try {
    return seal(to, purpose, open(from, purpose, stored));
  } catch (error) {
    if (error instanceof SealedValueUnreadableError) return null;
    throw error;
  }
};
