import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decodes the RFC 4648 base32 of an `otpauth://` secret (no padding, any case). */
const base32 = (text: string): Buffer => {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`not base32: ${char}`);
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
 * The 6-digit code an authenticator app shows for an `otpauth://totp/…?secret=…` URI (RFC 6238:
 * HMAC-SHA1, 30-second steps), at `at` (now by default) and `step` periods away. For tests only:
 * the app's own codes come from Better Auth.
 */
export const totpCode = (uri: string, { at = Date.now(), step = 0 } = {}): string => {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("no secret in the URI");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000) + step));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
};
