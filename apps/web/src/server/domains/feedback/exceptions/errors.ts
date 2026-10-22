import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
import type { FeedbackProblem } from "../models/feedback";

/** Errors feedback raises (feature 127). Pages turn them into words. */
export class FeedbackError extends Error {
  override readonly name: string = "FeedbackError";
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

/** The form was not filled in right; `problem` says how, for the screen's own words. */
export class InvalidFeedbackError extends FeedbackError {
  override readonly name: string = "InvalidFeedbackError";
  constructor(readonly problem: FeedbackProblem) {
    super(
      problem === "kind_required"
        ? "Choose what kind of feedback this is."
        : problem === "message_required"
          ? "Write a message."
          : "That message is too long.",
    );
  }
}

/** Too many messages from one person in the hour. */
export class FeedbackLimitError extends FeedbackError {
  override readonly name: string = "FeedbackLimitError";
  constructor(readonly max: number) {
    super(`You can send ${max} messages an hour. Try again later.`);
  }
}
