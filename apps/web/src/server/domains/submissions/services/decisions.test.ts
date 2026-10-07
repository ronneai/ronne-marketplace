import { describe, expect, it } from "vitest";
import type { Memberships } from "../../identity/models/user";
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
