# 054 — Approve in bulk, with an optional message

> Milestone: M7 · Depends on: 014, 017, 052 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: none new

## Goal

Since 052, an author can export dozens of items and submit them all in one go, but a reviewer
still approves them one page at a time, and root approving their own export has to type a reason
for each one. This feature makes the approval message **optional for every approval**, and lets a
moderator or root **approve several submissions at once** from the review queue, with one optional
message applied to all of them.

## Scope

**In:**
- **The approval message is optional** for every kind of approval: **Approve** (already optional
  since 014) and root's **Approve (override)** on their own submission, which required a reason
  until now. **Request changes** and **Reject** still require a message: the author needs to know
  what to fix, or why it was closed.
- **An approve for many submissions** in the `submissions` domain: 014's `decide` run for each
  submission, each in its own transaction, so one that can't be approved doesn't stop the others.
- **The review queue** (`/reviews`, Needs review tab): a checkbox on each submission the reviewer
  may approve, **Select all**, and **Approve selected (n)** with a confirmation that lists them, shows
  their risk flags, and takes one optional message for all.

**Out** (and where it goes instead):
- **Requesting changes or rejecting in bulk.** Each needs its own message about that submission;
  the same text on many would rarely be right. Later, if reviewers ask.
- **Approving from `rmk` or the MCP server** (by token). A token that can approve would let an AI
  tool pass review on a person's behalf, which is the boundary MVP §12 protects. Not planned.
- **Releasing in bulk** after approving. Releasing is a separate step with a version bump and a tag
  per item (015).
  [055](../055-bulk-release/SPEC.md) adds releasing in bulk.
- **Approving a stale proposal.** 017's rule stays: it's rebased first, so it isn't approvable in
  bulk either (see Behaviour).

## Behaviour

**Optional message.** `decide` no longer requires a message for `override`. The dialog's hint
becomes "Optional. As root, you can approve your own submission; it's marked as an override in the
conversation and the audit log." The override is still its own event kind (`override`) and audit
action (`submission.override_approved`), with or without a reason, so the audit log shows exactly
the same thing it does today, only `metadata.message` may be missing. A message, when given, is
still trimmed and at most 5,000 characters (014's `REVIEW_MESSAGE_MAX_LENGTH`).

**Approvable.** A submission can be approved in bulk by this reviewer when the single-page
**Approve** (or **Approve (override)**) would pass now:
- its status is `submitted`;
- the reviewer isn't its author, or the reviewer is root (then it's an override, as on its page);
- it isn't a stale proposal (017: a newer version is out; it needs a rebase first).

The queue already loads each row's status, author and risk flags; staleness is added to the row.
Rows that aren't approvable have no checkbox, with the reason as its label: "Your own submission"
(a moderator's), or "Rebase needed: v1.4.0 is out" (stale).

**One at a time, inside.** Approving many runs 014's `decide` for each submission, in the order
given, **each in its own transaction**, with its row locked. So one that stopped being approvable
since the page loaded (another reviewer decided it, the author withdrew it, a newer version came
out) is refused there and reported, and the others still go through. Each is a normal approval:
its own `approve` or `override` event in the conversation, its own audit event
(`submission.approved` or `submission.override_approved`), and `via: "bulk"` in the audit metadata
so the audit log can tell bulk approvals apart.

**One message for all.** The message typed in the confirmation, if any, is the body of every
approval event, exactly as if it had been typed on each submission's page. Empty means no message
on any of them.

**Results.** For each submission, one of:

| Result | When |
|---|---|
| `approved` | approved, or approved as an override (root, own submission; `override: true`) |
| `not_found` | no submission with that id that this reviewer can see |
| `not_approvable` | its status isn't `submitted` any more, it's a moderator's own, or it's stale; with the reason, as 014's and 017's errors word it |

**The review queue (web).**
- On the **Needs review** tab, each approvable row gets a checkbox. Above the table: **Select all
  (n)** and **Approve selected (n)**, shown only when at least one row is approvable. Selection
  survives paging back and forth but not a reload. The other two tabs don't change.
- **Approve selected** opens a dialog laid out as the owner's batch review mock (2026-10-01): a
  fixed frame (640px wide, up to 720px tall) whose list scrolls on its own, so the bars above and
  below it stay in view however many are selected:
  - **on top:** a filter (by name, type or author), a checkbox with **n selected** that ticks or
    unticks every row the filter shows, and **Deselect all**;
  - **the list:** the selected submissions, each with a checkbox (ticked; unticking leaves it out),
    name, type, author and revision; **those with risk flags first**, each flag kind named
    (`hook`, `mcp_server`, `network`…), so nothing risky goes by unseen; root's own marked
    **override**;
  - **below:** "n submissions selected", with how many are root's own and recorded as overrides;
    **Message (optional)**, with the hint "Added to every approval. Once approved, the author or a
    moderator can release each one."; **Approve n submissions** and **Cancel**.
- **Item types have their own colours** (owner, 2026-10-01): every type badge in the app shows the
  type in its own hue, from the mock's scheme, as design tokens checked for contrast in both
  themes. Red and amber stay for errors and warnings, so hook is fuchsia and permission-policy
  lime, where the mock had rose and amber.
- The server action approves them (the domain's approve-many, as a session). The dialog then shows
  each result; refused ones say why, with a link to their review page. The queue refreshes, and the
  nav's Needs review count drops.
- At most **100** submissions per request, which is also more than one page of the queue.

**Permissions.** As 014: `submissions.review` (moderator, root) to approve, `submissions.override`
(root) for overrides. Nothing new.

## Edge cases

- **Two reviewers approve the same submissions at once:** each row is locked while it's decided,
  so each submission is approved once; the second reviewer gets `not_approvable` ("A submission
  that's approved can't be approved.") for the ones the first took.
- **A submission withdrawn or resubmitted** between loading the page and approving: withdrawn is
  `not_approvable`; resubmitted is approved at its newest revision, as on its page, because the
  approval is about the submission, not a revision. The dialog shows the revision it listed, and the
  result shows the revision approved, so the reviewer can see a difference.
- **A proposal goes stale** between loading and approving: `not_approvable`, with 017's message.
- **A dependency of a selected submission is also selected:** each is approved on its own; nothing
  about dependencies is checked at approval (013 checked it at submit), as on the single page.
- **A moderator selects all with their own in the list:** their own rows have no checkbox, so
  **Select all** skips them; if one arrives by id anyway, it's `not_approvable`.
- **A demoted reviewer** keeps the page open and approves: every row is refused by the permission
  check, and nothing changes.
- **An empty or whitespace-only message:** no message, as on the single page.

## Documentation

- **Submitting and review → Decisions** (`review#decisions`): the approval message is optional,
  for the override too; Request changes and Reject still need one. The override is still marked in
  the conversation and the audit log, with or without a reason.
- **Submitting and review**, a new section **Approving many at once** (`review#approve-many`),
  after Decisions: which submissions can be selected and why some can't (your own, a stale
  proposal), the risk flags listed first in the confirmation, one optional message for all, each
  approved on its own and recorded as a normal approval, and that releasing stays one at a time.
- **Submitting and review → Submitting many at once** (`review#many`): a pointer that reviewers can
  approve many at once too.
- **Helpers:** on the review queue, next to **Approve selected**: "Approve several at once?",
  linking to `review#approve-many`. In the override dialog, the hint above replaces "Required…".

## Acceptance criteria

- [x] Root's override approves with or without a reason; with none, the event has no body and the
  audit event has no `message`. Request changes and reject still refuse an empty message.
- [x] The domain approves many submissions, each in its own transaction, reporting `approved`
  (with `override` for root's own), `not_found` and `not_approvable`. One that can't be approved
  doesn't stop the others, and each approval is audited as 014's, with `via: "bulk"`.
- [x] A moderator's own submission and a stale proposal are refused, and two reviewers approving
  the same submissions at once approve each one once.
- [x] The message, when given, is the body of every approval event; when empty, none has one.
- [x] The Needs review tab shows a checkbox only on approvable rows, with the reason on the others;
  the confirmation lists risky submissions first with their flags, marks overrides, and shows each
  result after approving.
- [x] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and an end-to-end test
  approves three submissions from the queue with one message, one of them refused because it was
  withdrawn in between.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **The override reason becomes optional** (owner, 2026-10-01). 014 required it so that root's
   self-approval came with a reason in the audit log. The owner decided the approval message is
   never required; the override is still recorded as an override, so nothing is hidden. MVP §15's
   "Approval" row is unchanged (root override, audited).
2. **Reviewing in bulk** (owner, 2026-10-01): 052 left it out ("one submission at a time, on
   purpose"). This feature adds approval only, on the web only, with the risk flags in the
   confirmation; request changes, reject and approving by token stay one at a time or out.
3. **The dialog and the type colours** (owner, 2026-10-01): the batch review mock's layout, and one
   colour per item type, as above.
3. **Root's own submissions in bulk** (owner, 2026-10-01): selectable, marked as overrides in the
   confirmation and recorded as overrides, one by one.
4. **Risky submissions in bulk** (owner, 2026-10-01): allowed, listed first in the confirmation with
   each flag named.

## Open questions

1. **The limit** (100 per request) follows 052's; approving has no rate limit beyond the session's,
   as on the single page.
