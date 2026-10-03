# 068 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The scan.** A Vitest source scan for `title=` with the allowlist format; list today's
  uses as "to fix" entries.
  *Done when:* the scan passes with the to-fix list and fails on a new `title=`.

- [ ] **2. Disabled reasons.** The info trigger in `Button`; the row-line variant for bulk lists;
  move the hand-made ones (`BulkSubmit`, `BulkApprove`, `PublishDialog`, `DraftEditor`,
  `DecisionBar`) onto it.
  *Done when:* unit tests pass; `hover.mobile.e2e.ts` reads the reason on a phone.

- [ ] **3. Times and hashes.** `LocalTime` popover; the versions table's sha256 popover with copy.
  *Done when:* unit tests pass; e2e reads a UTC time and copies a full hash on a phone.

- [ ] **4. Truncation.** `Truncated` primitive; `FileTree`, `TypesExplorer`, submissions feedback;
  `DataTable`'s truncate columns wait for 069's stacked rows (note it there).
  *Done when:* unit tests pass; the scan's to-fix list loses these entries.

- [ ] **5. Badges and marks.** `ProposalBadges`, `DependencyMarks`, `DirtyMark`, `UsageCard`
  caption.
  *Done when:* the scan's to-fix list is empty.

- [ ] **6. Documentation.** The two "on hover" lines in `content.tsx`.
  *Done when:* the docs render tests pass; the sweep's 068 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
