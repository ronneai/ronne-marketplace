import { describe, expect, it } from "vitest";
import type { Memberships } from "../../identity/models/user";
import type { ScanGate } from "../models/scan-gate";
import type { SubmissionStatus } from "../models/status";
import { allows, decisionsFor, OWN_SUBMISSION_REASON } from "./decisions";

/** `moderator` and `user` are roles in `global` (091). */
type Role = "root" | "moderator" | "user";
const actor = (role: Role, id = "viewer") => ({
  user: {
    id,
    email: `${id}@example.com`,
    name: id,
    role: role === "root" ? ("root" as const) : ("user" as const),
    workspaces: (role === "root" ? {} : { global: role }) as Memberships,
  },
  ip: null,
});
const submission = (
  status: SubmissionStatus,
  authorId = "author",
  stale: string | null = null,
) => ({
  status,
  authorId,
  stale,
  workspace: { id: "global" },
});
/** Each decision as `name` or `name (reason)`, in order. */
const shown = (role: Role, status: SubmissionStatus, mine = false, stale: string | null = null) =>
  decisionsFor(actor(role, mine ? "author" : "viewer"), submission(status, "author", stale)).map(
    (option) => (option.allowed ? option.decision : `${option.decision} (${option.reason})`),
  );

describe("decisionsFor (058)", () => {
  it("gives a reviewer the three decisions on someone else's submitted one", () => {
    for (const role of ["moderator", "root"] as const)
      expect(shown(role, "submitted")).toEqual(["approve", "request_changes", "reject"]);
  });

  it("shows them disabled on the reviewer's own, with root's override beside them", () => {
    const own = (decision: string) => `${decision} (${OWN_SUBMISSION_REASON})`;
    expect(shown("moderator", "submitted", true)).toEqual([
      own("approve"),
      own("request_changes"),
      own("reject"),
    ]);
    expect(shown("root", "submitted", true)).toEqual([
      own("approve"),
      own("request_changes"),
      own("reject"),
      "override",
    ]);
  });

  it("keeps approving a stale proposal off until it's rebased, but not the other two", () => {
    expect(shown("moderator", "submitted", false, "1.4.0")).toEqual([
      "approve (Rebase needed: 1.4.0 is out)",
      "request_changes",
      "reject",
    ]);
    expect(shown("root", "submitted", true, "1.4.0").at(-1)).toBe(
      "override (Rebase needed: 1.4.0 is out)",
    );
  });

  it("offers only Request changes on an approved one (056)", () => {
    expect(shown("moderator", "approved")).toEqual(["request_changes"]);
    expect(shown("moderator", "approved", true)).toEqual([
      `request_changes (${OWN_SUBMISSION_REASON})`,
    ]);
  });

  it("offers nothing where nothing can be decided, nor to a user", () => {
    for (const status of [
      "draft",
      "changes_requested",
      "rejected",
      "withdrawn",
      "published",
    ] as const)
      expect(shown("moderator", status)).toEqual([]);
    expect(shown("user", "submitted")).toEqual([]);
  });

  it("tells whether a decision is listed and allowed", () => {
    const options = decisionsFor(actor("moderator", "author"), submission("submitted"));
    expect(allows(options, "reject")).toBe(false);
    expect(allows(decisionsFor(actor("moderator"), submission("submitted")), "reject")).toBe(true);
    expect(allows(options, "override")).toBe(false);
  });
});

describe("decisionsFor with the security scan's gate (137)", () => {
  const blocked = {
    blocked: true as const,
    by: "score" as const,
    score: 90,
    threshold: 70,
  };
  const REASON =
    "Approval is blocked: the security scan's score, 90, is at or above the threshold, 70.";
  const gated = (role: Role, mine = false, gate: ScanGate = blocked) =>
    decisionsFor(actor(role, mine ? "author" : "viewer"), {
      ...submission("submitted"),
      gate,
    }).map((option) =>
      option.allowed ? option.decision : `${option.decision} (${option.reason})`,
    );

  it("disables a moderator's Approve with the reason, and leaves the other two", () => {
    expect(gated("moderator")).toEqual([`approve (${REASON})`, "request_changes", "reject"]);
  });

  it("gives root the scan override beside the disabled Approve", () => {
    expect(gated("root")).toEqual([
      `approve (${REASON})`,
      "request_changes",
      "reject",
      "scan_override",
    ]);
  });

  it("puts the scan override in place of 054's override on root's own submission", () => {
    const own = (decision: string) => `${decision} (${OWN_SUBMISSION_REASON})`;
    expect(gated("root", true)).toEqual([
      own("approve"),
      own("request_changes"),
      own("reject"),
      "scan_override",
    ]);
  });

  it("changes nothing when the gate is open", () => {
    expect(gated("root", false, { blocked: false, threshold: 70 })).toEqual([
      "approve",
      "request_changes",
      "reject",
    ]);
  });

  it("keeps the scan override off for a stale proposal until it's rebased", () => {
    const options = decisionsFor(actor("root"), {
      ...submission("submitted", "author", "1.4.0"),
      gate: blocked,
    });
    expect(options.find((o) => o.decision === "scan_override")).toMatchObject({ allowed: false });
  });
});
