# 143 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §8 lists the search on every page, and §15's "Search" row covers the dialog and the
    results page.
  - `docs/features/README.md` lists 143 in M22 with its dependencies.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The search namespace.**
  - `messages/<locale>/search.json` in the three languages, with the glossary of
    [i18n.md](../../knowledge/i18n.md); the raw-text lint covers `features/search`.
  - *Done when:* the parity test passes with the new namespace.

- [ ] **3. The dialog.**
  - `features/search/`: the combobox, debounced queries with the late-answer guard, item rows, In
    this workspace, Go to from `nav.ts`, See all results, keyboard and focus return.
  - *Done when:* component tests cover typing, a late answer ignored, keyboard navigation, the
    workspace toggle, Go to for a user, a moderator and root, the empty and failing states.

- [ ] **4. Opening it.**
  - The sidebar button, the header icon below `lg`, `⌘K`/`Ctrl+K` and `/`, with the code editor
    and open-dialog exceptions.
  - *Done when:* AppShell tests cover each way in and each exception.

- [ ] **5. The results page.**
  - `/search` with paging, the type filter and the workspace, as a `GET` form that works without
    JavaScript; the page title.
  - *Done when:* page tests cover results, paging, the filter and the empty state, and an e2e test
    (desktop, phone, phone-webkit) searches, opens an item from the dialog and from the page.

- [ ] **6. Phones and accessibility.**
  - Full-screen dialog below `sm`, 44 px rows, announcements.
  - *Done when:* the phone sweep and tap-target checks include the dialog and `/search`, and an axe
    check reports no serious issues.

- [ ] **7. Documentation.**
  - `items#search` gains the dialog, shortcuts, Go to and the page (three languages); the helper on
    `/search`.
  - *Done when:* the docs render tests pass, and the helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
