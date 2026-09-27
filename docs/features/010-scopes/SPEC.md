# 010 — Scopes

> Milestone: M2 · Depends on: 008 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§3.1](../../MVP/MVP.md#31-item-types), [§10](../../MVP/MVP.md#10-data-model-mvp) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §1

## Goal

Every item name is scoped, such as `@platform/code-reviewer`. Before anyone can draft an item
(012), the scope it goes in has to exist. Root creates scopes and everyone can see them, so
authors know where their items can go.

## Scope

**In:**
- Migration `0004_scopes` and its Kysely type.
- An `items` domain (MVP §9.2): the `Scope` model, the name rules, repository, services and actions.
  Later features add items and versions to the same domain.
- **Root:** create a scope, and edit its description.
- **Everyone signed in:** list and search scopes, in the web app and in the submission editor's
  scope picker (012).
- A permission `scopes.manage` (root) in 008's permission map. Viewing needs only a session.
- Audit events `scope.created` and `scope.updated` (007's catalogue).

**Out:**
- Renaming or deleting a scope. Items and published versions point to it, and their names can't
  change once someone has installed them. Both can come later, for scopes that were never used.
- Scope membership or owners. MVP §2 decided that scopes are open: anyone may propose in any scope,
  and review is the gate.
- `GET /api/v1/scopes`. The CLI doesn't need scopes until it can publish, which isn't in the MVP.

## Behaviour

**Table `scopes`** (migration `0004_scopes`, the 002 portability rules):

| Column | Type | Notes |
|---|---|---|
| `id` | ULID | |
| `name` | `varchar(64)`, unique | Without the `@`: `platform`, not `@platform` |
| `description` | `varchar(300)` | Required; shown in the scope picker |
| `created_by` | ULID, nullable | FK → `user`, **ON DELETE SET NULL** (table-level, as in 0002) |
| `created_at` | timestamp | UTC |

**Name rules** (the manifest spec, §1): lowercase `a-z`, `0-9` and `-`, 1–64 characters, not
starting or ending with `-`. Typed with or without the `@`, which is stripped. The check lives in
`packages/core` (011 uses the same function for item names), so the web app, the CLI and the schema
agree. Until 011 lands, 010 adds it to `packages/core` itself.

**Reserved names:** `ronne`, `ronneai`, `rmk`, `admin`, `root`, `system`, `api`, `www` and
`internal` are refused, so an item can't pass itself off as part of Ronne.

**`/admin/scopes`** (root, in 008's admin area, next to Users and Audit log):
- **Table:** name (`@name`, mono), description, created by, created (UTC), and the number of items
  (0 until M3 publishes the first ones).
- **Create scope** (a dialog): name and description. The name is shown as `@name` while typing, with
  the rules under the field.
- **Edit description:** a dialog. The name can't be changed.

**`/scopes`** (every signed-in user): the same list, read-only, with a search box (name or
description, the portable search from 002). It explains that anyone can propose items in any scope,
and that root creates new scopes. This is the page the editor's picker links to.

**Services** (`domains/items/services/scopes.ts`):
- `createScope`: checks `scopes.manage`, the name rules, reserved names and uniqueness (in any case
  typed), in one transaction with `scope.created { name, description }`.
- `updateScopeDescription`: checks `scopes.manage`, records `scope.updated { name, from, to }`.
- `listScopes(query)`: search and cursor paging (50 a page), for the pages and the picker.
- `findScopeByName(name)`: for 012 and 013's checks.

## Edge cases

- **Duplicate name:** `ScopeNameTakenError`, regardless of case or a leading `@`.
- **Invalid or reserved name:** `InvalidScopeNameError`, naming the rule that failed.
- **A user who isn't root** calling create or update through a crafted request: `ForbiddenError`
  from the permission map; the admin page is a 404 for them (008's rule).
- **Empty instance:** the scope list explains that root creates the first scope, and the editor
  (012) can't create a draft until one exists.

## Acceptance criteria

- [ ] `0004_scopes` creates the table, unique index and table-level foreign key on all four
      databases, with a foreign-key test like 0002's.
- [ ] The name rules and reserved names are enforced by one function in `packages/core`, with tests.
- [ ] Root creates scopes and edits descriptions; each change records its 007 event in the same transaction.
- [ ] Duplicate names are refused regardless of case and a leading `@`.
- [ ] Non-root users can't create or edit scopes (404 page, `ForbiddenError` action), but can list and search them.
- [ ] `scopes.manage` is in the permission map, and its table test is updated.

## Open questions

- None.
