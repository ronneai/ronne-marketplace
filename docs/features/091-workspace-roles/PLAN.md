# 091 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration.** [risky] `workspace_members`; a `global` row per non-root user (moderator for
  moderators); `user.role` `moderator` → `user`. New users get the `global` row in `createUser`.
  *Done when:* migration tests pass on the four databases with roots, moderators and users.

- [x] **2. Roles and the check.** [risky] `Role` becomes `root | user` for `user.role` and
  `moderator | user` for memberships; `can(user, perm, workspace)` with instance and workspace
  permissions split in the type, so a workspace permission without a workspace doesn't type-check;
  memberships loaded with the session and the token's user.
  *Done when:* a permission-matrix test passes for root, moderator in A, user in A, and a non-member.

- [ ] **3. Submissions domain.** [risky] Drafts, submit, withdraw, proposals, composer, dependency
  search, bulk submit, the draft upload API: membership of the scope's workspace; `not_a_member`;
  scope lists filtered; `GET /api/v1/scopes` adds `role`.
  *Done when:* the submissions db tests pass, with new cases for a non-member and a removed member.

- [ ] **4. Reviews and releases.** [risky] Reviews, decisions, bulk approve and release, publish:
  the workspace's moderator; bulk skips with reasons; the review queue's query and counts filtered,
  its Workspace filter.
  *Done when:* review and release db tests pass, and an end-to-end test has a moderator of A
  approve in A and not see B.

- [ ] **5. Items domain.** [risky] Versions (tags, deprecate, yank), the item page's actions.
  *Done when:* versions tests pass with workspace cases.

- [ ] **6. Shell, nav and pages.** Reviews in the nav when moderating any workspace; role badges
  show "root", or the roles per workspace on Admin › Users (read only until 092).
  *Done when:* shell and nav tests pass, and the phone sweep passes for each role.

- [ ] **7. Decisions and Documentation.** MVP §2 (roles table and matrix), §9.5, §10
  (`workspace_members`, `user.role`), §15 ("Approval", "Roles" rows); the topics and helpers.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2 keeps behaviour while the call sites move** (Claude). `can()` and `requirePermission()`
  take the workspace for a workspace permission, and leaving it out doesn't type-check. So task 2
  could land green, every existing workspace check became `canInSome()` / `requireInSome()`
  ("held in some workspace"), which is what they meant while everyone was only in `global`. Tasks 3
  to 5 replace each with the item's workspace; `requireInSome` goes in task 5, and `canInSome`
  stays only for the nav and the shell (task 6).
- **Admin › Users offers only root and user** from task 2: `moderator` is refused by `changeRole`
  and `createUser` (`InvalidRoleError`), and the role filter has root and user. Making someone a
  moderator comes back with 092's member admin.
- **Tests:** `createTestUser(app, { role: "moderator" })` still works and means a moderator of
  `global`; `setWorkspaceRole(app, userId, role, workspaceId?)` changes or adds a membership.

