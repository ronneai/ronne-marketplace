# 057 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Status rules.**
  - In `submissions/models/status.ts`: a `restore` action (`withdrawn → draft`), and
    `statusLabel("withdrawn")` reads "archived".
  - A `restore` review-event kind. `review_events.kind` is a plain `string(24)`, so no migration is
    needed.
  - `submission.deleted` and `submission.restored` in `audit/models/audit-event.ts`.

  *Done when:* `status.test.ts` covers restore and the label, and lint and typecheck pass.

- [x] **2. Services.** All in the `submissions` domain:
  - `hasReviewHistory(repo, submission)`: any event by someone other than the author.
  - `withdrawSubmission(…, mode)`:
    - `"archive"` is today's path, with `mode` in the audit metadata;
    - `"delete"` re-checks history and deletes in the same transaction.
  - `restoreSubmission`.
  - `deleteSubmission`, shared by delete-on-withdraw, delete-from-archived and 012's `deleteDraft`.
    All of them audit `submission.deleted`.
  - `viewSubmission` hides `withdrawn` from reviewers.

  Thin actions in `actions/submissions.ts` and `features/draft-editor/actions.ts`.

  *Done when:* `*.db.test.ts` covers the following on every database:
  - archive, and the moderator 404 afterwards;
  - restore with revisions kept, and the next submit's revision number;
  - delete of a never-submitted draft;
  - delete of a submitted one without reviewer events;
  - delete refused once a reviewer commented;
  - delete refused when the review history appears inside the transaction;
  - `deleteDraft`'s new audit event;
  - restore and delete by someone else (not found).

- [ ] **3. The dialog and the page.**
  - `WithdrawDialog` (`features/draft-editor/SubmitDialogs.tsx`): the two radio cards, Delete
    disabled with its reason, and 056's dependents line kept.
  - The editor needs a `canDelete` flag from the page loader.
  - The archived notice in `DraftEditor.tsx`, with Restore and Delete for good.
  - Redirect to My submissions after a delete.

  *Done when:* component tests cover both choices and the disabled reason.

- [ ] **4. My submissions.**
  - `app/(app)/submissions/page.tsx` and `features/submissions/SubmissionsTable.tsx`: hide
    archived by default, add the **Archived (n)** filter, Restore and Delete on archived rows (Delete
    asks first), and drop withdrawn-last ordering.
  - Dependency marks say "archived" (`dependency-marks.ts`, `registry-checks.ts` wording).

  *Done when:* table tests cover the default list, the filter and the row actions.

- [ ] **5. Documentation.**
  - `review#statuses` row, the new `review#withdraw` section (in `topics.ts` and `content.tsx`),
    and `review#dependencies` wording.
  - The export topic's "withdraw it" line.
  - The two helpers in `Help.tsx`.

  *Done when:* the docs render tests pass, and both helpers' links land on `review#withdraw`.

- [ ] **6. End-to-end.** Playwright:
  - An author archives a submitted skill, finds it under Archived, restores it, and resubmits it
    as revision 2.
  - An author deletes a never-submitted draft from Withdraw.
  - A moderator gets a 404 on an archived one.

  *Done when:* `pnpm test:e2e` passes.

- [ ] **7. Close.** MVP §4.1 and §15 already describe this (2026-10-02). Check they still match
  what was built, then set the status to `done` in the index.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
