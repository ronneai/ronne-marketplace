export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** One limit: its name (part of every key it counts, 109), and how many attempts in what window. */
export type Limit = { readonly name: string; readonly max: number; readonly windowMs: number };

/** One key counted under one limit. */
export type RateLimitEntry = { readonly limit: Limit; readonly key: string };

/**
 * Where counts are kept: the database in the running app (109), memory before setup (the setup
 * code, 161) and in tests. Every method takes the moment it acts at, from the limiter's clock.
 */
export type RateLimitStore = {
  /**
   * Counts the attempt against every entry, unless one is used up: then it's refused and counts
   * against none. All or nothing, however many attempts arrive at once.
   */
  consume: (entries: readonly RateLimitEntry[], now: number) => Promise<RateLimitDecision>;
  /** Whether an attempt would be allowed, without counting it. */
  check: (entries: readonly RateLimitEntry[], now: number) => Promise<RateLimitDecision>;
  /** Counts one attempt against each entry. */
  record: (entries: readonly RateLimitEntry[], now: number) => Promise<void>;
  /** Takes back one attempt counted in the window, as when it turned out not to count (107). */
  release: (entries: readonly RateLimitEntry[], now: number) => Promise<void>;
};

/**
 * A limit's counts, in fixed windows (006). Every attempt counts against each key it names: an
 * attempt is refused when any of its keys is used up, and a refused attempt doesn't count, so
 * waiting out the window always works.
 */
export type RateLimiter = {
  readonly limit: Limit;
  readonly store: RateLimitStore;
  readonly now: () => number;
  /** Counts the attempt against each key, unless one is used up: then it's refused, uncounted. */
  consume: (keys: readonly string[]) => Promise<RateLimitDecision>;
  /**
   * Whether an attempt would be allowed, without counting it. With `record` after a failure, only
   * failed attempts count (105's two-factor changes): normal use never fills the window, and once
   * failures do, even a right attempt is refused.
   */
  check: (keys: readonly string[]) => Promise<RateLimitDecision>;
  /** Counts one attempt against each key. */
  record: (keys: readonly string[]) => Promise<void>;
  /** Takes back one attempt counted with `record` or `consume` (107). */
  release: (keys: readonly string[]) => Promise<void>;
};

export type RateLimiterOptions = {
  store: RateLimitStore;
  /** Unique per limit: two limiters with one name would share their counts. */
  name: string;
  max?: number;
  windowMs?: number;
  now?: () => number;
};

/** A limiter over a store: 5 attempts a minute unless told otherwise, as sign-in has (006). */
export const createRateLimiter = ({
  store,
  name,
  max = 5,
  windowMs = 60_000,
  now = Date.now,
}: RateLimiterOptions): RateLimiter => {
  // The name goes into every key's hash before a NUL (key-hash.ts), so it can't hold one; names
  // are constants, kept to what reads well in code.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Not a rate limit name: ${name}`);
  const limit: Limit = { name, max, windowMs };
  const entries = (keys: readonly string[]) => keys.map((key) => ({ limit, key }));
  return {
    limit,
    store,
    now,
    consume: (keys) => store.consume(entries(keys), now()),
    check: (keys) => store.check(entries(keys), now()),
    record: (keys) => store.record(entries(keys), now()),
    release: (keys) => store.release(entries(keys), now()),
  };
};

/** Each limiter with the keys it counts, for `consumeAll`. */
export type LimiterKeys = readonly (readonly [RateLimiter, readonly string[]])[];

/** The store and clock every pair shares: the first limiter's. */
const shared = (pairs: LimiterKeys): { store: RateLimitStore; now: number } => {
  const first = pairs[0]?.[0];
  if (!first) throw new Error("consumeAll needs at least one limiter");
  if (pairs.some(([limiter]) => limiter.store !== first.store))
    throw new Error("consumeAll's limiters must share one store");
  return { store: first.store, now: first.now() };
};

const flatten = (pairs: LimiterKeys): RateLimitEntry[] =>
  pairs.flatMap(([limiter, keys]) => keys.map((key) => ({ limit: limiter.limit, key })));

/**
 * One attempt counted under several limits at once (the `/device` page's per-address and
 * per-person limits, 107): counted against all of them, or, when one is used up, against none.
 * They share a store; the first limiter's clock tells the time.
 */
export const consumeAll = (pairs: LimiterKeys): Promise<RateLimitDecision> => {
  const { store, now } = shared(pairs);
  return store.consume(flatten(pairs), now);
};

/** Takes back an attempt `consumeAll` counted. */
export const releaseAll = (pairs: LimiterKeys): Promise<void> => {
  const { store, now } = shared(pairs);
  return store.release(flatten(pairs), now);
};

/** The refusal for the windows that are full: the time until the latest ends, rounded up. */
export const refusal = (resetsAt: readonly number[], now: number): RateLimitDecision =>
  resetsAt.length === 0
    ? { allowed: true }
    : { allowed: false, retryAfterSeconds: Math.ceil((Math.max(...resetsAt) - now) / 1000) };
