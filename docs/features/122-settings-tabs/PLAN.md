# 122 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. `TabLinks` in `components/ui`.** A strip of links with `role="tablist"`/`tab`,
  `aria-selected`, the segmented look and the equal-columns / `ScrollStrip` rule of `Tabs`; takes
  `{ id, label, href }[]` and the current id. Read `Tabs.tsx` and the hand-rolled strip in
  `app/(app)/workspaces/[name]/page.tsx` first, and share their styles instead of copying them.
  Add it to the styleguide.
  *Done when:* component tests cover selection, the equal-columns and scrolling cases and keyboard
  focus; the styleguide test passes.

- [ ] **2. The workspace page uses it.** Replace the inline strip with `TabLinks`; no change in
  behaviour.
  *Done when:* the workspace page's tests and the existing e2e tests for its tabs pass unchanged.

- [ ] **3. Settings in tabs.** Split `/admin/settings` into Usage, Plugin feeds and Authentication
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
