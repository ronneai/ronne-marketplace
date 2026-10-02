import { describe, expect, it } from "vitest";
import { InvalidStatusTransitionError } from "../exceptions/errors";
import {
  canTransition,
  isEditable,
  SUBMISSION_STATUSES,
  type SubmissionAction,
  type SubmissionStatus,
  statusLabel,
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
  ["withdrawn", "restore", "draft"],
];

const ACTIONS: SubmissionAction[] = [
  "submit",
  "resubmit",
  "request_changes",
  "approve",
  "reject",
  "withdraw",
  "restore",
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

  it("is final once rejected or published, frozen once approved, and archived can be restored", () => {
    for (const from of ["rejected", "published"] as const)
      expect(ACTIONS.filter((action) => canTransition(from, action))).toEqual([]);
    expect(ACTIONS.filter((action) => canTransition("withdrawn", action))).toEqual(["restore"]);
    expect(canTransition("approved", "withdraw")).toBe(false);
  });

  it("says what went wrong in words", () => {
    expect(() => transition("withdrawn", "withdraw")).toThrow(
      "A submission that's archived can't be withdrawn.",
    );
    expect(() => transition("draft", "restore")).toThrow(
      "A submission that's draft can't be restored.",
    );
    expect(() => transition("changes_requested", "submit")).toThrow(
      "A submission that's sent back for changes can't be submitted.",
    );
  });

  it("labels withdrawn as archived (057)", () => {
    expect(statusLabel("withdrawn")).toBe("archived");
    expect(statusLabel("changes_requested")).toBe("changes requested");
  });

  it("lets drafts and submissions sent back for changes be edited", () => {
    expect(SUBMISSION_STATUSES.filter(isEditable)).toEqual(["draft", "changes_requested"]);
  });
});
