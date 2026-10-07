# 092 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Membership services.** [risky] `addMembers`, `changeMemberRole`, `removeMember`,
  `setUserWorkspaces` (the difference, in one transaction) in the workspaces domain; `global`
  removal refused; root only; the audit events.
  *Done when:* db tests cover each, the global rule, a disabled user, and a non-root actor.

- [ ] **2. The admin role.** [risky] `WorkspaceRole` gains `admin`; workspace permissions
  `members.manage`, `scopes.create` and `workspace.edit` (admin and root), and admin holds every
  moderator permission; the member services accept a workspace's admins for that workspace, never
  for their own membership; creating a scope in a workspace and editing its description accept its
  admins; the Moderators count includes admins.
  *Done when:* the permission-matrix test has the admin column, and db tests show an admin
  managing members, scopes and the description in their workspace and not in another.

- [ ] **3. Create user.** `createUser` takes workspaces and roles (admin included); the "Instance
  root" checkbox replaces the role select; `user.created` carries the workspaces.
  *Done when:* user-admin tests and the Create user dialog test pass.

- [ ] **4. The user's Workspaces dialog** on Admin › Users, and the Workspaces column.
  *Done when:* component tests pass.

- [ ] **5. The workspace's page for admins, and its Members.** Admin in the nav and the layout for
  admins (Workspaces only, theirs); the page's Members table, Add members, role, remove with its
  confirm; Create scope and Edit description for admins.
  *Done when:* component tests pass, and an end-to-end test has root make someone admin of a
  workspace, who then adds a member as moderator, creates a scope, and can't open another
  workspace or Users.

- [ ] **6. Documentation.** The topics and helpers in the spec.
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

