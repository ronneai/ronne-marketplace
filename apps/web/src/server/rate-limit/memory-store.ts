import {
  createRateLimiter,
  type RateLimitEntry,
  type RateLimiter,
  type RateLimiterOptions,
  type RateLimitStore,
  refusal,
} from "./rate-limiter";

type Bucket = { hits: number; windowStart: number; windowMs: number };

/** The entries with each limit and key once: naming a key twice counts it once, as in the database. */
export const distinct = (entries: readonly RateLimitEntry[]): RateLimitEntry[] => {
  const seen = new Map<string, RateLimitEntry>();
  for (const entry of entries) seen.set(`${entry.limit.name}\u0000${entry.key}`, entry);
  return [...seen.values()];
};

/**
 * Counts in this process's memory: for the setup code (161), where there's no database yet and one
 * server, and for tests. The running app's limits are counted in the database (109).
 */
export const createMemoryRateLimitStore = (): RateLimitStore => {
  const buckets = new Map<string, Bucket>();
  const id = (entry: RateLimitEntry) => `${entry.limit.name}\u0000${entry.key}`;
  const live = (entry: RateLimitEntry, now: number): Bucket | null => {
    const bucket = buckets.get(id(entry));
    return bucket && now - bucket.windowStart < bucket.windowMs ? bucket : null;
  };
  // Bounded by the attempts in one window, so a flood of new keys can't grow it for ever.
  const prune = (now: number) => {
    for (const [key, bucket] of buckets)
      if (now - bucket.windowStart >= bucket.windowMs) buckets.delete(key);
  };
  const decide = (entries: readonly RateLimitEntry[], now: number) => {
    prune(now);
    const resetsAt: number[] = [];
    for (const entry of distinct(entries)) {
      const bucket = live(entry, now);
      if (bucket && bucket.hits >= entry.limit.max)
        resetsAt.push(bucket.windowStart + bucket.windowMs);
    }
    return refusal(resetsAt, now);
  };
  const record = (entries: readonly RateLimitEntry[], now: number) => {
    for (const entry of distinct(entries)) {
      const bucket = live(entry, now);
      if (bucket) bucket.hits += 1;
      else buckets.set(id(entry), { hits: 1, windowStart: now, windowMs: entry.limit.windowMs });
    }
  };
  return {
    consume: async (entries, now) => {
      const decision = decide(entries, now);
      if (decision.allowed) record(entries, now);
      return decision;
    },
    check: async (entries, now) => decide(entries, now),
    record: async (entries, now) => record(entries, now),
    release: async (entries, now) => {
      for (const entry of distinct(entries)) {
        const bucket = live(entry, now);
        if (bucket && bucket.hits > 0) bucket.hits -= 1;
      }
    },
  };
};

/** A limiter with a memory store of its own: what a test needs to keep a limit out of the way. */
export const memoryRateLimiter = (options: Omit<RateLimiterOptions, "store">): RateLimiter =>
  createRateLimiter({ ...options, store: createMemoryRateLimitStore() });
