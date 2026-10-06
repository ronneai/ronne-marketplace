# 090 — Workspaces and the global workspace

> Milestone: M13 · Depends on: 010, 059, 061 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§10](../../MVP/MVP.md#10-data-model-mvp), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: none new

## Goal

A new level above scopes: **workspace › scope › item** (owner, 2026-10-05). A workspace is an area
with its own members, roles (091, 092) and visibility (093), so one instance can serve several teams
whose items are kept apart. This feature adds the workspace itself, the `global` workspace every
instance has, and the pages where root manages them. Members, roles and private visibility build on
it.

The owner first called it a "namespace"; it's a **workspace** (owner, 2026-10-05), because it isn't
part of item names (below) and it's mainly about who has access.

## Scope

**In:**
- The `workspaces` table, and `scopes.workspace_id`: every scope belongs to exactly one workspace.
- **The `global` workspace**, created by the migration (and by setup on a new instance): reserved
  name, public, can't be renamed, edited or deleted. Every existing scope moves into it.
- **Admin › Workspaces** (root): list (server data table, 060), create (name, description,
  visibility), edit the description, delete an empty one.
- **Creating a scope** (Admin › Scopes) asks for its workspace, `global` by default. Admin › Scopes
  shows and filters by workspace.
- **Where it shows:** the item page and the catalogue card name the workspace next to the scope;
  the catalogue filters by workspace.
- Audit events `workspace.created`, `workspace.updated`, `workspace.deleted`; `scope.created` gains
  `workspace`.

**Out** (and where it goes instead):
- **Members and per-workspace roles:** [091](../091-workspace-roles/SPEC.md),
  [092](../092-workspace-members/SPEC.md).
- **Private visibility:** [093](../093-private-workspaces/SPEC.md). Until then, every workspace is
  public and the form doesn't offer Private.
- **Access requests:** [094](../094-workspace-access-requests/SPEC.md).
- **The workspace in item names.** Names stay `@scope/name` everywhere (owner, 2026-10-05): scope
  names stay unique across the instance, so `rmk`, lockfiles, the manifest, plugin feeds and URLs
  don't change.
- **Moving a scope to another workspace.** Later: it changes who can see and use every item in it,
  so it needs its own spec (what happens to dependents and installs).
- **Renaming a workspace.** Later: nothing outside depends on the name yet, but nothing needs it.

## Behaviour

**Data.**

| Table | Columns |
|---|---|
| `workspaces` | id, name (unique, 64), description (300), visibility (`public`/`private`), is_global (boolean, true on one row), created_by (set null), created_at, updated_at |
| `scopes` | + workspace_id (not null, FK, RESTRICT) |

The migration creates `global` (`public`, `is_global`), then adds `scopes.workspace_id` pointing
every existing scope at it. An item's workspace is its scope's: there's no `workspace_id` on items
or submissions, so a scope can't disagree with its items.

**Names.** The same rule as scopes (`names.ts`: lowercase letters, digits and hyphens, 1 to 64),
stored without `@`. Reserved: `global` plus the scopes' reserved list. A workspace and a scope may
share a name (`acme` workspace, `@acme` scope); they're different things.

**The global workspace.** Exists on every instance, from the migration or from setup. Its name,
description ("Everyone on this instance"), visibility (public) can't be changed, and it can't be
deleted: the edit and delete actions aren't shown, and the services refuse them
(`GlobalWorkspaceError`). Every user is a member of it (092).

**Admin › Workspaces** (root only, `workspaces.manage`):
- The table: name, visibility, scopes, members (from 092), created. Sorted by name; `global`
  first.
- **New workspace:** name, description, visibility (public only until 093).
- **A workspace's page** (`/admin/workspaces/<name>`): its description (editable), its scopes, and
  from 092 its members.
- **Delete:** only when it has no scopes; otherwise disabled with "Move or remove its scopes
  first" (nothing moves scopes yet, so in practice a workspace with scopes stays).

**Admin › Scopes.** The table gains a Workspace column and filter; **New scope** gains a workspace
select, `global` first and selected.

**The catalogue and item page.** The card and the item header show the workspace as a quiet label
before the scope when it isn't `global` ("acme · @acme-infra/deploy"). The catalogue's filters gain
**Workspace** (the ones the reader can see: all of them until 093, `global` first), once the
instance has a workspace besides `global`; a chosen one is kept in the URL (`?workspace=`).

**API.** `GET /api/v1/scopes` returns `workspace` for each scope. More API comes in 095.

## Edge cases

- **Two roots create the same workspace name at once:** the unique index decides; the second gets
  "That name is taken".
- **A scope named like a reserved workspace** (`global`): allowed; scopes have their own reserved
  list.
- **A database restored from before the migration:** migrations run on start and create `global`
  as above.
- **Deleting a workspace a request or membership points to** (094, 092): those rows go with it
  (cascade); the audit event lists how many.

## Documentation

- **A new topic, Workspaces** (`workspaces`, ronne-web and `topics.ts`): **What a workspace is**
  (`what`: workspace › scope › item, names stay `@scope/name`), **The global workspace** (`global`),
  **Creating and managing them** (`managing`). Later features add to it.
- **Scopes → What a scope is** (`scopes#what`) and **Who creates and uses them** (`scopes#who`): a
  scope belongs to one workspace, chosen when it's created.
- **Administration → a new section, Workspaces** (`admin#workspaces`).
- **Helpers:** on Admin › Workspaces, "What is a workspace?" → `workspaces#what`; on New scope,
  next to the workspace select, "Which workspace?" → `workspaces#what`.

## Acceptance criteria

- [ ] The migration creates `global` and moves every scope into it, on SQLite, PostgreSQL, MySQL and
  MariaDB; a new instance's setup has `global` too.
- [ ] Root creates a workspace, edits its description, and deletes it only while it has no scopes;
  each is audited.
- [ ] `global` can't be edited or deleted, in the UI or by calling the services.
- [ ] A new scope is created in the chosen workspace; Admin › Scopes shows and filters by it.
- [ ] The catalogue filters by workspace, and the card and item page show a non-global workspace.
- [ ] Nobody but root can reach Admin › Workspaces or its actions.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Called workspace, not namespace** (owner, 2026-10-05).
2. **Not part of item names** (owner, 2026-10-05): scope names stay unique across the instance.
3. **No `workspace_id` on items** (Claude): the scope carries it, so moving a scope later moves its
   items in one update.

## Open questions

None.
