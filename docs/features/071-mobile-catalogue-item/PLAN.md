# 071 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Seed for the hard cases.** A 64-character scope, an item with 5 and one with 30
  dependencies, an item whose risk flag has a 200-character URL; add them to `e2e/seed.ts` and
  `e2e/pages.ts`.
  *Done when:* the sweep lists the failures these cause under 071.

- [ ] **2. Catalogue and home.** Scope select width, the Type and Sort selects below `sm`, card
  meta wrapping; fix what the sweep finds on home.
  *Done when:* catalogue unit tests pass; `catalogue.mobile.e2e.ts` filters by type and sorts on a
  phone.

- [ ] **3. Item shell and Overview.** Breadcrumb, README padding, Install card, risk-flag code
  breaking, phone order.
  *Done when:* item-page unit tests pass; the sweep passes on the risk-flag item.

- [ ] **4. Canvas: interaction.** `ComposerCanvas` props for read-only on a coarse pointer
  (`panOnDrag` off, `panOnScroll` off, `zoomActivationKeyCode`), the two-finger hint, the 0.6
  minimum fit with centring.
  *Done when:* unit test on the fit helper; e2e on tablet (one-finger drag scrolls the page) and
  desktop (wheel scrolls the page).

- [ ] **5. Canvas: phones.** List plus "View as graph" sheet below `md`; MiniMap off in the sheet;
  44px controls.
  *Done when:* `item.mobile.e2e.ts` opens the sheet and pinches (Playwright touch) on the
  5-dependency item.

- [ ] **6. Usage, versions, styleguide.** Breakdown grid, swatch grid; check versions against 069.
  *Done when:* unit tests pass; the sweep passes on these pages.

- [ ] **7. Documentation pages.** `TypesExplorer` stacking, `Example` wrapping, "On this page"
  select.
  *Done when:* docs render tests pass, including the select's links landing on real sections.

- [ ] **8. Documentation text.** "Composing on a canvas" and "Reading an item before you install
  it".
  *Done when:* the docs render tests pass; the sweep's 071 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
