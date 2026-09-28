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

- [ ] **3. Revisions and resubmit.** Snapshot on submit and resubmit, `changes_requested` editable,
  `resubmit` through 013's checks, and submit, resubmit and withdraw events in the thread.
  *Done when:* database tests cover the snapshots, resubmit's checks, and that later edits don't change
  a revision.

- [ ] **4. Decisions and comments.** The permissions, approve / request changes / reject / override,
  comments, the row lock, and the audit events.
  *Done when:* database tests cover each decision and who may take it, required messages, the
  override, and two concurrent decisions on all four databases.

- [ ] **5. Diff.** A line diff per file between two revisions (the chosen library or our own), with
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
