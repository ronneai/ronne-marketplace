# 063 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. My submissions on the server.** `0017_submissions_author_indexes`; `pageByAuthor`,
  `countByAuthor` and `statusCountsByAuthor` (sorts `updated` and `name`; filters status, search
  and type); `listMySubmissions` with sorts, sizes and cursors, and
  `countMySubmissionsByStatus`.
  *Done when:* a submissions db test covers both sorts both ways, each filter, the archived
  exclusion from All, and the counts on all four databases; other `listByAuthor` callers' tests
  pass unchanged.

- [ ] **2. The page on `DataTable`.** `features/submissions/list.ts`, the status links with counts
  (keeping sort and size), the columns with the bulk cells and row actions, chips for search and
  type, and per-page marks, feedback, delete checks and releasable rows. The in-memory sort and
  filter helpers go.
  *Done when:* `submissions.test.tsx` covers the columns, status links, chips and empty states;
  `submit.e2e.ts`, `bulk-submit.e2e.ts`, `bulk-release.e2e.ts` and `withdraw.e2e.ts` pass, updated
  for the new controls.

- [ ] **3. Documentation.** The Review sections and the `release-many` helper.
  *Done when:* the docs render tests pass, and the index marks 063 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
