import {
  LoginRateLimiter,
  type RateLimitDecision,
} from "../domains/identity/models/login-rate-limiter";

/** At most 30 draft uploads per user in 10 minutes (037): far more than a person needs. */
export const UPLOADS_PER_WINDOW = 30;
export const UPLOAD_WINDOW_MS = 10 * 60_000;

/**
 * Counts uploads per user in memory, with the fixed windows sign-in uses (006). The key is the
 * token's user, not the token, so making more tokens doesn't make more room.
 */
export const createUploadLimiter = (now?: () => number) => {
  const limiter = new LoginRateLimiter({
    max: UPLOADS_PER_WINDOW,
    windowMs: UPLOAD_WINDOW_MS,
    now,
  });
  return {
    consume: (userId: string): RateLimitDecision => limiter.consume([`user:${userId}`]),
  };
};

export type UploadLimiter = ReturnType<typeof createUploadLimiter>;

// Kept on globalThis, like the login limiter, so development hot reloads reuse it.
const shared = globalThis as { __ronneUploadLimiter?: UploadLimiter };

/** The running server's upload limiter. */
export const uploadLimiter = (): UploadLimiter => {
  shared.__ronneUploadLimiter ??= createUploadLimiter();
  return shared.__ronneUploadLimiter;
};
