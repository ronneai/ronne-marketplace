# 115 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Migration.** [risky] `scope_moves` (id, scope_id, from_workspace_id, to_workspace_id,
  requested_by, new_name (the scope's name in the target), message, status `open/approved/declined/cancelled`, decided_by, reason,
  created_at, decided_at; cascade with the scope and the target workspace; one open per scope
  checked in the service under the scope's row lock, since MySQL has no partial indexes);
  `versions.reviewed_by` (nullable FK `user`, set null) for approved not-reviewed versions.
  *Done when:* the migration's db test passes on the four databases; the guard test passes.

- [x] **2. The checks.** [risky] `moveImpact(scope, target)`: outside dependents with a private
  target, the scope's own dependencies on another private workspace (released, not yanked, and
  open submissions), open submissions outside that depend on it, authors who aren't target
  members, not-reviewed versions, the items' new names, a scope-name clash in the target and new
  names that are another item's alias. Reuse 093's `outsideDependents`.
  *Done when:* db tests cover each case, public and private targets, and a personal source.

- [x] **3. Asking, answering, moving.** [risky] `requestScopeMove`, `cancelScopeMove`,
  `approveScopeMove`, `declineScopeMove`, and the direct move for root and admins of the target,
  following the spec's table; the asker's role re-checked at approval; the move transaction (the
  scope's workspace and name, the items' aliases (118), reviewed versions, the request, the
  catalogue revision, the audit event) under the release lock; the four audit events.
  *Done when:* db tests cover every row of the table, not-reviewed versions, the refusals at ask and
  at approve, a release racing a move, two answers at once and a lost role, on the four databases.

- [x] **4. After the move.** Tests that the items follow the new workspace from the next request:
  catalogue, item page, search, the registry API, resolve, MCP, feeds and the review queue, under
  their new names; old names install and `rmk` rewrites the lockfile; versions and tags unchanged.
  *Done when:* those tests pass, with a scope moved public → private, private → public,
  personal → shared, renamed for a clash, and moved back where it came from.

- [x] **5. The Move dialog.** On the workspace page's Scopes tab: Move…, the target select, the
  scope's name there (the clash message), the impact with the new names, the message, Move scope / Ask to move, the single and root's double confirmation, the
  row's Moving / declined line with Cancel.
  *Done when:* component tests cover each outcome and who sees Move….

- [x] **6. Scope moves on the Requests page.** The table on `/workspaces/requests` and the
  workspace's Requests tab, Approve and Decline, the nav count, the audit log's summary lines.
  *Done when:* component and nav tests pass, and an end-to-end test has an owner ask to move a
  personal scope into a team workspace and its admin approve, then root move one directly with both
  confirmations, on desktop and phone.

- [x] **7. Decision log.** MVP §15's Workspaces row (scopes move; who decides; refused rather than
  broken) and Approval (not-reviewed versions reviewed at the move). 090's Out list points here.
  *Done when:* the rows and the pointer are in.

- [x] **8. Documentation.** The topics and helpers in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

- [x] **9. A workspace's page under Workspaces.** [risky] `/workspaces/<name>` for anyone who sees the
  workspace, with each option, tab and scope action shown only to those allowed; the scope rows'
  actions as icon buttons on one line; `/admin/workspaces/<name>` redirects.
  *Done when:* component tests cover what each role sees, and the e2e tests use the new address.

- [x] **10. The list under Workspaces; Admin is root's.** [risky] Root's New workspace and Kind filter on
  `/workspaces`, names linking to their pages; `/admin/workspaces` redirects; Admin and its nav
  item only for root.
  *Done when:* component and nav tests pass, and the e2e tests and the phone sweep use the new
  pages.

- [x] **11. Decision log.** MVP §15 and §2: workspaces managed from their own pages, Admin root's.
  *Done when:* the rows are in.

- [x] **12. Documentation.** The Workspaces and Administration topics, and the helpers, in the
  ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

- [x] **13. Shared and Personal as tabs.** Root's Kind filter becomes two tabs above the list,
  Shared and Personal, each with how many match the search; the Documentation says so.
  *Done when:* the component and db tests cover the tabs and their counts, and the docs render.

- [ ] **14. The Move dialog wraps, wider.** A dialog's text wraps whatever surrounds its trigger
  (it inherited `nowrap` from the scope row's actions cell, so it scrolled sideways and hid its
  buttons); the Move dialog is 640px wide and its long names break.
  *Done when:* the e2e test checks the dialog never scrolls sideways, and fails without the fix.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
