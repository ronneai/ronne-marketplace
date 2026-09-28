# 014 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration `0006_reviews`.** `review_events`, `submission_revisions` and
  `submission_revision_files`, with their Kysely types.
  *Done when:* it migrates on SQLite and the three servers, with foreign-key tests.

- [x] **2. Risk flags in `packages/core`.** `riskFlags(manifest, files)` for each kind in the spec,
  with the file and line each is about.
  *Done when:* a test per flag, including a clean item with none and a policy whose `allow` rules are
  listed as widening.

- [x] **3. Revisions and resubmit.** Snapshot on submit and resubmit, `changes_requested` editable,
  `resubmit` through 013's checks, and submit, resubmit and withdraw events in the thread.
  *Done when:* database tests cover the snapshots, resubmit's checks, and that later edits don't change
  a revision.

- [x] **4. Decisions and comments.** The permissions, approve / request changes / reject / override,
  comments, the row lock, and the audit events.
  *Done when:* database tests cover each decision and who may take it, required messages, the
  override, and two concurrent decisions on all four databases.

- [x] **5. Diff.** A line diff per file between two revisions (the chosen library or our own), with
  added, removed, changed and binary files, and the size limit.
  *Done when:* unit tests cover each case, including a diff too large to show.

- [ ] **6. The queue.** `/reviews` with its three tabs, the risk badge, and the nav item and count.
  *Done when:* render and action tests pass.

- [ ] **7. The review page.** Header, risk summary with links, files (changes or all), checks, the
  conversation, and the decision dialogs; the author's page shows the conversation and flags.
  *Done when:* render tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 014 without answering the
  spec's open questions, so it follows them: changes requested is editable with a diff since the
  last revision, one thread, the author may reply, and a diff library through the checklist.
- **Task 1 (2026-09-28): migration `0006_reviews`.** `submission_revisions` (unique per submission
  and number), `submission_revision_files` (the shape of `submission_files`, paths compared exactly
  with `exactString`), and `review_events` (indexed by submission and time). Revisions and events
  cascade with their submission; the users behind them are RESTRICT. Tested on all four databases.
- **Task 2 (2026-09-28): risk flags.** `riskFlags(manifest, files)` in `packages/core`, exported
  for the web app and later `rmk info`. Each flag has a kind, one sentence with `backticked` code,
  and the file and line it's about (the manifest line for type flags, found by the value it
  quotes). A policy's `allow` rules come first and are marked `widening`. An executable shell
  script is one `executable` flag, not two. Each host is listed once, where it first appears. A
  test per kind, and a plain rule with no flags.
- **Task 3 (2026-09-28): revisions and resubmit.**
  - `submitDraft` handles both: `submit` for a draft, `resubmit` for one sent back for changes
    (`checkSubmission` picks the same way). After 013's checks it snapshots the saved files as the
    next revision (`createRevision`, numbered 1, 2, …), adds a `submit` or `resubmit` event, and
    records `submission.submitted` or the new `submission.resubmitted` with the revision number.
    `submitted_at` keeps the first submit's time, so the queue shows how long it has waited.
  - Withdraw adds a `withdraw` event with the latest revision (none for a draft never submitted).
    The spec's event kinds gain `submit` (MVP §10 too).
  - `isEditable` is now `draft` or `changes_requested`: saving and importing use it. Renaming and
    deleting stay draft-only (`ownDraft`), and the editor shows Settings for drafts only.
  - The editor offers **Resubmit for review** when changes were requested, through the same dialog.
  - Database tests on all four databases: the snapshot doesn't change with later edits, resubmit
    makes revision 2 and re-runs the checks, editing is allowed only when changes are requested,
    and the conversation records submit, resubmit and withdraw.
- **Task 4 (2026-09-28): decisions and comments.**
  - `services/reviews.ts`: `decide` (approve, request changes, reject, override) and `comment`.
    Each locks the submission's row (`lockSubmission`, `FOR UPDATE` in the READ COMMITTED
    transaction from 013), reads its status fresh, goes through `transition`, adds an event with
    the latest revision, and records the audit event, in one transaction.
  - Permissions `submissions.review` (moderator, root) and `submissions.override` (root). A reviewer
    deciding on their own submission gets `OwnSubmissionError`, which tells root about the
    override; root using the override on someone else's gets `OverrideNotNeededError`.
  - Messages: required to request changes, reject or override (`ReviewMessageError`), up to
    5,000 characters. Audit events `submission.approved`, `.changes_requested`, `.rejected` and
    `.override_approved`, with the message.
  - Comments: reviewers on any submission under review, the author on their own; drafts and closed
    submissions refuse them (`ConversationClosedError`). Not audited.
  - MVP §2's matrix now lets the author comment on their own submission (the spec's
    recommendation).
  - Database tests on all four databases, including two moderators deciding at the same moment.
- **Task 5 (2026-09-28): diff.**
  - **The dependency checklist** (policy §3): `diff` 9.0.0 (jsdiff), BSD-3-Clause, released
    2026-04-13, no dependencies, no install scripts, its own types. `pnpm licenses:check` and
    `pnpm audit` pass. It's in `apps/web` only, since only the review page uses it.
  - `models/diff.ts`: `diffRevisions(before, after)` lists added, removed and changed files in path
    order (unchanged ones are left out), with hunks of 3 context lines and line numbers on each
    side from `structuredPatch`. Binary files show only that they changed; a flipped executable
    flag is its own change. A file over 2,000 lines on either side is `too_large`. `before` null
    (a first revision) lists every file as added.
