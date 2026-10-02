# 062 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Shared table additions.** `KeysetSort.kind: "date"` in `paginate`,
  `ListDefinition.fixed` in the list state, and `Column.srHeader` in `DataTable`.
  *Done when:* `keyset.db.test.ts` pages by a timestamp with equal and close values on all four
  databases; `list-query.test.ts` and `data-table.test.tsx` cover `fixed` (kept by Clear, sort and
  size; absent from chips) and `srHeader`.

- [x] **2. The queue on the server.** `0016_submissions_queue_indexes`; `pageForReview` and
  `countForReview` (the tab's statuses, the search with the author join, the type), and
  `listQueue` with sorts, sizes and cursors. `listForReview` stays for the dependency scans,
  without its `after` cursor. The page gets the minimum to keep working until task 3.
  *Done when:* `queue.db.test.ts` covers each tab's default order, sorting by name, the filters,
  more than 200 open rows, paging Decided both ways, and the count on all four databases.

- [ ] **3. The queue page on `DataTable`.** `features/reviews/list.ts`, the columns with the
  selection and decisions cells, the tabs dropping the view, the filters with chips, and the bulk
  providers fed with the page's rows. `QueueTable`'s own table and pagination go.
  *Done when:* the reviews render tests cover each tab's columns, the filters and the empty states;
  `review.e2e.ts`, `bulk-approve.e2e.ts`, `bulk-release.e2e.ts` and `review-decisions.e2e.ts` pass,
  updated for the new controls.

- [ ] **4. Documentation.** Review › "What reviewers look at" and "Approving many at once",
  Versions › "Releasing many at once", and the `approve-many` and `release-many` helpers.
  *Done when:* the docs render tests pass, and the index marks 062 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
