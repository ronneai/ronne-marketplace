# 058 — Reject and request changes, from the queue and the page

> Milestone: M7 · Depends on: 014, 054, 055, 056 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: none new

## Goal

Rejecting and requesting changes exist since [014](../014-review-queue/SPEC.md): each takes a
required message, and 056 added sending an approved one back. Reviewers don't find them:

- The review queue only offers bulk **Approve** (054).
- The two decisions are only on each submission's review page, which the queue doesn't point to.
- Root looking at their own submission sees **Approve (override)** alone, with no word about the
  others.
- On the author's side, the reviewer's message is at the bottom of the page. A rejected
  submission's notice still says "Submitted for review… you can withdraw it".

This feature puts **Request changes** and **Reject**, each with a required reason, in the queue
next to each submission and always visible on the review page. It also shows the author what the
reviewer said, at the top.

## Scope

**In:**
- **The queue, per row:**
  - **Request changes** and **Reject** on each Needs review row.
  - **Request changes** on each To release row (approved, 056).
  - They open 014's decision dialog with its required reason, including 056's "Request changes on
    them too" for a rejected submission's dependents.
- **The review page:**
  - **Approve**, **Request changes** and **Reject** always show to a reviewer on a `submitted`
    submission.
  - On their own submission they're disabled, with the reason. Root keeps **Approve (override)**
    beside them.
- **The author's side:**
  - a notice at the top of the submission page with the latest decision and its message;
  - a read-only notice that fits each status;
  - My submissions shows the latest reviewer message on rows sent back or rejected.

**Out** (and where it goes instead):
- **Rejecting or requesting changes in bulk.** Each needs its own message, as 054 decided. Bulk
  stays approve-only.
- **Rejecting or requesting changes from `rmk` or the MCP server.** Reviewing by token stays out
  (054, MVP §12).
- **Root rejecting or requesting changes on their own submission.** The author withdraws instead
  ([057](../057-withdraw-archive-delete/SPEC.md)). The buttons show disabled, so it's clear why.
- **Notifications by email or webhook.** Out of scope for the MVP (MVP §14.5).
- **New decision rules.** None: the same transitions, permissions and audit events as 014 and 056.

## Behaviour

**Who may decide, one helper.** The rules in `services/review-page.ts` (`can.decide`,
`can.override`, `can.sendBack`) move into one helper, `decisionsFor(actor, submission)`. Both the
review page and each queue row use it, so they never disagree. It returns each decision with
either "allowed" or a reason:

| Decision | Allowed when | Reason shown when not |
|---|---|---|
| Approve | reviewer, not the author, `submitted`, not stale (017) | "Your own submission: another moderator or root decides." / "Rebase needed: v… is out" |
| Request changes | reviewer, not the author, `submitted` or `approved` | "Your own submission: another moderator or root decides." |
| Reject | reviewer, not the author, `submitted` | "Your own submission: another moderator or root decides." |
| Approve (override) | root, the author, `submitted` | (only shown when allowed) |

A decision that doesn't apply to the status, such as Reject on approved, isn't shown at all.

**The queue.**
- **Needs review:** each row ends with a row-actions cell holding **Request changes** and
  **Reject** (secondary and destructive, small). They are disabled with the reason on the viewer's
  own rows. The bulk checkbox and **Approve selected** (054) don't change; approving one at a time
  stays on the review page and in bulk.
- **To release:** each row gets **Request changes**, next to 055's release selection.
- **Waiting on the author** and **Decided:** no actions. Nothing can be decided there.
- **The dialog** is 014's `DecisionBar` dialog for that submission: its title, its required
  message (trimmed, at most 5,000 characters), and for Reject the submission's open dependents
  with 056's "Request changes on them too". The dependents are loaded when the dialog opens, by a
  server action over the existing `dependentsOf`, not for every row.
- On success the row leaves the tab, the nav's Needs review count drops, and a status line says
  "Requested changes on {name}" or "Rejected {name}". A refusal (someone else decided it, the
  author withdrew it) is shown in the dialog with 014's message, and the queue refreshes.
- **The queue's helper** next to the actions: "Approve, request changes or reject?", linking to
  `review#decisions`.

**The review page.**
- The header shows the decisions from `decisionsFor`, using the existing disabled-with-reason
  button (`Button`'s `disabledReason`).
- The line "This is your own submission: another moderator or root reviews it." shows whenever the
  viewer is the author of a `submitted` one, root included. Today it hides when root can override
  (`reviews/[id]/page.tsx`).

**The author's side.**
- **Top notice.** On the submission page, above the editor, for:
  - `changes_requested`: **Changes requested by {reviewer}** with the message and the date, and
    "Edit the files, then Resubmit for review." It also covers 017's rebase and 056's cascade, with
    their own wording, from the event's cause.
  - `rejected`: **Rejected by {reviewer}** with the message and the date, and "Rejected is final:
    start a new draft to try again."

  It reads the latest `request_changes`, `reject` or `rebase` event. **See the conversation** links
  to the Conversation section at the bottom.
- **Read-only notice per status**, replacing the one text for every non-editable status in
  `DraftEditor.tsx`:

  | Status | Notice |
  |---|---|
  | submitted | "Submitted for review on {date}." "Its files are frozen, so reviewers see exactly what you submitted. You can withdraw it until it's approved." |
  | approved | "Approved." "It's ready to release, by you or a moderator. It can't be withdrawn; a reviewer can still send it back." |
  | rejected | the top notice above; no second notice |
  | published | "Released as {version}." and a link to its versions |
  | withdrawn | as [057](../057-withdraw-archive-delete/SPEC.md) says |

- **My submissions.** On `changes_requested` and `rejected` rows, a second line under the name
  shows the latest reviewer message, shortened to one line (about 120 characters), with its full
  text on hover. The list loads it in the same query as the rows, not one query per row.

**Permissions and audit.** Unchanged: `submissions.review` to decide, `submissions.override` for
root's own. The decisions run through 014's `decide` and 056's `rejectWithDependents`, one
transaction each, and record `submission.changes_requested` and `submission.rejected` as today.
The audit metadata adds `via: "queue"` when decided from a queue row, as 054 adds `via: "bulk"`.

## Edge cases

- **Two reviewers decide the same row from the queue:** the row is locked in `decide`, so the
  second gets 014's "A submission that's rejected can't be rejected."-style message.
- **The author withdraws while a reviewer has the dialog open:** refused with 014's message, and
  the queue refreshes.
- **A stale proposal:** Approve is disabled with the rebase reason. Request changes and Reject stay
  allowed.
- **A dependent of the rejected one is the reviewer's own:** 056's rule, skipped and named.
- **An event with no message** (an approval): the top notice only uses request changes, reject and
  rebase, which always have a message or a cause.
- **A demoted reviewer** with the queue open: every decision is refused by the permission check.

## Documentation

- **Submitting and review → Decisions** (`review#decisions`):
  - where the decisions are (each row of the queue's Needs review tab, and the review page's
    header);
  - that Request changes and Reject need a reason the author sees at the top of their page;
  - that on your own submission they're disabled, and root approves its own as an override.
- **Approving many at once** (`review#approve-many`): "Request changes and reject stay one
  submission at a time" says where to find them: each row's actions.
- **Statuses** (`review#statuses`): `changes_requested` and `rejected` mention where the author
  reads the reviewer's message.
- **Helpers:**
  - The new queue helper above.
  - `decisions` mentions the queue rows.
  - `approve-many` points to the row actions for the other two decisions.

## Acceptance criteria

- [ ] `decisionsFor` decides the review page's and the queue's buttons. A test checks each role
  and status against the table above.
- [ ] Needs review rows offer Request changes and Reject, and To release rows offer Request changes.
  Each needs a message, follows 014's transitions and records 014's audit event with
  `via: "queue"`. Reject offers 056's choice for its dependents.
- [ ] The review page always shows the three decisions to a reviewer on `submitted`, disabled with
  the reason on their own. Root sees them disabled plus Approve (override).
- [ ] The author sees the latest request-changes, reject or rebase message at the top of the
  submission page. Each read-only status has its own notice, and none says "you can withdraw it"
  after approval.
- [ ] My submissions shows the latest reviewer message on changes-requested and rejected rows,
  loaded without one query per row.
- [ ] End-to-end tests cover:
  - a moderator rejects from a queue row and the author sees the reason at the top;
  - a moderator requests changes from a queue row, and the author resubmits;
  - a moderator sends back an approved one from To release;
  - root on its own submission sees the decisions disabled, with the reason, and the override.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **In the queue and on the page** (owner, 2026-10-02). Reviewers need Reject and Request changes
   in both places.
2. **Per row, not in bulk** (owner, 2026-10-02). Each reason is about one submission (054).
3. **Shown disabled rather than hidden** on the viewer's own submission, so the reason is visible.

## Open questions

None that change what's built.
