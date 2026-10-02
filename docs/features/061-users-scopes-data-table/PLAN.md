# 061 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Users on the server.** `0015_user_name_index`. `pageUsers` and `countUsers` (the sorts
  `created`, `email` and `name`, and the existing filters) replace `listUsers`; `adminListUsers`
  returns `{ users, next, previous, total }`. The page gets the minimum to keep working (opaque
  cursors) until task 2.
  *Done when:* `user-admin.db.test.ts` covers each sort both ways, equal names across pages, the
  filters and the count on all four databases.

- [x] **2. The Users page on `DataTable`.** `features/admin-users/list.ts`, the columns, the
  filters with chips and submit on change, and the row actions in the last column. The old query
  helpers and table go. The chips move into a shared `FilterChips`, which the audit log uses too.
  *Done when:* `admin-users.test.tsx` covers the columns, sorting links, chips and the empty
  states; `user-admin.e2e.ts` passes, updated for the new controls, and sorts by email.

- [x] **3. Scopes on the server.** `ScopeRepository.page` and `count` (sorts `name` and
  `created`, the search). `list` stays for the API and the new-draft page.
  *Done when:* the scope tests cover both sorts, paging both ways and the count on all four
  databases, and the `GET /api/v1/scopes` tests pass unchanged.

- [ ] **4. Both scope pages on `DataTable`.** `features/scopes/list.ts` (two definitions), the
  shared columns, and Edit on the admin page. `ScopesTable` and its query helpers go.
  *Done when:* the scopes render tests cover both pages, and `scopes.e2e.ts` passes, updated for
  the new controls.

- [ ] **5. Documentation.** Scopes › "What a scope is" and Administration › Users.
  *Done when:* the docs render tests pass, and the index marks 061 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
