# 073 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Review page.** Title breaking, phone order, the bottom decision bar on 067's
  `BottomBar` (hidden while a page field has focus), risk-flag link targets.
  *Done when:* review page unit tests pass; `review.mobile.e2e.ts` approves and requests changes on
  a phone.

- [ ] **2. Comments and decision dialog.** Growing comment box, scroll into view on focus; the
  decision dialog's footer and dependents fieldset.
  *Done when:* a WebKit e2e sends a comment and rejects with dependents on a phone.

- [ ] **3. Bulk approve.** Collapsed filter, "Add a message" step, footer count, risk-flagged cards
  each with **Approve**.
  *Done when:* `BulkApprove` tests pass; e2e approves 4 on a phone.

- [ ] **4. Bulk release and Publish.** Settings summary line, notes step, footer; Publish dialog's
  indents.
  *Done when:* `BulkRelease` and `PublishDialog` tests pass; e2e releases 3 on a phone.

- [ ] **5. Queue and versions check.** Confirm 069's queue cards and versions rows on every tab;
  fix what the sweep finds; check the Documentation for button positions.
  *Done when:* the sweep's 073 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
