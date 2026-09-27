# 032 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Fonts.** Copy Manrope from the local `docs/UI-Mocks-Materials/` (git-ignored; ask the owner if it's missing), and add IBM Plex Mono 500 and 600
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
- **Task 1 (2026-09-27): fonts.** They live in `apps/web/src/app/fonts/`, each with its OFL text, plus a `README.md` giving the source and SHA-256, and are loaded by `src/app/fonts.ts` (`next/font/local`, weights "500 600", `display: swap`). Tailwind's `--font-sans` and `--font-mono` point at them.
  - **Manrope:** the owner's file. Its hash differs from google/fonts `main` (an earlier build, both OFL); OFL text from google/fonts.
  - **IBM Plex Mono:** IBM's variable release `@ibm/plex-mono-variable@1.0.0`, upright (`Var-Roman.woff2`, 83 KB), with IBM's `license.txt`.
  - **Checked:** the production build serves both from `/_next/static/media`, there are no Google font references in `.next/`, and Next adds metric-matched fallbacks. `fonts.test.ts` checks the OFL texts, the README hashes against the files, and that nothing loads from a font service.
  - The policy's OFL-1.1 font rule (§1) was added with the M1 specs (#20), so nothing more was needed here.

