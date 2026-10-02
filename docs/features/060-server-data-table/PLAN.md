# 060 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Keyset paging on the server.** `server/db/keyset.ts`: `paginate()` (sort column plus
  `id`, both directions, `size + 1`), the cursor encoding and checking, and the capped `count`.
  *Done when:* `keyset.db.test.ts` covers next, previous and first for ascending and descending,
  equal sort values across pages (120 rows, pages of 50), a cursor from another sort, a tampered
  cursor, and the 10,000 cap. It passes on SQLite and against `pnpm test:db:up` (PostgreSQL, MySQL,
  MariaDB).

- [ ] **2. List state in the URL.** `components/ui/data-table/list-query.ts`: `defineList`,
  `parseListQuery` (sort, dir, size, cursor and typed filters, with fallbacks), and `listUrl`
  (defaults left out; a filter, sort or size change drops the cursor).
  *Done when:* unit tests cover every fallback and the round trip from URL to state and back.

- [ ] **3. The `DataTable` component.** Sortable headers (links, `aria-sort`, a direction icon),
  cells from `render`, truncation, the empty state, the pagination bar (count, First, Previous,
  Next, page size) and the toolbar slot. It's a server component: links and GET forms only, with a
  small client island that submits on change.
  *Done when:* `data-table.test.tsx` renders sorting, both ends of paging, the empty and filtered
  states, and a `<details>`/`<p>` nesting check (`docs/knowledge/help-tips-and-paragraphs.md`). The
  styleguide page shows it.

- [ ] **4. Audit repository and migration.** `0014_audit_log_action_index`. `list` moves to
  `paginate` with the sorts `time` and `action`, the action filter (one action or a group) and the
  actor email filter (`containsInsensitive`, or `system`), with a join for user targets' emails.
  Add `findById`; remove `actors()`.
  *Done when:* `audit.db.test.ts` covers each filter, both sorts, paging and `findById` on all four
  databases, and `migrations.guard.test.ts` passes.

- [ ] **5. Summaries.** `features/admin-audit/summary.ts`: one per action in the catalogue, with
  the fallback.
  *Done when:* a test renders a summary for every action in `AUDIT_ACTIONS` (and fails for one
  that's missing), plus the fallback for unexpected metadata.

- [ ] **6. The audit page on `DataTable`.** The columns, the filters row with chips, submit on
  change, and the page description. The details dialog from `?event=`, with target links and raw
  JSON with copy. "That event doesn't exist" for an unknown id. The route reads the list state and
  the event.
  *Done when:* `admin-audit.test.tsx` covers the line, the dialog's fields, the not-found notice and
  the filters; `audit.e2e.ts` (root's existing test, so no new root sign-in) filters, sorts, pages,
  opens and closes an event, and checks that the URL keeps the view.

- [ ] **7. Documentation.** The Administration topic with its Audit log section, the
  `audit-actor` and `audit-summary` helpers, and the link from Roles. The follow-up rows (Users
  and the review queue on `DataTable`) go in the index as `planned`.
  *Done when:* the docs render tests pass, every new helper's link lands on a real section, and the
  index marks 060 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
