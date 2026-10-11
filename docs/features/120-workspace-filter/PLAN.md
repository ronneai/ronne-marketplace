# 120 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. The current workspace.** [risky] A cookie (`ronne-workspace`) and
  `currentWorkspace(params, shell)`: the `?workspace=` parameter first, then the cookie, checked
  against the user's memberships on every request (`loadShell`); `all` or empty means none; a stale
  cookie is cleared. A route that sets or clears it and redirects back to a same-site path only
  (no open redirect). The redirect that adds `?workspace=` to a filtered page.
  *Done when:* unit tests cover the order, `all`, a stale or foreign cookie, a private workspace
  you're not in (nothing shown, same message as unknown), and the route's redirect target checks.

- [ ] **2. The switcher.** All workspaces, the member's workspaces with the current one marked, each
  with Open page, and Manage workspaces; choices are links to task 1's route back to the same page;
  the button shows the current workspace. The folded rail and the Menu sheet too.
  *Done when:* component tests cover the list, the marking, the links and the folded name.

- [ ] **3. The filtered pages.** A shared "Showing <name> only · Show all" line (with its helper).
  Catalogue: the parameter from the current workspace, its Filters select kept. Reviews: every tab
  filtered, its Workspace select and `queue-workspaces` helper removed, the "you don't review in"
  message. My submissions: a `workspace` filter in the service and repository (server-side, paged).
  New item: the first scope of the current workspace preselected. Paging and sorting keep it.
  *Done when:* component tests and `*.db.test.ts` for My submissions' filter pass (on the database
  servers too); counts in the sidebar are unchanged by it (a test).

- [ ] **4. End to end.** Choose a workspace, see the catalogue, reviews and my submissions narrowed,
  reload, Show all; a shared link; a private workspace in the URL by a non-member; without
  JavaScript; on desktop and phone.
  *Done when:* the end-to-end tests pass on every project.

- [ ] **5. Decision log.** MVP §15's Workspaces row.
  *Done when:* it records the current workspace, the URL as the truth, and that it's not a boundary.

- [ ] **6. Documentation.** The topics, section and helpers in the spec, both `topics.ts`, in a
  ronne-web branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.
