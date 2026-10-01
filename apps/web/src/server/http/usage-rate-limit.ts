import {
  LoginRateLimiter,
  type RateLimitDecision,
} from "../domains/identity/models/login-rate-limiter";

/**
 * At most 60 usage reports per user in 10 minutes (046). `rmk` sends one per command at most, so
 * a person never reaches it; a broken or hostile client does.
 */
export const USAGE_REPORTS_PER_WINDOW = 60;
export const USAGE_WINDOW_MS = 10 * 60_000;

/** Counts reports per user in memory, keyed by the token's user like the upload limiter (037). */
export const createUsageLimiter = (now?: () => number) => {
  const limiter = new LoginRateLimiter({
    max: USAGE_REPORTS_PER_WINDOW,
    windowMs: USAGE_WINDOW_MS,
    now,
  });
  return {
    consume: (userId: string): RateLimitDecision => limiter.consume([`usage:${userId}`]),
  };
};

export type UsageLimiter = ReturnType<typeof createUsageLimiter>;

// Kept on globalThis, like the other limiters, so development hot reloads reuse it.
const shared = globalThis as { __ronneUsageLimiter?: UsageLimiter };

/** The running server's usage limiter. */
export const usageLimiter = (): UsageLimiter => {
  shared.__ronneUsageLimiter ??= createUsageLimiter();
  return shared.__ronneUsageLimiter;
};
