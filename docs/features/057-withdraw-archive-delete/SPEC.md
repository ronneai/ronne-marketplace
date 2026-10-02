# 057 — Withdraw: archive or delete

> Milestone: M7 · Depends on: 012, 013, 014, 052, 056 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal) · Contracts: none new

## Goal

Withdrawing is final today ([013](../013-submit-withdraw/SPEC.md)). A withdrawn submission stays
read-only in My submissions for good, and deleting is a separate button in a draft's Settings
([012](../012-submission-editor/SPEC.md)). An author who exports and tries things out ends up with
a list full of closed submissions they can neither remove nor bring back. This feature makes
**Withdraw ask what to do with the submission**:

- **Archive** takes it out of the way and can be undone.
- **Delete** removes it for good, when nobody has reviewed it.

Either way, the item is no longer offered for review, and its name is free.

## Scope

**In:**
- **One Withdraw dialog with two choices:** **Archive** and **Delete for good**. Withdraw is
  allowed from the same statuses as today: `draft`, `submitted` and `changes_requested`.
- **Archived** is how the UI names the `withdrawn` status from now on. The stored value doesn't
  change, so there is no data migration and no API change.
- **Restore:** the author brings an archived submission back as a draft (`withdrawn → draft`),
  with its files, revisions and conversation.
- **Delete for good** for a submission nobody else has reviewed (defined below), from the Withdraw
  dialog. Delete is also allowed on an archived one that meets the same rule. The draft Settings'
  **Delete draft** (012) goes through the same service.
- **Archived is private to its author.** Moderators and root no longer open it.
- **My submissions** hides archived ones by default. An **Archived** filter shows them, each with
  **Restore** (and **Delete** where allowed).
- **Audit:** `submission.deleted` (for the draft Settings' delete too, which has no event today),
  `submission.restored`, and `mode: "archive"` on `submission.withdrawn`.

**Out** (and where it goes instead):
- **Withdrawing, archiving, restoring or deleting from `rmk` or the MCP server.** These stay in
  the web app, as withdraw is today ([037](../037-draft-upload-api/SPEC.md)). `GET /api/v1/drafts`
  already leaves withdrawn submissions out.
- **Withdrawing in bulk** from My submissions. Later, if authors ask.
- **Deleting a submission with review history.** The conversation is a record for reviewers too
  (014). It can only be archived.
- **Withdrawing an approved submission.** Approval still freezes the content for release (013). A
  reviewer can send it back first (056); then it can be withdrawn.
- **Deleting a published item or version.** That's yanking and deprecating (016).

## Behaviour

**The dialog.** **Withdraw** stays in the submission's header, for the author, on `draft`,
`submitted` and `changes_requested`. It opens **Withdraw {name}?** with two choices, as radio
cards, Archive selected:

- **Archive** (default): "It leaves review and My submissions' list. Find it under Archived,
  where you can restore it as a draft."
- **Delete for good**: "It's removed with its files and history. This can't be undone."
  - Disabled when the submission has review history, with the reason "Reviewers have commented on
    it or decided it. Archive it instead."
- The confirm button reads **Archive** or **Delete for good** (destructive), and **Keep it**
  cancels.
- 056's line about dependents stays, for both choices: "n submissions depend on this. They're
  blocked until another submission of {name} comes along."

**Review history.** A submission has review history when it has a `review_events` row by
anyone other than its author: a reviewer's comment, request changes, approve, reject, override, or
rebase-by-reviewer. The author's own submit, resubmit, withdraw and comments don't count. So these
can always be deleted:
- a draft that was never submitted;
- one submitted and pulled back before anyone looked.

**Archive** is 013's withdraw: `transition(status, "withdraw")` → `withdrawn`, a `withdraw`
event, and the audit event `submission.withdrawn`, now with `mode: "archive"` in its metadata.
What changes is how it's shown and who can see it:
- **Label:** `statusLabel("withdrawn")` reads **archived** everywhere a status is shown (badge,
  filters, dependency marks, help).
- **Who sees it:** `viewSubmission` lets moderators and root (`submissions.view_submitted`) open
  any status except `draft` and `withdrawn`. Others get a 404, as for a draft. The review queue
  already leaves withdrawn ones out.
- **Its name:** it doesn't hold its name, as before (`OPEN_STATUSES`).

**Delete for good** runs in one transaction:
1. It checks again that the actor is the author, the status is `draft`, `submitted`,
   `changes_requested` or `withdrawn`, and there's no review history.
2. It deletes the submission. `repository.delete` cascades to its files, revisions and events
   (`ON DELETE CASCADE`).
3. It records `submission.deleted` with `{name, from}`.

The audit log keeps that row, since `target_id` has no foreign key. A submission with a published
version is never in a deletable status, and `item_versions` would refuse it anyway (RESTRICT). On
success the author lands on My submissions, where it no longer appears.

**Restore** is a new transition: `restore: { from: ["withdrawn"], to: "draft" }`, author only.
- It adds a `restore` review event and records `submission.restored` with `{name}`.
- The submission is a draft again: editable, renamable and deletable as 012 allows. Its earlier
  revisions and conversation stay, and the next submit is the next revision, since
  `createRevision` numbers from the highest one.
- A draft doesn't hold its name. If someone else has an open submission of the name now, submit
  says so, as for any draft (013).
- A restored change proposal may be stale. 017's rebase applies as for any draft.

**My submissions.**
- The default list shows every status except archived.
- The status filters gain **Archived (n)** when there are any. With that filter, each row has
  **Restore**, and **Delete** when it has no review history; Delete asks first.
- Archived rows are no longer sorted last, since they're filtered out.

**The archived submission's page.** The author's read-only notice reads **Archived.** "It's out of
review and doesn't hold its name. Restore it to edit and submit it again." It has a **Restore**
button and, when allowed, **Delete for good**.

**Dependencies (056).**
- An archived dependency still marks its dependents **Blocked**, labelled "archived".
- A deleted one no longer exists, so its dependents read "not submitted", as for any name with no
  submission.
- Restoring makes it a draft, which doesn't count as a dependency at submit (056); its dependents
  stay blocked until it's submitted again.

**Permissions.** Only the author withdraws, archives, restores and deletes, with
`submissions.create`, as 013. Root has no override here.

## Edge cases

- **A reviewer comments while the author has the dialog open:** the delete is refused in the
  transaction with "Reviewers have commented on it or decided it. Archive it instead.", and the
  dialog switches to Archive.
- **Withdrawn twice, or restored twice:** the second is `InvalidStatusTransitionError`, as today.
- **A reviewer has the review page open when it's archived:** their decision fails with 014's
  message, and reloading gives a 404.
- **Withdrawn before this feature:** these show as archived and can be restored, or deleted when
  they have no review history.
- **A disabled author:** can't sign in, so nothing changes. Root can't delete other people's
  submissions.
- **`rmk export` after archiving:** `GET /api/v1/drafts` doesn't list archived ones, so exporting
  makes a new draft (051), as today after a withdraw.
- **The API draft quota** (`MAX_API_DRAFTS`) counts drafts. Restoring one counts against it again,
  and deleting frees a slot. The web never refuses a restore for it, as the web never refuses a new
  draft (037).

## Documentation

- **Submitting and review → Statuses** (`review#statuses`): the `withdrawn` row becomes
  **archived**: "Taken out of review by its author. Only they see it, under Archived in My
  submissions, and they can restore it as a draft."
- **Submitting and review**, a new section **Withdrawing: archive or delete**
  (`review#withdraw`), after Statuses. It covers:
  - when Withdraw is offered;
  - the two choices;
  - what review history means and why it can't be deleted;
  - restoring, and what happens to the name;
  - that the audit log keeps a deletion.
- **Dependencies in review** (`review#dependencies`) and its helper `dependents-listed`: "rejected
  or withdrawn" → "rejected or archived".
- **Helpers:**
  - In the Withdraw dialog: "Archive or delete?", linking to `review#withdraw`.
  - On My submissions' Archived filter: "What's archived?", linking to the same section.
- The export topic's "One in review… Withdraw it" line (`content.tsx`, export section) says
  "archive it".

## Acceptance criteria

- [x] Withdraw offers Archive and Delete for good, from `draft`, `submitted` and
  `changes_requested`. Delete is disabled, with the reason, when another person has a review event
  on it.
- [x] Archive sets `withdrawn`, shows "archived", records `submission.withdrawn` with
  `mode: "archive"`, and moderators and root get a 404 on it.
- [x] Restore moves `withdrawn` to `draft`, keeps files, revisions and conversation, records
  `submission.restored`, and the next submit is the next revision number.
- [x] Delete for good removes the submission with its files, revisions and events, records
  `submission.deleted`, and is refused in the transaction if review history appeared. The draft
  Settings' delete records `submission.deleted` too.
- [x] My submissions hides archived by default, shows them under an Archived filter with Restore
  and, where allowed, Delete.
- [x] Dependency marks say "archived". A deleted dependency reads "not submitted".
- [x] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and end-to-end tests
  archive, find and restore one submission, and delete another.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Archive or delete on withdraw** (owner, 2026-10-02). Withdrawing asks; this replaces 013's
   "withdrawn is final".
2. **Archived is hidden and restorable** (owner, 2026-10-02): out of the default list, private to
   the author, back as a draft on Restore.
3. **Only never-reviewed submissions can be deleted** (owner, 2026-10-02). The conversation with
   reviewers is kept; the audit log records every deletion.
4. **`withdrawn` stays the stored status.** "Archived" is its label, so the API, `rmk` and
   existing rows don't change.

## Open questions

None that change what's built.
