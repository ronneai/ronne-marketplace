# 092 — Workspace members

> Milestone: M13 · Depends on: 090, 091, 008, 061 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles) · Contracts: none new

## Goal

Root decides who is in each workspace and with which role (owner, 2026-10-05): on the user's row in
Admin › Users and on the workspace's page. Creating a user stays as it is (owner, 2026-10-07):
every new user is a `user` in `global`, and their other roles are set afterwards.

A third role in a workspace, **admin** (owner, 2026-10-07), runs one workspace without being root:
everything a moderator does there, plus its members (admins included), its scopes and its
description. Someone can be admin of their team's workspace and a plain user elsewhere. Root still
works in every workspace and keeps everything instance-wide.

## Scope

**In:**
- **The admin role** in a workspace (owner, 2026-10-07): a moderator's permissions there, plus
  managing its members (any role, admin included), creating its scopes and editing their
  descriptions, and editing the workspace's description. Admin of `global` is allowed.
- **Admins in Admin:** the Admin area opens to someone who administers at least one workspace,
  showing only Workspaces, and only theirs; each one's page is where they manage it.
- **A user's memberships** on Admin › Users: in the Role column, the number of workspaces, with
  the ones they administer and moderate named; the number opens a **Workspaces** dialog per user
  to add, change the role, and remove.
- **A workspace's members** on its page (`/admin/workspaces/<name>`, 090), under a **Members** tab
  next to **Scopes**: a Members table (name, email, role, added), **Add members** (search users,
  pick a role), change role, remove.
- **Rules:** nobody is removed from `global`; root's own memberships aren't needed (root is
  everywhere) and aren't offered. Root manages every workspace's members; an admin, their
  workspace's.
- Audit events `workspace.member_added`, `workspace.member_role_changed`,
  `workspace.member_removed`.

**Out** (and where it goes instead):
- **Requests to join:** [094](../094-workspace-access-requests/SPEC.md).
- **Moderators managing members.** Admins and root, here; moderators approve requests (094).
- **Admins beyond their workspace:** creating or deleting workspaces, creating users, instance
  settings and the audit log stay root's.
- **Inviting people by email.** Notifications are out of scope for the MVP; users are still created
  only in the web app by root.

## Behaviour

**Roles in a workspace** (091's, plus admin):

| Role | Can, in that workspace |
|---|---|
| **user** | create drafts, submit, propose changes, comment on own, release own approved |
| **moderator** | a user's, plus review, approve, reject, release, move tags, deprecate and yank |
| **admin** | a moderator's, plus manage members (add, change any role, remove), create scopes and edit their descriptions, edit the workspace's description |

Root holds all of them in every workspace. The new workspace permissions are `members.manage`,
`scopes.create` (in the workspace) and `workspace.edit`; `workspaces.manage` (create, delete,
list every workspace) and `users.manage` stay root's. Creating a scope from Admin › Scopes stays
root's; an admin creates one from their workspace's page. Admin › Workspaces' Moderators column
counts moderators and admins, who both review.

**Admins in the Admin area.** Admin shows in the nav for root and for anyone who administers a
workspace. For an admin it has only Workspaces, listing the workspaces they administer; each opens
its page, with its scopes (Create scope there) and its members. Users, Scopes, Settings and the
audit log stay 404 for them, and so does a workspace they don't administer.

**Create user** is unchanged (008, 059): email, name, role (user or root) and password. A new user
is a `user` in `global` (091); a new root has no memberships. Their other workspaces and roles are
set from their row or a workspace's page.

**A user's workspaces** (Admin › Users, the number of workspaces in their Role cell): a dialog
with their workspaces and roles:

| Workspace | Role | |
|---|---|---|
| global | User ▾ | (can't remove) |
| acme | Admin ▾ | Remove |
| *Add workspace* | | |

`global` is always there; adding picks a workspace not yet listed and a role (`user` by default).
Save applies the difference in one transaction, an event per change. A root's row shows "root"
and no dialog.

**A workspace's members.** The workspace page has two tabs, **Scopes** (the default) and
**Members** (`?tab=members`), so each server data table keeps its own address. The Members table
(`DataTable`, sorted by name or by when they were added; searched by email or name; filtered by
role; 50 a page). Searches match a name as typed on every database; folding the case of letters
beyond ASCII ("ölaf" finding "Ölaf") is the database's, and SQLite doesn't. **Add members**: search by name or email (users not yet members, not disabled,
not root), pick several, one role for all. Each row: role select, **Remove** (with a confirm that
says what happens to their open submissions, per 091). `global`'s page lists everyone and offers
only role changes.

**Who manages members.** Root, in every workspace; an admin, in theirs, `global` included when
they're admin there. An admin can make others admin of that workspace and change or remove any
member's role there, other admins included, but not their own (another admin or root does), so
nobody locks themselves out by mistake. A user's Workspaces dialog on Admin › Users stays root's.

**Root and memberships.** Making someone root (059) keeps their rows; they're ignored while root.
Taking root away from someone leaves them with whatever rows they had, plus `global` / `user` if
missing.

## Edge cases

- **Removing someone's last non-global workspace:** allowed; they keep `global`.
- **Two roots edit the same user's memberships at once:** each change is an upsert or delete on its
  own row; the later write wins per row and both are audited.
- **A disabled user:** their memberships stay and show; adding them to a workspace is offered on
  their user page, not in Add members' search.
- **Deleting a workspace** (090) removes its rows; the audit event counts them.
- **The last admin of a workspace removes themselves:** refused; they can't change or remove their
  own membership. Another admin or root does.
- **An admin's workspace page** offers Edit description and Create scope, but not Delete
  (root's).

## Documentation

- **Workspaces → Members and roles** (`workspaces#roles`, 091): adding and removing members, the
  role per workspace (admin included), `global` for everyone, who manages members.
- **Roles** (`roles`): the three roles in a workspace (user, moderator, admin) and the matrix with
  the admin column.
- **Administration → Workspaces** (`admin#workspaces`): what an admin sees, the Members table,
  Create scope on a workspace's page.
- **Administration → Users** (`admin#users`): the Workspaces column and dialog; a new user starts
  in `global`.
- **Helpers:** in a user's Workspaces dialog, "Why is global always there?" →
  `workspaces#global`; on Add members, "What can each role do?" → `roles#permissions`.

## Acceptance criteria

- [ ] A new user is a `user` in `global`, and Create user stays as it was.
- [ ] Root adds, changes and removes members from the user's dialog and from the workspace's page;
  each change is audited.
- [ ] Nobody can be removed from `global`, in the UI or the services.
- [ ] An admin of a workspace reviews and releases there, manages its members (admins included,
  not themselves), creates its scopes and edits its description, and can't do any of it in
  another workspace; a user and a moderator can't do any of it.
- [ ] Admins see Admin with only their workspaces; everyone else but root can't reach any of
  these actions.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Every new user is a `user` in `global`; their other roles are set afterwards, on their row or
   a workspace's page, not at creation** (owner, 2026-10-07; it was "root picks other roles and
   workspaces at creation", 2026-10-05).
2. **Root and the workspace's admins manage members** (owner, 2026-10-07; it was "only root",
   from the owner's "assigned by root").
3. **Admin is a role in a workspace: a moderator's permissions plus members, scopes and the
   workspace's description; admins grant admin; admin of `global` is allowed** (owner, 2026-10-07).
4. **Nobody changes or removes their own membership** (Claude): so an admin can't lock themselves
   out by mistake; another admin or root does.

## Open questions

None.
