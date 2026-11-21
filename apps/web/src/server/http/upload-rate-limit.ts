import {
  createRateLimiter,
  type RateLimitDecision,
  type RateLimitStore,
} from "../rate-limit/rate-limiter";

/** At most 30 draft uploads per user in 10 minutes (037): far more than a person needs. */
export const UPLOADS_PER_WINDOW = 30;
export const UPLOAD_WINDOW_MS = 10 * 60_000;

export type UploadLimiter = { consume: (userId: string) => Promise<RateLimitDecision> };

/**
 * Counts uploads per user in fixed windows, in the instance's database (109), so every replica
 * shares the count. The key is the token's user, not the token, so making more tokens doesn't make
 * more room.
 */
export const createUploadLimiter = (store: RateLimitStore, now?: () => number): UploadLimiter => {
  const limiter = createRateLimiter({
    store,
    name: "uploads",
    max: UPLOADS_PER_WINDOW,
    windowMs: UPLOAD_WINDOW_MS,
    now,
  });
  return { consume: (userId) => limiter.consume([`user:${userId}`]) };
};

/** At most 10 submit requests per user in 10 minutes (052); each takes up to 100 drafts. */
export const SUBMITS_PER_WINDOW = 10;

/** Counts `POST /drafts/submit` requests per user, as uploads are counted. */
export const createSubmitLimiter = (store: RateLimitStore, now?: () => number): UploadLimiter => {
  const limiter = createRateLimiter({
    store,
    name: "submits",
    max: SUBMITS_PER_WINDOW,
    windowMs: UPLOAD_WINDOW_MS,
    now,
  });
  return { consume: (userId) => limiter.consume([`submit:${userId}`]) };
};
