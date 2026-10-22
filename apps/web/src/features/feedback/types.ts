import type { FeedbackProblem } from "@/server/domains/feedback/models/feedback";

/** What the Send feedback form answers (feature 127): sent, or refused with what was typed kept. */
export type FeedbackFormState = {
  done?: true;
  error?: FeedbackProblem | "rate_limited";
  /** What they had typed, put back in the form when it is refused (it also works without JavaScript). */
  kind?: string;
  message?: string;
  includePage?: boolean;
};
