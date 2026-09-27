# 010 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Name rules in `packages/core`.** `normalizeScopeName`, `isValidName` and the reserved
  list, exported for the web app and 011.
  *Done when:* unit tests cover the character rules, lengths, `@` stripping and reserved names.

- [x] **2. Migration `0004_scopes`.** The table, the unique index, the table-level foreign key
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
- **Task 1 (2026-09-27): name rules** (`packages/core/src/names.ts`), exported from `@ronneai/core`.
  - **`nameProblem(name, kind)`** returns `empty`, `too_long`, `characters`, `edges` or `reserved`
    (scopes only), or null; `NAME_PROBLEM_MESSAGES` has one sentence for each.
  - **Also:** `isValidName`, `normalizeScopeName` (trims, lowercases, strips a leading `@`),
    `parseItemName` (`@scope/name` → its parts) and `RESERVED_SCOPES`.
  - **Reserved scopes are still valid item names:** `@team/admin` is fine, `@admin/x` isn't.
  - **Note:** `packages/core` compiles as NodeNext, so relative imports need `.js` (`./names.js`).
    The first commit attempt stopped on it: the pre-commit typecheck caught it.
- **Task 2 (2026-09-27): migration `0004_scopes`** and the `ScopeTable` Kysely type. It has a
  unique `name` (without the `@`), `description varchar(300)`, and `created_by`, whose table-level
  foreign key sets null on delete. Tested on all four databases: the foreign key read back from each
  catalogue, a deleted creator, and a duplicate name refused.

