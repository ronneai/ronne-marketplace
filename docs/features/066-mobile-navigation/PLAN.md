# 066 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Account menu closes.** Close the `<details>` in `AppShell.tsx` on an outside pointer
  down, Esc and route change (a small client hook in `components/app-shell`).
  *Done when:* unit tests cover the three.

- [x] **2. The menu sheet.** `MobileMenu.tsx` in `components/app-shell`: Menu button with the
  Reviews count, a side sheet built on 067's `Dialog` `side` variant (or a local one if 067 hasn't
  landed: then move it when it does), links from `nav.ts`, account part, appearance switch, Sign
  out. Header below `lg` shows logo and Menu; from `lg` as today.
  *Done when:* `AppShell` tests per role pass; `navigation.mobile.e2e.ts` opens, follows a link,
  closes on Esc, outside tap and back.

- [ ] **3. `/menu` without JavaScript.** `app/(app)/menu/page.tsx`, the same list; the Menu button
  is a link that JavaScript turns into the sheet; add it to `e2e/pages.ts`.
  *Done when:* a JavaScript-off e2e signs out from `/menu`.

- [ ] **4. `ScrollStrip`.** In `components/ui`, with the current-tab scroll, edge fades and coarse
  pointer height; used by `Tabs` when its choices don't fit.
  *Done when:* unit tests cover the active tab and the fades (by class, with a mocked size).

- [ ] **5. Move the strips.** Item page tabs, `DocsNav` (with group labels), `AdminNav`, the
  queue tabs, the submissions status links; the docs sidebar max height.
  *Done when:* existing unit tests pass; a phone e2e opens `?tab=risks` and sees the tab; the
  tablet project scrolls the docs sidebar to its last topic.

- [ ] **6. Documentation.** "(the Menu on a phone)" where the docs mention the navigation.
  *Done when:* the docs render tests pass; the sweep's 066 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
