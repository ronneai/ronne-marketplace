# 158 — Typography refinement

> Milestone: M27 · Depends on: 032, 129 · Design: the owner's typography brief (2026-10-31) · Contracts: none

## Goal

The app reads like a polished developer platform: one clean sans for everything people read, and
IBM Plex Mono only for machine values. Not a redesign: the layout, colours and behaviour stay.

## Scope

**In:**
- **Inter replaces Manrope** (owner's choice, 2026-10-31), self-hosted (the Latin subset, which covers
  English, Brazilian Portuguese and Canadian French) through `next/font/local`. Weights are 400, 500
  and 600; body text is 400.
- **A type scale** as Tailwind utilities in `globals.css` (`type-page-title`, `type-section`,
  `type-card-title`, `type-nav`, `type-body`, `type-id`, `type-version`, `type-meta`, `type-badge`,
  `type-group-label`), used by the page title, the badge, the sidebar and the catalogue card. Numbers
  that line up use tabular figures.
- **Monospace only for machine values:** names, versions, commands, paths, hashes, tokens, codes and
  inputs for them. Emails, dates, counts, sizes, breadcrumbs, labels and "ok/error" prefixes move to Inter.
- **Catalogue card:** the date sits in the footer after the installs, so a risk badge never pushes it
  onto a row of its own; the name is 13px at 500, and still breaks at `-` and `/` first.
- **Sidebar:** the Reviews count is a 20px pill that shows up to `99+`; "/ marketplace" sits beside
  the logo, in mono and muted grey, and fades as the rail folds; group labels are Inter 11px 600.
- **Copy buttons** on code blocks (`CopyableCommand`) are icon only; the label is their accessible
  name, and the "select it yourself" text still shows when copying is blocked.
- **Bug:** `ScanRequest` and `ScanOverride` have keys, which ends React's "unique key" warning on the
  review screen.

**Out:** colours, spacing, layout and any change to data, routes or permissions; the other ~35
hard-coded sizes in feature screens (moved to the scale as those screens are touched).

## Behaviour

- Fonts load from the app's own files; no request to a font service (`fonts.test.ts`).
- The count badge shows `99` as 99 and 100 or more as `99+`.
- A long package name in a compact card stays at two lines, the whole name on hover.

## Edge cases

- A script outside Latin (not in the three languages) falls back to the system font.
- The muted grey of "/ marketplace" is the muted token at 70%, about 6:1 on light and 5.7:1 on dark.

## Documentation

None. The website's Documentation names no typeface and describes no count badge or copy-button label;
no inline helper changes. Facts checked against `../ronne-web/www/src/content/docs` on 2026-10-31.

## Acceptance criteria

- [x] Inter is self-hosted with its licence and checksum, and Manrope is gone (`fonts.test.ts`).
- [x] The type scale utilities exist and the page title, badge, sidebar and card use them.
- [x] No `font-mono` on emails, dates, counts, sizes, breadcrumbs or labels.
- [x] The compact card keeps its date out of the badge row (`item-card-compact.test.tsx`).
- [x] The nav count shows `99+` above 99 (`AppShell.test.tsx`).
- [x] The copy button on a code block is icon only (`ui.test.tsx`).
- [x] The review screen no longer warns about missing keys.
- [x] Lint, typecheck, tests, build and e2e pass.
