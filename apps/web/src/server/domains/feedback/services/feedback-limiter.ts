import {
  createRateLimiter,
  type RateLimitDecision,
  type RateLimitStore,
} from "../../../rate-limit/rate-limiter";
import { FEEDBACK_PER_HOUR, FEEDBACK_WINDOW_MS } from "../models/feedback";

export type FeedbackLimiter = { consume: (userId: string) => Promise<RateLimitDecision> };

/**
 * Counts feedback sent per person, 10 an hour, in the instance's database (109), so every replica
 * shares the count. The key is the user, so signing in again doesn't make more room.
 */
export const createFeedbackLimiter = (
  store: RateLimitStore,
  now?: () => number,
): FeedbackLimiter => {
  const limiter = createRateLimiter({
    store,
    name: "feedback",
    max: FEEDBACK_PER_HOUR,
    windowMs: FEEDBACK_WINDOW_MS,
    now,
  });
  return { consume: (userId) => limiter.consume([`feedback:${userId}`]) };
};
