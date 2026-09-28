# 013 — Submit and withdraw

> Milestone: M2 · Depends on: 012 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§2](../../MVP/MVP.md#2-personas--roles) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §6

## Goal

An author sends a finished draft for review, or withdraws it. Submitting runs every check a
reviewer would otherwise have to do by hand, so what reaches the review queue (014) is at least a
valid, complete item that fits the registry. This completes M2: "create a draft of any type, submit
it, validated by the shared schema".

## Scope

**In:**
- **Submit:** `draft` → `submitted`, after the schema and package checks (011) and the registry
  checks (below). The content is frozen from then on.
- **Withdraw:** from `draft`, `submitted` or `changes_requested` to `withdrawn`, which is final.
- **Registry checks** in the `submissions` domain, behind a `RegistryLookup` interface.
- The status on the pages from 012: a read-only view once submitted, the checks' results, and the
  submit and withdraw buttons.
- Audit events `submission.submitted` and `submission.withdrawn` (007's catalogue).
- A permission `submissions.view_submitted` (moderator and root), used by 014; in 013 it only lets
  them open a submitted submission read-only.

**Out:**
- The review queue, comments, approve, reject and request changes → 014. `changes_requested`
  appears in this feature only as a state withdraw accepts, for when 014 exists.
- Editing after submitting. A submitted submission is read-only; changes come through review
  (014's "request changes" sends it back) or by withdrawing and starting a new draft.
- Change proposals and `stale` → 017.

## Behaviour

**Statuses** (MVP §4.1): `draft`, `submitted`, `changes_requested`, `approved`, `rejected`,
`withdrawn`, `published`. 013 moves between `draft`, `submitted` and `withdrawn`; the rest belong
to 014 and 015. One function lists the allowed moves, and every service asks it.

**Withdraw** (owner decision, 2026-09-27): allowed from `draft`, `submitted` and
`changes_requested`, so an author can pull back a submission nobody has approved. Once approved,
the content is frozen for release, and it can't be withdrawn. MVP §4.1's diagram gains the
`submitted → withdrawn` arrow. A withdrawn submission stays, read-only, for history.

**Submit** (a server action, author only):
1. **Schema and package checks** from 011, on the saved files (not the browser's copy). Any error
   refuses the submit; warnings are shown and allowed.
2. **Registry checks** (manifest spec §6, layer 3):
   - the scope still exists;
   - the name is free: **no published item** has this `@scope/name`, and **no open submission**
     (`submitted`, `changes_requested` or `approved`) by anyone proposes it. Drafts don't reserve
     names;
   - each dependency **exists**, has a **type this item may depend on** (manifest spec §3), and its
     range matches **at least one published, non-yanked version**;
   - **no cycles** through the dependencies' published versions, following each dependency's
     highest matching non-yanked version (the one the resolver installs, MVP §4.3).

   Registry problems are reported like 011's issues (a code, a message, `ronne.yaml`), so a
   refused submit lists every problem at once.
3. In one transaction: the status becomes `submitted`, `submitted_at` is set, and
   `submission.submitted { name, type, dependencies }` is recorded.

**`RegistryLookup`** is the interface the registry checks use: `findItem(scope, name)` and
`publishedVersions(itemId)`. Items and versions are created by releases (015), so until then the
implementation finds none: **in M2, no item is published, so any draft with dependencies fails the
dependency check**, with a message that says the dependency must be released first. 015 replaces
the lookup with the real tables, and the checks don't change.

**Frozen content.** Once submitted, the editor opens read-only (the files, the form, and the
validation results from the submit), with a notice saying so. The save actions refuse any
submission that isn't a draft (`SubmissionNotEditableError`).

**Who sees what.** Drafts stay private to their author (012). A submitted, withdrawn or later
submission is visible to its author, and to moderators and root read-only
(`submissions.view_submitted`). Anyone else gets a 404.

**Pages** (012's, extended):
- **The editor header** shows the status and, for a draft, **Submit for review**. Submit first
  shows a confirmation that lists the checks' results (all green, or the errors to fix); on
  success, the page turns read-only.
- **Withdraw** (in the header, for the allowed statuses) asks for confirmation: "It can't be
  undone. You can start a new draft." On success, the page shows it as withdrawn.
- **My submissions** gains status filters (once there are two statuses), and shows withdrawn ones last.

**Errors** (identity-style domain errors, mapped to the dialog's `ERR:` line):
`SubmissionNotFoundError`, `SubmissionNotEditableError`, `InvalidStatusTransitionError`,
`SubmissionInvalidError` (with 011's issues), `ItemNameTakenError`, `DependencyNotFoundError`,
`DependencyTypeNotAllowedError`, `DependencyRangeUnmatchedError` and `DependencyCycleError`.

## Edge cases

- **Two drafts of the same name submitted at once:** the name check and the status change run in
  one transaction, and the second submit sees the first as an open submission and is refused.
- **The scope is gone:** scopes can't be deleted (010), but the check stays, for when they can.
- **Submitting a draft with unsaved changes in the browser:** the page asks you to save first; the
  server only ever checks saved files.
- **An author who is disabled** after submitting: the submission stays in review (014 decides). They
  can't withdraw it, since they can't sign in.
- **Withdraw twice:** the second is `InvalidStatusTransitionError`.

## Acceptance criteria

- [x] A valid draft with no dependencies submits; it becomes `submitted`, read-only, and `submission.submitted` is recorded in the same transaction.
- [x] A draft with schema or package errors can't be submitted, and the errors are listed.
- [x] The name check refuses a name proposed by another open submission (and, with 015, a published item), and two concurrent submits of one name can't both succeed.
- [x] Dependency checks refuse missing, wrong-type, unmatched and cyclic dependencies, tested with a fake `RegistryLookup`; in M2, the real lookup reports every dependency as not released yet.
- [x] Withdraw works from `draft`, `submitted` and `changes_requested`, is final, and records `submission.withdrawn`.
- [x] Only the author submits and withdraws. Moderators and root can open submitted submissions read-only; others get a 404.
- [x] Every status change goes through one transition function, with a table test of allowed and refused moves.
- [x] Playwright: create a skill draft, fix its placeholder description, submit, see it read-only, and withdraw it.

## Open questions

- None.
