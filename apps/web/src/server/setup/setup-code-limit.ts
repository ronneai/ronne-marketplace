import {
  LoginRateLimiter,
  type RateLimitDecision,
} from "../domains/identity/models/login-rate-limiter";

/** At most 10 wrong setup codes per address, and 30 in all, in 10 minutes (161). */
export const SETUP_CODES_PER_ADDRESS = 10;
export const SETUP_CODES_IN_ALL = 30;
export const SETUP_CODE_WINDOW_MS = 10 * 60_000;

/**
 * Counts wrong setup codes in memory, with the fixed windows sign-in uses (006; 109 moves them to
 * the database). Only wrong codes count, so typing the right one never fills the window; once
 * either limit is reached, even the right code waits. The total holds when the address isn't known
 * (no TRUST_PROXY behind a proxy) or changes with every guess.
 */
export const createSetupCodeLimiter = (now?: () => number) => {
  const perAddress = new LoginRateLimiter({
    max: SETUP_CODES_PER_ADDRESS,
    windowMs: SETUP_CODE_WINDOW_MS,
    now,
  });
  const inAll = new LoginRateLimiter({
    max: SETUP_CODES_IN_ALL,
    windowMs: SETUP_CODE_WINDOW_MS,
    now,
  });
  const keys = (ip: string | null) => (ip ? [`setup-code:${ip}`] : []);
  return {
    /** Whether a code may be checked now, from this address. */
    check: (ip: string | null): RateLimitDecision => {
      const all = inAll.check(["setup-code"]);
      const one = perAddress.check(keys(ip));
      if (all.allowed && one.allowed) return { allowed: true };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          all.allowed ? 0 : all.retryAfterSeconds,
          one.allowed ? 0 : one.retryAfterSeconds,
        ),
      };
    },
    /** Counts a wrong code. */
    recordWrong: (ip: string | null): void => {
      inAll.record(["setup-code"]);
      perAddress.record(keys(ip));
    },
  };
};

export type SetupCodeLimiter = ReturnType<typeof createSetupCodeLimiter>;

// Kept on globalThis, like the other limiters, so development hot reloads reuse it.
const shared = globalThis as { __ronneSetupCodeLimiter?: SetupCodeLimiter };

/** The running server's setup code limiter. */
export const setupCodeLimiter = (): SetupCodeLimiter => {
  shared.__ronneSetupCodeLimiter ??= createSetupCodeLimiter();
  return shared.__ronneSetupCodeLimiter;
};
