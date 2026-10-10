# 113 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Service.** [risky] `renameWorkspace` in `domains/workspaces/services/workspaces.ts`:
  `workspace.rename` for root and the workspace's admins, `global` refused
  (`GlobalWorkspaceError`), the name rule and reserved names, the unique index under the
  workspace's row lock, 094's requests kept for the new name joined to the workspace, an alias for
  every item (118) and a refusal when a new name is another item's alias, the catalogue revision
  raised, the audit event `workspace.renamed` (`{ from, to, items, requestsJoined }`).
  *Done when:* db tests cover who may rename, `global`, a taken and a reserved name, two renames at
  once, the aliases, the alias refusal, the joined requests and the audit event, on the four
  databases.

- [x] **2. The Rename dialog.** On the workspace's page for root and its admins: the field, the
  warning, Save, then the new address. The audit log's summary line for `workspace.renamed`.
  *Done when:* component tests cover the dialog and who sees it, and an end-to-end test renames a
  workspace as its admin and opens the new address (and the old one answers not found), on desktop
  and phone.

- [x] **3. The old name everywhere.** Tests that the old name answers as unknown and the new one
  works in the join page, `?workspace=` on the catalogue and `GET /api/v1/items`,
  `GET /api/v1/workspaces`, and the feeds' `?workspaces=` (`workspace_not_found` for the old);
  the items install by their old names and `rmk` rewrites the lockfile.
  *Done when:* those tests pass.

- [x] **4. Decision log.** MVP §15's Workspaces row: renaming by root and the workspace's admins,
  its items renamed with aliases, no redirect for the workspace's own name. 090's Out list points
  here.
  *Done when:* the row and the pointer are in.

- [ ] **5. Documentation.** The topics and the helper in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1:** a rename locks the workspace's items, then its row, the order a release takes them,
  and a release now locks its own workspace too and refuses if it was renamed after packing
  (`WorkspaceRenamedError`). Member audit events name the workspace, not its id: after a rename, a
  user declined under the old name whose membership changed since waits out the decline period
  instead of asking at once (094's `membershipChangedSince`). Narrow and only stricter, so left. Delete and description edits now lock the
  row and read it again by name, as a rename does. A rename rewrites the workspace's item names
  (`name`, dependencies, a skill's `agent:`) in its unreleased submissions' files (working copy and
  latest revision), in place, base64 ones too; otherwise they failed `name_mismatch` or
  `dependency_not_found`. It locks the workspace's scopes and open submissions first (submit takes
  scope locks; saves now take their submission's), so a submit or save can't land halfway. Drafts and proposals lock their scope before
  reading the name (a rename holds it), and `renameDraft` locks scopes before its row. Foreign-key
  checks take shared locks on parent rows, so a rename, a first release and a proposal can still
  meet in a cycle on PostgreSQL (rare): the workspace, submission and release-store transactions
  now run again when the database ends a deadlock with them (`retryOnDeadlock`, db/locks.ts). Work run again that way must keep its state inside the
  transaction: three draft services collected `rewritten` outside it and listed files twice; they
  empty it at each attempt now (a test forces one retry). After three deadlocks in a row the
  database's error still reaches the caller. The creation-race test is probabilistic: it caught a
  missing scope lock in 1 of 4 server runs.
- **Task 2:** the dialog reads the item count when it opens (`renameImpact`), as Make private
  reads its impact. The e2e renames a seeded workspace per project (`E2E_RENAME`), since a rename
  changes what other tests would find. No repo test types an invalid name into the field (the
  witness checked it by hand); the New workspace hint no longer says names can't change.
