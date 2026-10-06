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

- [x] **4. Admin › Workspaces.** [risky] The list on `DataTable`, New workspace dialog, the workspace page
  with its scopes, delete; nav entry for root.
  *Done when:* component tests pass, and the phone sweep (065) passes on the new pages.

- [x] **5. Admin › Scopes.** Workspace column, filter and select.
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
- **Task 4.** `/admin/workspaces` (the table: name linking to its page, description, visibility,
  scopes, created; `global` first; search and both sorts in the URL) and `/admin/workspaces/<name>`
  (description, visibility, Edit description and Delete, neither for `global`; its scopes on the
  shared scope table, paged on the workspace page's own address). Both are a 404 for anyone but
  root, before anything is read, as is an unknown name. The scope list gained a `workspaceId`
  filter in the repository and `pageScopes` for this; Admin › Scopes shows it in task 5. Delete is
  disabled with "Move or remove its scopes first." while the workspace has scopes, and returns to
  the list when it's done. New workspace shows visibility as Public, with no choice, until 093. The
  admin nav has Workspaces before Scopes. The end-to-end seed adds an empty workspace, `e2e-team`,
  so the phone sweep opens a page with Edit and Delete as well as `global`'s. The Edit button's
  accessible name is its visible text, "Edit description" (one workspace per page). The Members
  column and section wait for 092; the helper waits for task 7. Two things found here belong to
  shared code and stay out of this task: a malformed `%` escape in any dynamic route's address is a
  500 from Next.js before the page runs, and a disabled button's reason shows only on hover and to
  screen readers (068 makes it reachable by tap).
- **Task 5.** Admin › Scopes has a Workspace column (a link to the workspace's page) and a Workspace
  select in its filters, kept in the URL as `?workspace=<name>`; the page turns the name into the
  id, and a name that no longer exists matches no scope while its chip still shows, so it can be
  removed. The shared scope table shows the column and filter only when it's given the workspaces,
  so a workspace's own page (`workspaceScopesList`, search only) doesn't. Create scope has a
  Workspace select, `global` first and chosen, posted as `workspaceId`; its message names the
  workspace when it isn't `global`, and it revalidates the workspace pages too (their scope counts
  and lists change). An empty filter result now reads "No scopes match these filters."
