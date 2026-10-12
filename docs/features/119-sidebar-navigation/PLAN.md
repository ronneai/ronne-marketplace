# 119 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The nav model.** `nav.ts`: each link gets a group and an icon; Admin becomes Users,
  Audit log and Settings; Docs becomes Documentation; CLI & tokens; `PROPOSE`; `groupNav`. The
  shell loads the switcher's workspaces and the fold cookie.
  *Done when:* unit tests cover the links per role (user, moderator, a workspace's admin, an owner
  of a personal workspace only, root), the groups, Requests with a count, and the current link.

- [x] **2. The sidebar.** `Sidebar`, `WorkspaceSwitcher` (the folded rail uses `BrandMark`); `AppShell` lays out the
  sidebar and the content beside it, filling the width (no cap), from `lg`; folding with its cookie; the person's menu at the
  foot; `MainNav` goes.
  *Done when:* component tests cover the groups, counts, the current link, the switcher's order
  and links, the folded rail's names, and the signed-out header.

- [x] **3. Phones and tablets.** `MenuList` (the sheet and `/menu`) shows the switcher, Propose
  item and the groups.
  *Done when:* component tests pass, and the end-to-end tests (updated for the new links, plus
  folding across a reload and the switcher) pass on desktop, phone and tablet.

- [x] **4. Decision log.** MVP §15's design-system row.
  *Done when:* the row says the navigation is a sidebar, from 119.

- [x] **5. Documentation.** The topics in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web.

- [x] **6. No Admin tabs** (owner, 2026-10-12). `admin/layout.tsx` renders the page alone;
  `AdminNav` goes, with its tests; the audit end-to-end test moves between Admin's pages through
  the sidebar.
  *Done when:* /admin/users, /admin/audit and /admin/settings show no tab strip (no navigation named
  Admin), the sidebar still marks the current page, and the unit and e2e tests pass. Documentation:
  none, since the website never mentions the tabs.
