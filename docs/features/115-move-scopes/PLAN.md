# 115 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Migration.** [risky] `scope_moves` (id, scope_id, from_workspace_id, to_workspace_id,
  requested_by, new_name (the scope's name in the target), message, status `open/approved/declined/cancelled`, decided_by, reason,
  created_at, decided_at; cascade with the scope and the target workspace; one open per scope
  checked in the service under the scope's row lock, since MySQL has no partial indexes);
  `versions.reviewed_by` (nullable FK `user`, set null) for approved not-reviewed versions.
  *Done when:* the migration's db test passes on the four databases; the guard test passes.

- [ ] **2. The checks.** [risky] `moveImpact(scope, target)`: outside dependents with a private
  target, the scope's own dependencies on another private workspace (released, not yanked, and
  open submissions), open submissions outside that depend on it, authors who aren't target
  members, not-reviewed versions, the items' new names, a scope-name clash in the target and new
  names that are another item's alias. Reuse 093's `outsideDependents`.
  *Done when:* db tests cover each case, public and private targets, and a personal source.

- [ ] **3. Asking, answering, moving.** [risky] `requestScopeMove`, `cancelScopeMove`,
  `approveScopeMove`, `declineScopeMove`, and the direct move for root and admins of the target,
  following the spec's table; the asker's role re-checked at approval; the move transaction (the
  scope's workspace and name, the items' aliases (118), reviewed versions, the request, the
  catalogue revision, the audit event) under the release lock; the four audit events.
  *Done when:* db tests cover every row of the table, not-reviewed versions, the refusals at ask and
  at approve, a release racing a move, two answers at once and a lost role, on the four databases.

- [ ] **4. After the move.** Tests that the items follow the new workspace from the next request:
  catalogue, item page, search, the registry API, resolve, MCP, feeds and the review queue, under
  their new names; old names install and `rmk` rewrites the lockfile; versions and tags unchanged.
  *Done when:* those tests pass, with a scope moved public → private, private → public,
  personal → shared, renamed for a clash, and moved back where it came from.

- [ ] **5. The Move dialog.** On the workspace page's Scopes tab: Move…, the target select, the
  scope's name there (the clash message), the impact with the new names, the message, Move scope / Ask to move, the single and root's double confirmation, the
  row's Moving / declined line with Cancel.
  *Done when:* component tests cover each outcome and who sees Move….

- [ ] **6. Scope moves on the Requests page.** The table on `/workspaces/requests` and the
  workspace's Requests tab, Approve and Decline, the nav count, the audit log's summary lines.
  *Done when:* component and nav tests pass, and an end-to-end test has an owner ask to move a
  personal scope into a team workspace and its admin approve, then root move one directly with both
  confirmations, on desktop and phone.

- [ ] **7. Decision log.** MVP §15's Workspaces row (scopes move; who decides; refused rather than
  broken) and Approval (not-reviewed versions reviewed at the move). 090's Out list points here.
  *Done when:* the rows and the pointer are in.

- [ ] **8. Documentation.** The topics and helpers in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
