# 092 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Membership services.** [risky] `addMembers`, `changeMemberRole`, `removeMember`,
  `setUserWorkspaces` (the difference, in one transaction) in the workspaces domain; `global`
  removal refused; root only; the audit events.
  *Done when:* db tests cover each, the global rule, a disabled user, and a non-root actor.

- [x] **2. The admin role.** [risky] `WorkspaceRole` gains `admin`; workspace permissions
  `members.manage`, `scopes.create` and `workspace.edit` (admin and root), and admin holds every
  moderator permission; the member services accept a workspace's admins for that workspace, never
  for their own membership; creating a scope in a workspace and editing its description accept its
  admins; the Moderators count includes admins.
  *Done when:* the permission-matrix test has the admin column, and db tests show an admin
  managing members, scopes and the description in their workspace and not in another.

- [x] **3. The user's Workspaces dialog** on Admin › Users, opened from the number of workspaces in
  their Role cell, which also names the workspaces they administer and moderate. Create user stays
  as it was (owner, 2026-10-07): new users are users in `global`.
  *Done when:* component tests pass.

- [ ] **4. The workspace's page for admins, and its Members.** Admin in the nav and the layout for
  admins (Workspaces only, theirs); the page's Members table, Add members, role, remove with its
  confirm; Create scope and Edit description for admins.
  *Done when:* component tests pass, and an end-to-end test has root make someone admin of a
  workspace, who then adds a member as moderator, creates a scope, and can't open another
  workspace or Users.

- [ ] **5. Documentation.** The topics and helpers in the spec.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1: one person's memberships change one at a time** (Claude, from the witness). Every
  member change locks the users' rows first (`lockUsers`, in id order) in a READ COMMITTED
  transaction: on MySQL and MariaDB two roots saving one user at once deadlocked otherwise.
  `setUserWorkspaces` keys by the stored workspace id, since MySQL matches ids ignoring case and
  trailing spaces. A root's rows are left out of the members list. A workspace deleted mid-change
  answers WorkspaceNotFoundError.
- **Task 2: the admin role** (Claude). `WorkspaceRole` is `admin | moderator | user`; admin holds
  every moderator permission plus `members.manage`, `scopes.create` and `workspace.edit`. Member
  changes, scopes (create, edit description) and the workspace's description check the workspace;
  someone who holds the permission nowhere is refused before any lookup. `pageWorkspaces` and
  `findWorkspace` give an admin only theirs (a workspace they don't administer is null, a 404).
  Root's Admin › Scopes still creates anywhere. Nobody changes or removes their own membership.
  Admin › Users names admins and moderators; Moderators counts both.
- **Admins acting at once** (Claude, from the task 2 witnesses). A member change locks the people
  changed and the actor, in the ids' canonical order (trimmed, uppercase), then reads the
  actor's role again under the lock (`requireManagerNow`): two admins demoting each other at once leave one admin, and the other is
  refused, with no deadlock on MySQL. The own-membership check compares the stored user id.
- **Create user at creation, dropped** (owner, 2026-10-07): a version of Create user with a
  Workspaces list (and an "Instance root" checkbox) was built and witnessed, then dropped before
  committing: roles are set afterwards, on the user's row or a workspace's page.
- **Task 3: a user's Workspaces** (Claude). In Admin › Users' Role column, root, or "user" with
  the number of workspaces, which opens the user's Workspaces dialog, and the workspaces they
  administer and moderate named: a separate column or another row button made the table too wide
  for the Email column. The dialog loads the memberships, edits them with `WorkspaceRows`
  (`global` always there; Add workspace; User, Moderator or Admin; Remove), saves the difference
  (`setUserWorkspaces`) and says what changed. The user-admin end-to-end test goes through it
  (from the witness: nothing clicked Add workspace or checked its default role before).
