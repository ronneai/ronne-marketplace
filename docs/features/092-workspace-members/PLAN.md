# 092 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Membership services.** `addMembers`, `changeMemberRole`, `removeMember`,
  `setUserWorkspaces` (the difference, in one transaction) in the workspaces domain; `global`
  removal refused; root only; the audit events.
  *Done when:* db tests cover each, the global rule, a disabled user, and a non-root actor.

- [ ] **2. Create user.** `createUser` takes workspaces and roles; the "Instance root" checkbox
  replaces the role select; `user.created` carries the workspaces.
  *Done when:* user-admin tests and the Create user dialog test pass.

- [ ] **3. The user's Workspaces dialog** on Admin › Users, and the Workspaces column.
  *Done when:* component tests pass.

- [ ] **4. The workspace's Members** on its page: table, Add members, role, remove with its
  confirm.
  *Done when:* component tests pass, and an end-to-end test creates a user in a workspace as
  moderator, then removes them.

- [ ] **5. Documentation.** The topics and helpers in the spec.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
