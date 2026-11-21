import { createMemoryRateLimitStore } from "../rate-limit/memory-store";
import { createRateLimiter, type RateLimitDecision } from "../rate-limit/rate-limiter";

/** At most 10 wrong setup codes per address, and 30 in all, in 10 minutes (161). */
export const SETUP_CODES_PER_ADDRESS = 10;
export const SETUP_CODES_IN_ALL = 30;
export const SETUP_CODE_WINDOW_MS = 10 * 60_000;

/**
 * Counts wrong setup codes in this process's memory, in fixed windows (006). Every other limit is
 * counted in the database (109), but before setup there's no database to count in, and the server
 * being set up is one process. Only wrong codes count, and the right code is never limited
 * (`codeRefusal`): past either limit, a wrong code gets its own answer and no log line. The total
 * holds when the address isn't known (no TRUST_PROXY behind a proxy) or changes with every guess.
 */
export const createSetupCodeLimiter = (now?: () => number) => {
  const store = createMemoryRateLimitStore();
  const perAddress = createRateLimiter({
    store,
    name: "setup-code",
    max: SETUP_CODES_PER_ADDRESS,
    windowMs: SETUP_CODE_WINDOW_MS,
    now,
  });
  const inAll = createRateLimiter({
    store,
    name: "setup-code-all",
    max: SETUP_CODES_IN_ALL,
    windowMs: SETUP_CODE_WINDOW_MS,
    now,
  });
  const keys = (ip: string | null) => (ip ? [`ip:${ip}`] : []);
  return {
    /** Whether a code may be checked now, from this address. */
    check: async (ip: string | null): Promise<RateLimitDecision> => {
      const all = await inAll.check(["all"]);
      const one = await perAddress.check(keys(ip));
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
    recordWrong: async (ip: string | null): Promise<void> => {
      await inAll.record(["all"]);
      await perAddress.record(keys(ip));
    },
  };
};

export type SetupCodeLimiter = ReturnType<typeof createSetupCodeLimiter>;

// Kept on globalThis, so development hot reloads reuse it: before setup, memory is all there is.
const shared = globalThis as { __ronneSetupCodeLimiter?: SetupCodeLimiter };

/** The running server's setup code limiter. */
export const setupCodeLimiter = (): SetupCodeLimiter => {
  shared.__ronneSetupCodeLimiter ??= createSetupCodeLimiter();
  return shared.__ronneSetupCodeLimiter;
};
