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

- [x] **3. `items` domain: scopes.** Model, repository (interface + Kysely), services and actions;
  `scopes.manage` in the permission map; `scope.created` and `scope.updated` in 007's catalogue.
  *Done when:* database tests cover create, duplicates, invalid and reserved names, edit, search,
  paging, permissions, and the audit events in the same transaction.

- [x] **4. Pages.** `/admin/scopes` (table, create and edit dialogs, "Scopes" in the admin
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
- **Task 3 (2026-09-27): the `items` domain for scopes** (`src/server/domains/items/`).
  - **Services:** `createScope` (checks `scopes.manage` and the name and description, then the
    scope and `scope.created` in one transaction), `updateScopeDescription` (`scope.updated
    { name, from, to }`; the same description records nothing), `listScopes` (everyone signed in;
    name order, 50 a page, search on name and description) and `findScope`.
  - **Permissions and audit:** `scopes.manage` (root) joined the permission map, and `scope.created`
    and `scope.updated` joined the audit catalogue, with a new `scope` group for the audit page's
    filter.
  - **`@ronneai/core` in the web app:**
    - it's a workspace dependency now;
    - Vitest resolves it from its source (an alias), so tests don't need it built;
    - the Dockerfile builds `@ronneai/web...` (the web app and its workspace dependencies);
    - `pnpm test:e2e` builds `@ronneai/core` before `next build`.
  - **Spec change:** the item count per scope waits for 015, when items exist.
  - **Tests** (all four databases): creation from what was typed (`@Platform` becomes `platform`),
    duplicates in any case, each invalid and reserved name, description limits, root-only changes,
    the audit events, search (with `%` taken literally) and paging.
- **Task 4 (2026-09-27): pages.**
  - **`/admin/scopes`** (root; a 404 for anyone else, without listing) has the table, a "Create
    scope" dialog and an Edit dialog per row. The create dialog shows `@name/item` as you type, and
    each name rule in words. "Scopes" joined the admin tabs.
  - **`/scopes`** (everyone signed in) is the same table, read-only, with the search as a GET form.
  - **Navigation:** "Scopes" joined the header for everyone. With three links, root's header was
    426px wide on a 360px phone. So "Home" hides on phones (the logo links home), and the phone
    header's padding and gaps are tighter.
  - **Tables on phones:** the description column has a minimum width, so the table scrolls inside
    its frame instead of squeezing the column into a narrow strip. Every page measures exactly the
    viewport at 360, 390 and 1440px.
  - **Tests:** the actions (error mapping, revalidating both pages), the table (links, empty states),
    the query parsing, and the pages' permissions. Playwright: root creates `@E2E-Team` (saved as
    `e2e-team`); a user finds it through the header's Scopes link, has no Edit buttons, and gets a
    404 on `/admin/scopes`. All 12 end-to-end tests pass.
  - **Docker:** built locally with the new `--filter "@ronneai/web..."`, then run: before setup it
    answers as expected, with no errors in its logs.
- **Done (2026-09-27).**

