import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";

/** Errors the scans domain raises (137). Pages turn them into words with `errorText`. */
export class ScansError extends Error {
  override readonly name: string = "ScansError";
  // Its messages are for people: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

/** The longest reason for marking a finding a false positive. */
export const DISMISSAL_REASON_MAX_LENGTH = 500;

/** A false positive needs a reason, so the other reviewers know why, and a short one. */
export class DismissalReasonError extends ScansError {
  override readonly name: string = "DismissalReasonError";
  constructor(readonly reason: "required" | "too_long") {
    super(
      reason === "required"
        ? "Say why it's a false positive, so the other reviewers know."
        : `A reason can have at most ${DISMISSAL_REASON_MAX_LENGTH} characters.`,
    );
  }
}

/** The scan or the finding isn't there, or isn't the viewer's to see. */
export class FindingNotFoundError extends ScansError {
  override readonly name: string = "FindingNotFoundError";
  constructor() {
    super("That finding no longer exists, or you can't see it.");
  }
}

/** The finding is marked already (by someone else, say, since the page loaded). */
export class FindingDismissedError extends ScansError {
  override readonly name: string = "FindingDismissedError";
  constructor() {
    super("That finding is already marked, as a false positive or an accepted risk.");
  }
}

/** A mark is a false positive or an accepted risk (137); nothing else. */
export class DismissalKindError extends ScansError {
  override readonly name: string = "DismissalKindError";
  constructor() {
    super("Mark it as a false positive or as an accepted risk.");
  }
}

/** Only the submission's reviewers mark findings, never its author. */
export class NotScanReviewerError extends ScansError {
  override readonly name: string = "NotScanReviewerError";
  constructor() {
    super("Only the submission's reviewers mark findings as false positives, never its author.");
  }
}
