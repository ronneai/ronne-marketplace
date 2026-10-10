# 113 — Renaming a workspace

> Milestone: M13 · Depends on: 090, 092, 093, 094, 095, 118 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (118 defines names and aliases)

## Goal

A workspace's name can change (owner, 2026-10-09): a team renames itself, or a workspace was
created with a placeholder. Root and the workspace's admins rename it. 090 left it out because
nothing needed it; now teams ask, and 114's personal workspaces start with a generated name their
owners will want to change.

## Scope

**In:**
- **Rename** on a workspace's page (`/admin/workspaces/<name>`, 090), next to Edit description, for
  root and the workspace's admins (092). A personal workspace's owner renames theirs too (114).
- The same name rule as creating one (090: `names.ts`, 1 to 64 lowercase letters, digits and
  hyphens; reserved names refused), unique across workspaces.
- `global` can't be renamed (090), in the UI or by calling the services.
- Audit event `workspace.renamed` (`{ from, to }`).
- **Its items are renamed** (118): `@old/scope/x` becomes `@new/scope/x`, and every old name
  becomes an alias, so lockfiles, dependencies and links keep working.
- **What follows the name:** the workspace's addresses (its Admin page, its join link), the
  catalogue's `?workspace=` filter, `workspace` in the API and `rmk` (095), its items' names and
  plugin names (118). The id, members, scopes, open requests and the plugin feeds' visibility key
  (ids, 093) don't change.

**Out** (and where it goes instead):
- **Redirects from the workspace's old name** (its page, join link, `?workspace=`). None
  (decision 2): the old workspace name answers as an unknown one, and can be taken by another
  workspace. Its items' old names are aliases (118), which is a different thing.
- **Renaming scopes.** Only as part of a move (115).
- **A rename history** beyond the audit log.

## Behaviour

**Who.** The permission `workspace.rename`, held by root everywhere and by a workspace's admins in
theirs (with `workspace.edit`, 092). Moderators and users can't. An admin can rename `global` no
more than root can.

**The dialog.** **Rename** opens a dialog with the current name filled in, a field for the new one
checked as typed (the name rule; "That name is taken" once sent), and what changes:

> Its 12 items will be renamed from `@acme/…` to `@acme-platform/…`. Their old names keep working
> for installs, lockfiles and dependencies, and `rmk` moves projects to the new names as they
> update; in Claude Code they show as new plugins. Links to this workspace (its page and its join
> link) will stop working, and so will the old name in `rmk search --workspace`,
> `rmk feed build --workspace` and any CI workflow that names it.

Saving renames the workspace and writes its items' aliases in one transaction and goes to the new address
(`/admin/workspaces/<new>`). The audit log reads "Renamed workspace acme to acme-platform".

**Names in use.** The new name must be free among workspaces (the unique index decides when two
renames race; the second gets "That name is taken") and not reserved. A workspace and a scope may
share a name (090), so a scope's name is no obstacle. The rename is refused if any of its items'
new names is already an alias of another item (118), with the list; this only happens when a
workspace takes a name another workspace had before.

**Requests to a name no workspace had** (094). 094 keeps a request to an unknown name and gives it
to a workspace created with that name later. A rename does the same: open requests kept for the new
name become the workspace's, so the name answers exactly as it would have for a created workspace.
The audit event counts them (`requestsJoined`).

**The old name.** Answers as a name no workspace has, everywhere: the join page, the API's
`?workspace=` (no results), `workspace_not_found` in the feeds and `rmk feed build`. Requests
already made to the workspace keep their workspace (they hold its id), so its answerers still see
them; requests made later to the old name are kept by name, as for any unknown name.

**Plugin feeds and the catalogue.** Plugin names include the workspace (118), so the rename raises
the catalogue revision (079) and the next build has the new names.

**API and `rmk`.** Items' names, `workspace.name` on items, search results,
`GET /api/v1/workspaces` and `GET /api/v1/me` show the new name from the next request. A lockfile
naming `@old/scope/x` still installs through the alias, and `rmk` rewrites it to the new name
(118).

## Edge cases

- **Renaming to the same name, or to the same name in other letter case:** names are stored
  lowercase, so it's the same name; nothing is saved and nothing is audited.
- **An admin renames while root deletes the workspace:** the second to commit gets "That workspace
  no longer exists".
- **An admin loses the role while the dialog is open:** the save is refused (`not_permitted`), as
  for any admin action (092).
- **A private workspace's new name** is seen only by those who saw the old one (093); renaming
  can't reveal it to anyone else. Asking for a name that's taken by a private workspace answers
  "That name is taken" only to root and its admins, who are the only ones who can rename.
- **A personal workspace** (114) is renamed by its owner or root; the same rules apply.

## Documentation

- **Workspaces → Creating and managing them** (`workspaces#managing`): renaming, who can, what
  changes (links, `--workspace` in `rmk` and CI) and what doesn't (item names, members, installs).
- **Administration → Workspaces** (`admin#workspaces`): the Rename action.
- **Helper:** in the Rename dialog, "What changes when I rename?" → `workspaces#managing`.

## Acceptance criteria

- [ ] Root and the workspace's admins rename it; moderators, users and admins of other workspaces
  can't, in the UI or the services.
- [ ] `global` can't be renamed.
- [ ] The name rule, reserved names and uniqueness hold, including two renames at once.
- [ ] After a rename the new name works everywhere (Admin page, join link, catalogue filter, API,
  `rmk workspaces`, `rmk feed build --workspace`), and the old one answers as unknown.
- [ ] Its items take the new name, and their old names install, resolve and redirect as aliases.
- [ ] A rename that would give an item another item's alias is refused.
- [ ] Open requests kept for the new name join the workspace.
- [ ] The rename is audited with the old and new names.
- [ ] The dialog passes the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Root and the workspace's admins rename it** (owner, 2026-10-09).
2. **No redirect from the workspace's old name** (Claude): a redirect would keep the old name
   reserved forever and, for a private workspace, tell anyone who knew the old name the new one.
   Item aliases (118) are seen only by those who see the item, so they don't.
3. **`global` stays unrenamable** (090).

## Open questions

None.
