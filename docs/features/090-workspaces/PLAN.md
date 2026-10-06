# 090 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration.** [risky] `0019_workspaces`: the `workspaces` table, the `global` row, and
  `scopes.workspace_id` (on PostgreSQL and MySQL added nullable, filled, then not null; SQLite, which
  can't add NOT NULL or a foreign key to a table, rebuilds `scopes`; table-level FK for MySQL, per
  `migrations.guard.test.ts`). Setup's steps create nothing extra (the migration does).
  *Done when:* migration tests pass on the four databases, starting from an instance with scopes.

- [x] **2. Names and the domain.** [risky] Workspace name rules in `packages/core/src/names.ts` (reserved
  `global`); a `workspaces` domain (models, repository, services `createWorkspace`,
  `updateWorkspace`, `deleteWorkspace`, `listWorkspaces`, `pageWorkspaces`) with `workspaces.manage`
  (root); `GlobalWorkspaceError`; the audit events.
  *Done when:* service db tests cover create, edit, delete empty, refuse non-empty, refuse global,
  refuse non-root.

- [x] **3. Scopes in a workspace.** `createScope` takes `workspaceId` (default global); the scopes
  repository returns it; `GET /api/v1/scopes` adds `workspace`.
  *Done when:* scope tests and the API test pass.

- [ ] **4. Admin › Workspaces.** The list on `DataTable`, New workspace dialog, the workspace page
  with its scopes, delete; nav entry for root.
  *Done when:* component tests pass, and the phone sweep (065) passes on the new pages.

- [ ] **5. Admin › Scopes.** Workspace column, filter and select.
  *Done when:* the Admin › Scopes tests pass.

- [ ] **6. Catalogue and item page.** Workspace label on the card and header; the Workspace filter
  in the catalogue's URL and panel.
  *Done when:* catalogue tests and an end-to-end test (create a workspace and scope, release an
  item, filter by workspace) pass.

- [ ] **7. Decisions and Documentation.** MVP §10 (`workspaces`, `scopes.workspace_id`), §15 (a new
  "Workspaces" row, and "Scopes" updated); the topics and helpers in the spec, `topics.ts` here and
  in ronne-web together.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1.** `global` has a fixed id, `GLOBAL_WORKSPACE_ID` (`00000000000000000000000000`, exported
  by the migration), so code and tests point a scope at it without a lookup; until task 3 the scope
  repository puts every new scope there. On SQLite, `scopes` is rebuilt (foreign keys off for the
  connection, then `workspaces`, the copy, the drop and the rename in one transaction, checked with
  `foreign_key_check` on scopes, items and submissions before commit): a failed run leaves the
  database as it was, and runs again once the data is fixed. MySQL commits each DDL statement, so
  each step there checks whether it's done already, and a stopped run can be rerun; PostgreSQL runs
  it in one transaction. Every raw `insertInto("scopes")` in tests and `feed-benchmark.ts` now sets
  `workspace_id`.
- **Task 2.** `nameProblem(name, "workspace")` reserves `RESERVED_WORKSPACES` (`global` plus the
  scopes' list); `normalizeWorkspaceName` trims and lowercases (no `@`). The service accepts only
  `public` until 093 (`InvalidWorkspaceVisibilityError`). When the unique index refuses a name
  another root just took, the service looks the name up again outside the failed transaction and
  answers `WorkspaceNameTakenError`. The repository's page leaves `global` out; `pageWorkspaces`
  counts it whenever the search matches it, so the total is the same on every page, and lists it
  first on any page with nothing before it (also when reached through a previous cursor). The name
  race only shows on MySQL and MariaDB, where the two creates really overlap, so a unit test with a
  fake repository (`services/workspaces.test.ts`) forces it. The repository's update and delete also filter on
  `is_global = false`, so `global` stays even if a service check were skipped. `listWorkspaces` is
  open to everyone signed in (catalogue filter, selects); paging and opening one are root's. Edit,
  delete and open look a name up as create stores it (trimmed, lowercased, then checked against the
  name rule, then compared byte for byte), so `ACME` finds `acme` and `ａｃｍｅ` finds nothing on every
  database, MySQL's collation included. A delete that loses a race with a new scope (its foreign key
  refuses) is answered `WorkspaceNotEmptyError` after a recount outside the failed transaction.
- **Task 3.** `createScope` takes an optional `workspaceId`, `global` when empty, looked up in the
  same transaction (`ScopeWorkspaceNotFoundError` when it's gone); `scope.created` records the
  workspace's name. `Scope` carries `workspace: { id, name }` from a join, and the scope
  repository's `insert` now needs `workspaceId` (tests, the e2e seed and `feed-benchmark.ts` pass
  `GLOBAL_WORKSPACE_ID`). `GET /api/v1/scopes` adds `workspace` (the name) to each scope. `rmk export`
  (`fetchScopes`) and the MCP server's export tools read that endpoint but use only `name` and
  `description`, so they don't change; the MCP's structured answer now passes `workspace` through.
