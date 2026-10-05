# 090 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Migration.** `00NN_workspaces`: the `workspaces` table, the `global` row, and
  `scopes.workspace_id` (added nullable, filled, then not null, so it works on all three dialects;
  table-level FK for MySQL, per `migrations.guard.test.ts`). Setup's steps create nothing extra
  (the migration does).
  *Done when:* migration tests pass on the four databases, starting from an instance with scopes.

- [ ] **2. Names and the domain.** Workspace name rules in `packages/core/src/names.ts` (reserved
  `global`); a `workspaces` domain (models, repository, services `createWorkspace`,
  `updateWorkspace`, `deleteWorkspace`, `listWorkspaces`, `pageWorkspaces`) with `workspaces.manage`
  (root); `GlobalWorkspaceError`; the audit events.
  *Done when:* service db tests cover create, edit, delete empty, refuse non-empty, refuse global,
  refuse non-root.

- [ ] **3. Scopes in a workspace.** `createScope` takes `workspaceId` (default global); the scopes
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
