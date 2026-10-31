# 158 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is ticked once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)).

## Tasks

- [x] **1. Inter and the type scale.** `fonts.ts`, the font files and README, the `type-*` utilities,
  the page title, badge and styleguide on them.
  *Done when:* `fonts.test.ts` passes, Manrope is gone from the code, and `globals.css` has the utilities.

- [x] **2. Monospace only for machine values.** `font-mono` removed from human text.
  *Done when:* emails, dates, counts, sizes, breadcrumbs and labels carry no `font-mono`, and the tests pass.

- [x] **3. Card, sidebar and copy button.** The card's date in the footer, the `99+` count pill,
  "/ marketplace" beside the logo, the icon-only copy button, and keys on the scan actions.
  *Done when:* the matching tests in the spec's criteria pass.
