# 058 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. One rule for who may decide.** Move the `can` flags of `services/review-page.ts` into
  `decisionsFor(actor, submission)` in the `submissions` domain, returning each decision with
  "allowed" or its reason. Use it in `review-page.ts` and in each `QueueRow`
  (`services/queue.ts`), alongside 054's `approvable`.
  *Done when:* a unit test covers the spec's table for user, moderator, root, author and non-author
  on each status, including a stale proposal. The review page's existing tests still pass.

- [x] **2. Deciding from a row.**
  - A server action that loads a submission's open dependents when the reject dialog opens (over
    `dependentsOf`).
  - `via: "queue"` in the audit metadata of `decideAction` and `rejectAction` when called from the
    queue.
  - `DecisionBar`'s dialog usable for one row: a trigger per decision, the same copy and
    `DependentsChoice`.

  *Done when:* `reviews.db.test.ts` covers request changes and reject with `via: "queue"`, and a
  component test opens the dialog from a row.

- [ ] **3. The queue.** The row-actions cell in `features/reviews/QueueTable.tsx`:
  - Request changes and Reject on Needs review; Request changes on To release.
  - Disabled with the reason on the viewer's own rows.
  - After deciding: the status line and the refresh.
  - The queue helper.

  *Done when:* `reviews.test.tsx` covers the cells per tab and the disabled reason.

- [ ] **4. The review page.** `app/(app)/reviews/[id]/page.tsx`:
  - the decisions from `decisionsFor`, disabled with the reason;
  - the own-submission line for root too.

  *Done when:* page tests cover a moderator's own, root's own, and another's submission.

- [ ] **5. The author's side.**
  - The latest decision event in the submission page loader.
  - The top notice, and the per-status read-only notice in `features/draft-editor/DraftEditor.tsx`.
  - The latest reviewer message on My submissions rows: one query, in the submissions repository's
    list, with its `*.db.test.ts`.

  *Done when:* component tests cover each status's notice, and the repository test passes on every
  database.

- [ ] **6. Documentation.** In `content.tsx`, `review#decisions`, `review#approve-many` and
  `review#statuses`; in `Help.tsx`, the queue helper and the `decisions` and `approve-many` helpers.
  *Done when:* the docs render tests pass, and the new helper's link lands on `review#decisions`.

- [ ] **7. End-to-end.** The four Playwright scenarios in the spec's acceptance criteria, in
  `e2e/review.e2e.ts` or a new `e2e/review-decisions.e2e.ts`.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **8. Close.** Set the status to `done` in the index.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
