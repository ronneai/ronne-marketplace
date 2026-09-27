export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { count: number; windowStart: number };

/**
 * Counts sign-in attempts in fixed windows, in memory (one Ronne instance, the MVP's model).
 *
 * Every attempt counts against each key it names: the email always, and the client IP when it can
 * be trusted. An attempt is refused when any of its keys is used up, and a refused attempt doesn't
 * count, so waiting out the window always works.
 */
export class LoginRateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #max: number;
  readonly #windowMs: number;
  readonly #now: () => number;

  constructor({
    max = 5,
    windowMs = 60_000,
    now = Date.now,
  }: { max?: number; windowMs?: number; now?: () => number } = {}) {
    this.#max = max;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  consume(keys: readonly string[]): RateLimitDecision {
    const now = this.#now();
    this.#prune(now);

    const live = keys.map((key) => {
      const bucket = this.#buckets.get(key);
      return { key, bucket: bucket && now - bucket.windowStart < this.#windowMs ? bucket : null };
    });
    const full = live.filter(({ bucket }) => bucket && bucket.count >= this.#max);
    if (full.length > 0) {
      const resetsAt = Math.max(
        ...full.map(({ bucket }) => (bucket?.windowStart ?? now) + this.#windowMs),
      );
      return { allowed: false, retryAfterSeconds: Math.ceil((resetsAt - now) / 1000) };
    }

    for (const { key, bucket } of live) {
      if (bucket) bucket.count += 1;
      else this.#buckets.set(key, { count: 1, windowStart: now });
    }
    return { allowed: true };
  }

  #prune(now: number) {
    // Bounded by the attempts in one window, so a flood of new keys can't grow it for ever.
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.windowStart >= this.#windowMs) this.#buckets.delete(key);
    }
  }
}

/** The limiter keys for one attempt: the email, and the IP when it's known. */
export function loginRateLimitKeys(email: string, ip: string | null): string[] {
  return ip ? [`email:${email}`, `ip:${ip}`] : [`email:${email}`];
}
