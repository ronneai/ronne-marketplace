# 010 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Name rules in `packages/core`.** `normalizeScopeName`, `isValidName` and the reserved
  list, exported for the web app and 011.
  *Done when:* unit tests cover the character rules, lengths, `@` stripping and reserved names.

- [ ] **2. Migration `0004_scopes`.** The table, the unique index, the table-level foreign key
  (`ON DELETE SET NULL`), and the Kysely `ScopeTable` type.
  *Done when:* it migrates on SQLite and the 004 servers, with a foreign-key test.

- [ ] **3. `items` domain: scopes.** Model, repository (interface + Kysely), services and actions;
  `scopes.manage` in the permission map; `scope.created` and `scope.updated` in 007's catalogue.
  *Done when:* database tests cover create, duplicates, invalid and reserved names, edit, search,
  paging, permissions, and the audit events in the same transaction.

- [ ] **4. Pages.** `/admin/scopes` (table, create and edit dialogs, "Scopes" in the admin
  navigation) and `/scopes` (read-only list with search), using 032's parts.
  *Done when:* render, action and permission tests pass, and Playwright: root creates a scope, and
  a user sees it on `/scopes` but gets a 404 on `/admin/scopes`.

## Notes
