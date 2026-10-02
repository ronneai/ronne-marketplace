import { describe, expect, it } from "vitest";
import { InvalidStatusTransitionError } from "../exceptions/errors";
import {
  canTransition,
  isEditable,
  SUBMISSION_STATUSES,
  type SubmissionAction,
  type SubmissionStatus,
  transition,
} from "./status";

// MVP §4.1's diagram, written out: every move that's allowed. Everything else is refused.
const ALLOWED: [SubmissionStatus, SubmissionAction, SubmissionStatus][] = [
  ["draft", "submit", "submitted"],
  ["draft", "withdraw", "withdrawn"],
  ["submitted", "request_changes", "changes_requested"],
  ["submitted", "approve", "approved"],
  ["submitted", "reject", "rejected"],
  ["submitted", "withdraw", "withdrawn"],
  ["changes_requested", "resubmit", "submitted"],
  ["changes_requested", "withdraw", "withdrawn"],
  ["approved", "publish", "published"],
  ["approved", "request_changes", "changes_requested"],
];

const ACTIONS: SubmissionAction[] = [
  "submit",
  "resubmit",
  "request_changes",
  "approve",
  "reject",
  "withdraw",
  "publish",
];

describe("transition", () => {
  it.each(ALLOWED)("%s --%s--> %s", (from, action, to) => {
    expect(transition(from, action)).toBe(to);
  });

  const refused = SUBMISSION_STATUSES.flatMap((from) =>
    ACTIONS.filter((action) => !ALLOWED.some(([f, a]) => f === from && a === action)).map(
      (action) => [from, action] as const,
    ),
  );
  it.each(refused)("refuses %s --%s-->", (from, action) => {
    expect(canTransition(from, action)).toBe(false);
    expect(() => transition(from, action)).toThrow(InvalidStatusTransitionError);
  });

  it("covers every status and action", () => {
    expect(ALLOWED.length + refused.length).toBe(SUBMISSION_STATUSES.length * ACTIONS.length);
  });

  it("is final once withdrawn, rejected or published, and frozen once approved", () => {
    for (const from of ["withdrawn", "rejected", "published"] as const)
      expect(ACTIONS.filter((action) => canTransition(from, action))).toEqual([]);
    expect(canTransition("approved", "withdraw")).toBe(false);
  });

  it("says what went wrong in words", () => {
    expect(() => transition("withdrawn", "withdraw")).toThrow(
      "A submission that's withdrawn can't be withdrawn.",
    );
    expect(() => transition("changes_requested", "submit")).toThrow(
      "A submission that's sent back for changes can't be submitted.",
    );
  });

  it("lets drafts and submissions sent back for changes be edited", () => {
    expect(SUBMISSION_STATUSES.filter(isEditable)).toEqual(["draft", "changes_requested"]);
  });
});
