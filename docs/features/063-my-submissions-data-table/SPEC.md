# 063 — My submissions on the server data table

> Milestone: Across the app · Depends on: 012, 013, 052, 055, 056, 057, 058, 060, 062 · Design: [060](../060-server-data-table/SPEC.md) · Contracts: none new

## Goal

My submissions (`/submissions`) loads **every** submission the person has ever made, sorts it in
memory, counts the statuses from that list, then computes dependency marks, feedback and delete
checks for the rows shown. Someone who exports often (M7), or archives a lot (057), ends up with a
slow page that grows forever. This feature pages it on the server with 060's `DataTable`, adds
sorting and a search, and keeps the status filters with their counts, submitting many (052),
releasing many (055), the marks (056), archive and delete (057), and the reviewer's message (058).

## Scope

**In:**
- **`/submissions` on `DataTable`**, paged with keyset cursors and counted. Rows of other people
  never appear, as before.
- **The status filters** stay as the row of links above the table, with their counts. The counts
  come from **one grouped query** (`count(*) … group by status`) rather than the whole list.
  All, then each status in use, and Archived last and not counted in All (057).
- **Sorting** by **last change** (the default, newest first) and **item name**.
- **Filters:** a search over the item name and the type, both as chips. The status stays in the
  URL as `?status=`, in the status links, not as a chip.
- **Page sizes** of 25, 50 and 100.
- **Indexes** for the sorts (`0017_submissions_author_indexes`).

**Out** (and where it goes instead):
- **Selecting across pages, for releasing:** Release selected and Select all act on the page's
  approved rows, as in 062.
- Changing what the rows show: the columns, marks, feedback line and row actions are unchanged.

## Behaviour

**The list** (`features/submissions/list.ts`):

```ts
defineList({
  path: "/submissions",
  sorts: { updated: "desc", name: "asc" },
  defaultSort: "updated",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { status: "string", q: "string", type: "string" },
});
```

- **`status`** is a list filter, so sorting, paging and page size keep it. It isn't shown as a chip,
  since the status links already show it, and Clear filters keeps it. A status the app doesn't
  know falls back to All.
- **The status links** keep the sort and size and drop the cursor and the other filters.
- **Sort keys:**
  - `updated`: (`updated_at`, `id`), a date sort (062's `kind: "date"`).
  - `name`: (`submissions.name`, `id`).
- **The search** matches part of the item name (`containsInsensitive`). **Type** is a select of the
  item types.

**Columns** (as today, on `DataTable`):
- Select: the bulk submit and release cells, inside their providers.
- Item: the name link, with marks, feedback line and badges.
- Type and Status.
- Last change: sortable, local time.
- The row actions (withdraw, restore, delete…).

**Per-page work:**
- Dependency marks, the latest feedback, and whether an archived row can be deleted are computed
  for the page's rows only.
- `releasable` (for Release selected) is built from the page's approved rows.

**Submitting many (052)** is unchanged. The check behind "Select all ready" already covers the
person's newest 100 open drafts across the whole list, not just the page, so Select all ready
still selects every ready draft, with its dependency drafts (056). The table marks the ready rows
it shows.

**Server:**
- `pageMySubmissions(headers, { status, search, type, sort, dir, size, cursor })` returns
  `{ rows, next, previous, total }`, with stale proposals marked (017) as before.
  `listMySubmissions` stays for the home page and the new-draft page, which use the whole list.
- `countMySubmissionsByStatus(headers)` returns the counts for the links.
- `SubmissionRepository.pageByAuthor(…)`, `countByAuthor(…)` and `statusCountsByAuthor(…)` replace
  `listByAuthor` for this page. Every other caller of `listByAuthor` keeps it: the home page's
  "in progress", the new-draft page, the dependency search, the drafts service (`GET
  /api/v1/drafts`) and the bulk submit checks.

**Indexes** (`0017_submissions_author_indexes`):
- (`author_id`, `updated_at`, `id`)
- (`author_id`, `name`, `id`)

## Edge cases

- **A submission changes while you page** (submitted, approved, archived): its `updated_at` moves
  it to the top of "last change". Keyset cursors don't repeat it on the next page. It may show on
  the first page again, which is expected.
- **The All link's count** excludes archived ones, as today. Archived has its own count and link,
  shown only when there are some.
- **Nothing yet:** the existing empty state ("You have no drafts yet.", with New item). There's
  no status row and no pagination bar.
- **Archived filter and Delete for good:** deleting the last row of a page refreshes the same URL,
  and the empty page offers Previous and First.
- **Old `?status=` links** keep working. They're the same parameter.

## Documentation

- **Review › "Statuses"** (or wherever My submissions is described): the list can be sorted by
  last change or name, searched, filtered by type, and paged.
- **Review › "Submitting many at once":** Select all ready still takes every ready draft, and
  Release selected acts on the page's approved rows.
- **Helpers:** `release-many` now says Select all approved covers the rows on the page, on both
  pages. `submit-many` doesn't change.

## Acceptance criteria

- [x] `/submissions` renders on `DataTable`, reading only one page and the status counts. It never
  reads the person's whole list.
- [x] Sorting by last change or name works both ways with no repeat or gap on all four databases.
  The status links show the right counts (Archived apart).
- [x] The search and type filter apply on change, as chips. The status links keep the sort and
  size.
- [x] Submitting many, releasing many, archiving, restoring and deleting work as before (the
  existing end-to-end tests pass, updated for the new controls).
- [x] `0017_submissions_author_indexes` runs on all four databases.
- [x] Every other caller of `listByAuthor` behaves as before.
- [x] The Documentation and helpers listed above say what the feature does now.

## Open questions

- None.
