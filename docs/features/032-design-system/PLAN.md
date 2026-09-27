# 032 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Fonts.** Copy Manrope from the local `docs/UI-Mocks-Materials/` (git-ignored; ask the owner if it's missing), and add IBM Plex Mono 500 and 600
  from IBM's release, each with its OFL text, under `apps/web/src/app/fonts/`. Load them with
  `next/font/local`, and record the OFL-1.1 font rule in the dependency policy (§1).
  *Done when:* a production build serves the fonts from `/_next/static`, and the page makes no request to Google.

- [ ] **2. Tokens and themes.** `tokens.css` with the two palettes, the Tailwind 4 `@theme` mapping,
  the `ronne-theme` cookie read in the root layout (`data-theme` on `<html>`), and a toggle action.
  *Done when:* tests cover the cookie → `data-theme` logic, and a contrast test passes for every
  documented pair in both themes.

- [ ] **3. Primitives.** Button, Input (with password show/hide), Checkbox, Label and field error,
  Card and Panel, Badge, Notice, Table, Tabs, Dialog, CopyableCommand, Page header, in
  `components/ui`, each with tests. `lucide-react` goes through the dependency checklist first.
  *Done when:* the tests pass, and the lint checks (no raw hex; no shadow, gradient or red, yellow
  or green classes) run in `pnpm lint`.

- [ ] **4. App shell.** Header (brand, role-aware navigation, user menu), footer and content column,
  and the brand SVGs and favicons in `public/`. The setup-required screen uses the new parts.
  *Done when:* a render test covers the navigation for `user` and `root`, and the favicon matches the theme.

- [ ] **5. Styleguide page.** `/styleguide`, root-only in production, showing every primitive in both themes.
  *Done when:* it renders; checked by hand in both themes and at 390px wide, with screenshots in Notes.

## Notes
