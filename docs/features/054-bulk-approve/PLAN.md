# 054 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Decisions.** The owner settles root's own submissions in bulk and risky submissions in
  bulk, and the spec is updated to match before anything is built.
  *Done when:* the spec has no open question that changes what's built.

- [x] **1. Optional override reason.** `DECISIONS.override.requires` becomes `null` in
  `services/reviews.ts`; the `DecisionBar` copy for the override is optional with the new hint.
  *Done when:* `reviews.db.test.ts` covers an override with and without a reason (event body and
  audit metadata), and request changes and reject still refuse an empty message.

- [x] **2. Domain.** `approveMany` in the `submissions` service, over 014's `decide`, each
  submission in its own transaction, with the spec's result kinds and `via: "bulk"` in the audit
  metadata. `approvable` (status, author, override, staleness) shared by the queue and the service.
  An action for a session.
  *Done when:* `bulk-approve.db.test.ts` covers approvable and refused in one batch, a moderator's
  own, root's own as an override, a stale proposal, someone else's decision in between, a withdrawn
  one, a demoted reviewer, the shared message and the empty one, on every database.

- [x] **3. The queue.** The Needs review rows carry `approvable` and the reason when not. Checkboxes,
  **Select all**, **Approve selected**, the confirmation (risky first, overrides marked, the
  optional message), the results, and the refresh, in `features/reviews`.
  *Done when:* `reviews.test.tsx` covers the checkboxes and the dialog, and a Playwright test
  approves three submissions with one message, one withdrawn in between.

- [x] **4. Documentation.** `review#decisions`, the new `review#approve-many`, the pointer in
  `review#many`, the queue helper and the override hint.
  *Done when:* the docs render tests pass, and the new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
