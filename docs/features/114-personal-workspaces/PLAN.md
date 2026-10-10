# 114 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Migration.** [risky] `workspaces.owner_id` (nullable, unique, FK `user`, RESTRICT); for
  every user without one, a private workspace named by the spec's rule and an `admin` membership,
  in batches; `versions.reviewed` (boolean, not null, default true) for decision 3.
  *Done when:* the migration's db test covers existing users and roots, name clashes and reserved
  names, and a second run that changes nothing, on the four databases; the migration guard test
  passes.

- [ ] **2. Created with every user.** [risky] Create user (008), setup's root (003, 036) and
  `reset-setup` make the workspace and membership in the same transaction as the user; the name
  rule with `-2`, `-3`… under the unique index.
  *Done when:* db tests cover Create user, setup, two users with the same local part at once.

- [ ] **3. The personal rules in the services.** [risky] Refuse adding members, changing or
  removing the owner's row, Make public, delete, and join requests (kept by name as for an unknown
  name, 094) for a personal workspace, root included (`PersonalWorkspaceError`, or the unknown-name
  answer for requests); root's catalogue, search, home page and plugin
  marketplace leave out others' personal workspaces unless named.
  *Done when:* db tests cover each refusal and root's lists; the 093 guard test still
  passes.

- [ ] **4. Approved when submitted.** [risky] In a personal workspace, Submit (013, 052, 112)
  approves at once (`self_approved`, audited `submission.approved` with `self: true`), shows the
  risk flags to the author, and Release marks the version `reviewed: false`. Root override and the
  review queue unchanged elsewhere.
  *Done when:* db tests cover submit, bulk submit with dependency drafts, release and the queue
  leaving them out; a shared workspace still needs another reviewer.

- [ ] **5. Visibility key.** The plugin feeds' key (093) counts only private workspaces with a
  released item.
  *Done when:* a feed test shows two users with empty personal workspaces sharing one cache entry,
  and a user with a released personal item getting their own.

- [ ] **6. Pages.** The Workspaces page's Personal row and Manage; the workspace page without
  Members, Requests, visibility and Delete for a personal one, reachable by its owner without the
  Admin nav; Admin › Workspaces' Kind filter and owner column; "Personal" in the editor's scope
  list and the catalogue's Workspace filter; the Approved notice on a personal submission.
  *Done when:* component tests pass, and an end-to-end test has a user create a scope in their
  personal workspace, submit, release and see the item, while another user gets not found, on
  desktop and phone.

- [ ] **7. API, `rmk` and MCP.** `personal` on `GET /api/v1/workspaces` and `GET /api/v1/me`;
  `rmk workspaces` shows `personal`; `rmk export` groups its scopes first; `list_workspaces`
  carries it.
  *Done when:* API, CLI and MCP tests pass.

- [ ] **8. Decision log.** MVP §15: Workspaces (a personal one per user), Approval (personal
  workspaces released without review, per decision 3), Scopes (anyone creates scopes in their
  personal workspace); MVP §2 personas.
  *Done when:* the rows are in.

- [ ] **9. Documentation.** The topics and helpers in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
