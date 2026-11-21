import { createHmac, hkdfSync } from "node:crypto";
import type { RateLimitEntry } from "./rate-limiter";

/** The HKDF `info` for the counters' key: its own, so it's no other key Ronne derives. */
const INFO = "ronne rate-limit keys v1";

const keys = new Map<string, Buffer>();

const keyFor = (authSecret: string): Buffer => {
  let key = keys.get(authSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), INFO, 32));
    // One instance has one secret; a test making many keeps this small.
    if (keys.size >= 8) keys.clear();
    keys.set(authSecret, key);
  }
  return key;
};

/**
 * A counter's row key (109): HMAC-SHA256 of the limit's name and the key, under a key HKDF-SHA256
 * derives from AUTH_SECRET, in hex. The table never holds an email, an address or an ID: a plain
 * hash of every IPv4 address takes minutes, a keyed one needs the secret. The name keeps two
 * limits apart when they count the same key.
 */
export const rateLimitKeyHash = (authSecret: string, entry: RateLimitEntry): string =>
  createHmac("sha256", keyFor(authSecret))
    .update(`${entry.limit.name}\u0000${entry.key}`, "utf8")
    .digest("hex");
