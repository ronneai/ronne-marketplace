import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TOTP as Better Auth checks it (RFC 6238: HMAC-SHA1, 6 digits, 30-second periods, one period
 * either side), for the one place Ronne checks a code without a session or a sign-in challenge:
 * the two-factor step of a forgotten-password reset (194). Better Auth's own check needs either.
 */

const PERIOD_MS = 30_000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_PREFIX = "base32:";

/** RFC 4648 base32 (no padding, any case) to bytes; null when it isn't base32. */
export const base32Bytes = (text: string): Buffer | null => {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/**
 * The HMAC key of a decrypted secret, as Better Auth reads it: a generated secret's UTF-8 bytes,
 * or an imported one stored as `base32:<secret>` decoded.
 */
export const totpKey = (secret: string): Buffer | null =>
  secret.startsWith(BASE32_PREFIX)
    ? base32Bytes(secret.slice(BASE32_PREFIX.length))
    : Buffer.from(secret, "utf8");

const hotp = (key: Buffer, counter: number): string => {
  const block = Buffer.alloc(8);
  block.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(block).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
};

/**
 * Whether `code` is the key's code for the period at `now` or one either side. Every period is
 * computed and compared in constant time, so the time taken doesn't say which one matched.
 */
export const totpMatches = (key: Buffer, code: string, now: number): boolean => {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / PERIOD_MS);
  let matched = false;
  for (const step of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(key, counter + step));
    matched = timingSafeEqual(expected, Buffer.from(code)) || matched;
  }
  return matched;
};
