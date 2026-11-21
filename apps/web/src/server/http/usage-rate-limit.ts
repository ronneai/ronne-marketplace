import {
  createRateLimiter,
  type RateLimitDecision,
  type RateLimitStore,
} from "../rate-limit/rate-limiter";

/**
 * At most 60 usage reports per user in 10 minutes (046). `rmk` sends one per command at most, so
 * a person never reaches it; a broken or hostile client does.
 */
export const USAGE_REPORTS_PER_WINDOW = 60;
export const USAGE_WINDOW_MS = 10 * 60_000;

export type UsageLimiter = { consume: (userId: string) => Promise<RateLimitDecision> };

/**
 * Counts reports per user in the instance's database (109), keyed by the token's user like the
 * upload limiter (037).
 */
export const createUsageLimiter = (store: RateLimitStore, now?: () => number): UsageLimiter => {
  const limiter = createRateLimiter({
    store,
    name: "usage",
    max: USAGE_REPORTS_PER_WINDOW,
    windowMs: USAGE_WINDOW_MS,
    now,
  });
  return { consume: (userId) => limiter.consume([`usage:${userId}`]) };
};
