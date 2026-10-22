import { LoginRateLimiter, type RateLimitDecision } from "../../identity/models/login-rate-limiter";
import { FEEDBACK_PER_HOUR, FEEDBACK_WINDOW_MS } from "../models/feedback";

/**
 * Counts feedback sent per person in memory, with the fixed windows sign-in and uploads use (006,
 * 037): 10 an hour. The key is the user, so signing in again doesn't make more room.
 */
export const createFeedbackLimiter = (now?: () => number) => {
  const limiter = new LoginRateLimiter({
    max: FEEDBACK_PER_HOUR,
    windowMs: FEEDBACK_WINDOW_MS,
    now,
  });
  return {
    consume: (userId: string): RateLimitDecision => limiter.consume([`feedback:${userId}`]),
  };
};

export type FeedbackLimiter = ReturnType<typeof createFeedbackLimiter>;

// Kept on globalThis, like the others, so development hot reloads reuse it.
const shared = globalThis as { __ronneFeedbackLimiter?: FeedbackLimiter };

/** The running server's feedback limiter. */
export const feedbackLimiter = (): FeedbackLimiter => {
  shared.__ronneFeedbackLimiter ??= createFeedbackLimiter();
  return shared.__ronneFeedbackLimiter;
};
