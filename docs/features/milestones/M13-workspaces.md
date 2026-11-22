# M13 — Workspaces

> [All milestones](README.md) · [Features index](../README.md)

A level above scopes: **workspace › scope › item** (owner, 2026-10-05). A workspace has members,
roles per workspace (moderator, user; root stays instance-wide) and a visibility, public or private.
Every instance has `global` (public, reserved, can't be edited or removed), and every user is in it.
Item names stay `@scope/name`: scope names stay unique across the instance, so `rmk`, lockfiles and
plugin feeds don't change (until 118: scope names unique per workspace, items named
`@workspace/scope/name`, `@scope/name` for `global`; owner, 2026-10-09). Build order: 090 → 091 → 092 → 093 → 094 → 095, then 118 → 113 → 114 → 115
(owner, 2026-10-09). 116 and 117 stay planned; 134 moves single items between scopes (owner, 2026-10-27). Inviting people by email isn't planned (owner,
2026-10-09).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [090](../workspaces/090-workspaces/SPEC.md) | Workspaces and the global workspace: `workspaces`, `scopes.workspace_id` (every scope in `global`), Admin › Workspaces, the workspace when creating a scope, the catalogue's Workspace filter | 010, 059, 061 | done |
| [091](../workspaces/091-workspace-roles/SPEC.md) | Roles per workspace: `workspace_members`; moderator and user per workspace, root instance-wide; today's moderators become `global` moderators; every check made in the item's workspace; the review queue per workspace; submitting needs membership | 090, 014, 016, 059 | done |
| [092](../workspaces/092-workspace-members/SPEC.md) | Workspace members and the admin role: admin per workspace (a moderator's permissions plus its members, scopes and description), new users in `global` as users, a user's Workspaces dialog, a workspace's Members tab (for root and its admins); nobody leaves `global`; audited | 090, 091, 008, 061 | done |
| [093](../workspaces/093-private-workspaces/SPEC.md) | Private workspaces: seen only by members and root everywhere (not found to others), dependable only inside their workspace, turning private refused while outside items depend on it, plugin feeds per visibility key, `rmk feed build --workspace` | 090, 091, 092, 089, 018, 019, 020, 027, 077, 079 | done |
| [094](../workspaces/094-workspace-access-requests/SPEC.md) | Asking to join: the Workspaces page, a join link for private ones, requests answered by root or the workspace's moderators and admins, a Requests page and a nav count, audited | 090, 091, 092, 093, 007 | done |
| [095](../cli-api/095-workspaces-cli-api/SPEC.md) | Workspaces in `rmk`, MCP and the API: `GET /api/v1/workspaces`, `workspace` on items and `me`, `rmk workspaces`, `search --workspace`, export grouped by workspace, MCP `list_workspaces` | 090, 091, 093, 094, 019, 022, 027, 038 | done |
| [113](../workspaces/113-rename-workspaces/SPEC.md) | Renaming a workspace: root and the workspace's admins; `global` can't be; its items take the new name, old names kept as aliases; the workspace's old name answers as unknown (no redirect); audited | 090, 092, 093, 094, 095, 118 | done |
| [114](../workspaces/114-personal-workspaces/SPEC.md) | Personal workspaces: one per user (roots too), private always, only its owner (as admin) and root; submitted items approved at once and marked not reviewed; left out of root's lists unless named; `personal` in the API, `rmk` and MCP | 090–095, 118, 113, 008, 059, 077, 079 | done |
| [115](../workspaces/115-move-scopes/SPEC.md) | Moving a scope to another workspace: asked by the source's admins (a personal workspace's owner) or root; at once for root and `global`'s admins (two confirmations) and admins of the target, otherwise a request to its admins or root (root only for `global`); items renamed, old names kept as aliases; a scope-name clash renames the scope; not-reviewed versions need someone else; refused while a dependency would break; audited | 090–094, 118, 113, 114, 014, 015, 077, 079 | done |
| [118](../workspaces/118-workspace-in-names/SPEC.md) | The workspace in item names: scope names unique per workspace; `@workspace/scope/name`, `@scope/name` meaning `global`; old names kept as aliases that reserve their name; the manifest, API, resolver, `rmk` (lockfile rewritten to the new name), MCP, feeds and URLs; `client_too_old` for older `rmk` | 090–095, 011, 015, 019, 020, 022, 027, 037, 077, 097 | done |
| 116 | Per-workspace tokens: a personal access token limited to some of its user's workspaces, for `rmk`, MCP and the feeds | 009, 093, 095 | planned |
| 117 | Asking for a role: a member asks to be a workspace's moderator (or admin), answered by its admins or root, like a request to join | 092, 094 | planned |
| [134](../items/134-move-items/SPEC.md) | Moving an item to another scope in the same workspace: any member asks, the workspace's moderators, admins or root move at once or answer; versions unchanged, the old name kept as an alias; a History tab with every name change (134, 115, 113, 118) | 091, 092, 094, 113, 115, 118, 017, 044 | done (the Documentation in ronne-web `feat/134-move-items`) |
