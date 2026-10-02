# 062 — The review queue on the server data table

> Milestone: Across the app · Depends on: 014, 054, 055, 056, 058, 060 · Design: [060](../060-server-data-table/SPEC.md) · Contracts: none new

## Goal

The review queue (014) has four tabs, and only Decided pages. Needs review, Waiting on the
author and To release show their **first 200 rows and silently drop the rest**, and every row
reads its latest revision's files to compute risk flags. A busy instance would hide submissions
from reviewers. This feature moves all four tabs onto 060's `DataTable`: every tab paged on the
server, sortable, searchable, with page sizes and a total. Approving many (054), releasing many
(055) and the row decisions (058) keep working on the page you see.

## Scope

**In:**
- **All four tabs on `DataTable`**, each paged with keyset cursors and counted. This removes the
  200 limit.
- **Sorting** by the tab's time (Submitted, Approved or Decided) and by item name.
- **Filters:** a search over the item name or the author's name, and the item type, both as
  chips. The tab itself isn't a filter, and stays in the URL.
- **Page sizes** of 25, 50 and 100.
- **Two additions to the shared table, used here first:**
  - **Fixed parameters** on a list definition, which every URL of that list keeps. That's how
    `tab` stays in the URL.
  - **Date sort values** in `paginate`, whose cursor stores a date as ISO text and compares it
    through `toDbDate`. The queue sorts by `submitted_at` and `updated_at`.
- **A label for a header-less column** (`srHeader`), so the selection column reads "Select" and
  the decisions column reads "Decisions" to screen readers, not "Actions".
- **Indexes** for the queue's sorts (`0016_submissions_queue_indexes`).

**Out** (and where it goes instead):
- **Selecting across pages.** Select all, Approve selected and Release selected act on the rows
  of the current page, as before (when the tab was one page). Selecting a whole tab across pages
  is a later feature if reviewers ask for it.
- **Filtering or sorting by risk.** Risk flags are computed from each revision's files, so they
  can't be a database query. Risky rows keep their badge, and approving many still lists risky
  ones first (054).
- **My submissions:** 063.

## Behaviour

**The list** (`features/reviews/list.ts`): one definition per tab, sharing its sorts, sizes and
filters. Only `fixed: { tab }` differs (none for Needs review, the default tab, so `/reviews`
stays its URL).

```ts
defineList({
  path: "/reviews",
  fixed: { tab: "release" },
  sorts: { time: "asc", name: "asc" },
  defaultSort: "time",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", type: "string" },
});
```

- **Time by tab**, which is also the time its column shows:
  - Needs review and Waiting on the author: `submitted_at`, oldest first (as today).
  - To release: `updated_at`, oldest first. That's the approval, which its Approved column shows.
    Before, it sorted by the first submit, which its column didn't show.
  - Decided: `updated_at`, newest first (as today; its `sorts.time` is `desc`).
- **Name** sorts by the item's name (`submissions.name`, then `id`). The scope isn't part of the
  sort.
- **The tabs** (links) keep the tab and drop everything else: changing tab starts that tab's own
  default view.
- **The search** matches part of the item name or the author's name (`containsInsensitive` on
  `submissions.name` and the author's `user.name`). **Type** is a select of the item types
  (`ITEM_TYPES`). A type the list doesn't know is dropped.

**Columns:** the same as today, on `DataTable`:
- Select (Needs review and To release). This is the existing client cell, inside the existing
  providers.
- Item: the name link, then the type and the badges (proposal, risk, yours, dependency marks).
  The type moved here from its own column, so the name keeps room on one line. The name gives way
  (cut, whole on hover) and the badges don't.
- Author, Revision.
- Approved by (To release).
- The tab's time (sortable).
- Status (Decided).
- Decisions (Needs review and To release).

**Rows per page:**
- **Risk flags, approvals and dependency marks are computed only for the rows of the page**, as
  today. A page is at most 100 rows, where the open tabs could reach 200 before.
- **The bulk providers get the page's rows.** "Select all (N)" counts the approvable or releasable
  rows on this page. After approving or releasing, the page refreshes with the same URL.

**Server:**
- `listQueue(deps, actor, { tab, filters, sort, dir, size, cursor })` returns
  `{ rows, next, previous, total }`.
- `SubmissionRepository.pageForReview(…)` and `countForReview(…)` build one filtered query: the
  statuses of the tab, the search (with a join on the author) and the type.
- `listForReview` stays for the dependency search and a rejected submission's dependents (056),
  which scan what's in review. It loses its `after` cursor, which only the queue's old Decided
  paging used.

**Shared table additions (060):**
- **`ListDefinition.fixed`:** parameters written first in every URL of the list, never shown as
  filters or chips, and kept by Clear.
- **`KeysetSort.kind`:** `"date"` for a timestamp column. Its cursor value is ISO text, turned back
  into a `Date` and through `toDbDate` before comparing, so SQLite (text) and the server databases
  (timestamps) compare alike.
- **`Column.srHeader`:** the screen-reader text of a column with no visible header.

**Indexes** (`0016_submissions_queue_indexes`):
- (`status`, `submitted_at`, `id`)
- (`status`, `updated_at`, `id`)
- (`status`, `name`, `id`)

## Edge cases

- **A submission changes tab while you page** (approved, sent back): it leaves the tab. Keyset
  cursors don't shift, so Next shows what follows without skipping. The total changes, which is
  expected.
- **Equal times** (two submitted in the same millisecond) and equal names: the `id` tiebreak keeps
  pages strict.
- **A date cursor on SQLite and the servers:** a test pages by `updated_at` across equal and
  close timestamps on all four databases.
- **Old links** with Decided's `updatedAt|id` cursor: not the table's cursor, so they show the
  first page.
- **Approving or releasing the last rows of a page:** the page refreshes. If it's now empty and
  wasn't the first, it says "Nothing left on this page." with a link to the first page (a shared
  `DataTable` rule). The tab's message ("Nothing needs review…") shows only when the tab is empty.
- **Approving many still checks each submission on the server** (054). Paging changes only which
  rows can be selected.

## Documentation

- **Review › "What reviewers look at":** the queue's tabs, their default order, sorting by time or
  name, the search and type filter, and that every tab pages.
- **Review › "Approving many at once"** and **Versions › "Releasing many at once":** Select all
  covers the rows on the page you're viewing, so choose a larger page size to approve or release
  more at once.
- **Helpers:** `approve-many` and `release-many` gain the same sentence about the page.

## Acceptance criteria

- [x] Every tab renders on `DataTable` with paging, a total and page sizes. No tab drops rows past
  200.
- [x] Each tab's default order is as today, and sorting by time or name works both ways, with no
  repeat or gap, on all four databases (a date-sorted keyset test included).
- [x] The search and type filter apply on change, as chips, and changing tab drops them.
- [x] Approve many, release many and the row decisions work on the visible page (the existing
  end-to-end tests pass, updated for the new controls).
- [x] `fixed`, the date sort kind and `srHeader` are part of the shared table, with their own
  tests.
- [x] `0016_submissions_queue_indexes` runs on all four databases.
- [x] The Documentation and helpers listed above say what the feature does now.

## Open questions

- **Selecting a whole tab across pages:** out for now (above). Raise it again if reviewers approve
  more than 100 at a time.
