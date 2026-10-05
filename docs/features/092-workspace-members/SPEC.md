# 092 — Workspace members

> Milestone: M13 · Depends on: 090, 091, 008, 061 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles) · Contracts: none new

## Goal

Root decides who is in each workspace and with which role (owner, 2026-10-05): when creating a
user (every new user is a `user` in `global` by default, and root can change that role and add
more workspaces), on the user's page, and on the workspace's page.

## Scope

**In:**
- **Create user** (008): a Workspaces part with `global` (role `user` by default, changeable to
  `moderator`) and **Add workspace** rows (workspace, role).
- **A user's memberships** on Admin › Users: a Workspaces column (count, with the moderated ones
  named), and a **Workspaces** dialog per user to add, change the role, and remove.
- **A workspace's members** on its page (`/admin/workspaces/<name>`, 090): a Members table (name,
  email, role, added), **Add members** (search users, pick a role), change role, remove.
- **Rules:** nobody is removed from `global`; root's own memberships aren't needed (root is
  everywhere) and aren't offered.
- Audit events `workspace.member_added`, `workspace.member_role_changed`,
  `workspace.member_removed`.

**Out** (and where it goes instead):
- **Requests to join:** [094](../094-workspace-access-requests/SPEC.md).
- **Moderators managing members.** Root only, here; moderators approve requests (094).
- **Inviting people by email.** Notifications are out of scope for the MVP; users are still created
  only in the web app by root.

## Behaviour

**Create user.** Below Role (now **root or not**, a checkbox "Instance root", 059's rules), a
**Workspaces** list:

| Workspace | Role | |
|---|---|---|
| global | User ▾ | (can't remove) |
| *Add workspace* | | |

Adding picks a workspace not yet listed and a role (`user` by default). With "Instance root"
ticked, the list is hidden with "Root works in every workspace". Creating writes the user and the
memberships in one transaction, with `user.created` (`{ email, root, workspaces: [{name, role}] }`)
and one `workspace.member_added` per row.

**A user's workspaces** (Admin › Users, row action **Workspaces**): the same list, editable; Save
applies the difference in one transaction, an event per change. A root's row shows "All
workspaces" and no action.

**A workspace's members.** The Members table on the workspace page (`DataTable`, sorted by name;
filter by role). **Add members**: search by name or email (users not yet members, not disabled,
not root), pick several, one role for all. Each row: role select, **Remove** (with a confirm that
says what happens to their open submissions, per 091). `global`'s page lists everyone and offers
only role changes.

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

## Documentation

- **Workspaces → Members and roles** (`workspaces#roles`, 091): adding and removing members, the
  role per workspace, `global` for everyone.
- **Administration → Users** (`admin#users`): the workspaces when creating a user, and the
  Workspaces dialog.
- **Helpers:** in Create user, next to Workspaces, "Why is global always there?" →
  `workspaces#global`; on Add members, "What can each role do?" → `roles#permissions`.

## Acceptance criteria

- [ ] Creating a user gives `global` / `user` by default; root can make it moderator and add other
  workspaces with roles; everything is written in one transaction and audited.
- [ ] Root adds, changes and removes members from the user's dialog and from the workspace's page;
  each change is audited.
- [ ] Nobody can be removed from `global`, in the UI or the services.
- [ ] Non-roots can't reach any of these actions.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Every new user is a `user` in `global`; root picks other roles and workspaces at creation**
   (owner, 2026-10-05).
2. **Only root manages members** (Claude, from the owner's "assigned by root").

## Open questions

None.
