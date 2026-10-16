# 122 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. `TabLinks` in `components/ui`.** The workspace page's strip, extracted: a
  labelled `<nav>` of links in a `ScrollStrip` with `aria-current="page"` on the current one; takes
  `{ id, label, href }[]` and the current id. Add it to the styleguide.
  *Done when:* component tests cover the links, the single current tab, an unknown current id and
  the coarse-pointer class; the styleguide test passes.

- [x] **2. The workspace page uses it.** Replace the inline strip with `TabLinks`; no change in
  behaviour.
  *Done when:* the workspace page's tests and the existing e2e tests for its tabs pass unchanged.

- [x] **3. Settings in tabs.** Split `/admin/settings` into Usage, Plugin feeds and Authentication
  by `?tab=`, falling back to Usage; load only the active tab's data; the panels' actions keep the
  tab. Move the panel components under `features/admin-settings/` by tab.
  *Done when:* tests cover the default, an unknown value, each tab's content, the feed query being
  skipped on other tabs, a save staying on its tab, and a non-root 404 on every tab.

- [ ] **4. The Authentication tab's frame and Sign-in methods panel.** The ordered panel list in
  `features/admin-settings/authentication/`, and the read-only Sign-in methods panel with its
  `auth-methods` helper.
  *Done when:* a component test shows the panel and the helper, and the e2e test (root opens
  `?tab=authentication`) sees it.

- [ ] **5. Phone sweep and e2e.** Add the three tabs to the phone sweep and to the e2e test of
  Settings (switch tabs, back button, save the usage policy and stay).
  *Done when:* `pnpm test:e2e` passes the settings spec on the desktop, phone and tablet projects.

- [ ] **6. Documentation.** The `admin#settings` section and the helper, in ronne-web (en, pt, fr)
  and here.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2: the workspace page's e2e coverage** (from the witness). The "Workspace" strip is driven
  by `user-admin.e2e.ts`; `navigation.mobile.e2e.ts`'s "tab strips show the current tab" exercises
  the item page's strip, not this one. The phone-webkit project needs `playwright install webkit`
  once per machine.
- **Task 3: the tabs** (Claude). `features/admin-settings/tabs.ts` holds the tabs and `settingsTab`
  (Usage for anything unknown); the page reads only the shown tab's data. The panels moved to
  `usage/` and `feeds/`; `actions.ts` and `types.ts` stay shared. No browser test yet saves on a
  tab (task 5), and the phone sweep visits only the bare address (task 5 adds the others).
