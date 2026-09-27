# 032 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Fonts.** Copy Manrope from the local `docs/UI-Mocks-Materials/` (git-ignored; ask the owner if it's missing), and add IBM Plex Mono 500 and 600
  from IBM's release, each with its OFL text, under `apps/web/src/app/fonts/`. Load them with
  `next/font/local`, and record the OFL-1.1 font rule in the dependency policy (§1).
  *Done when:* a production build serves the fonts from `/_next/static`, and the page makes no request to Google.

- [x] **2. Tokens and themes.** `tokens.css` with the two palettes, the Tailwind 4 `@theme` mapping,
  the `ronne-theme` cookie read in the root layout (`data-theme` on `<html>`), and a toggle action.
  *Done when:* tests cover the cookie → `data-theme` logic, and a contrast test passes for every
  documented pair in both themes.

- [x] **3. Primitives.** Button, Input (with password show/hide), Checkbox, Label and field error,
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
- **Task 2 (2026-09-27): tokens and themes.**
  - **`src/app/tokens.css`:** the light theme on `:root` and `[data-theme="light"]`, and the dark
    theme on `[data-theme="dark"]` and on `[data-theme="system"]` under `prefers-color-scheme: dark`.
    A test keeps those two dark blocks identical.
  - **`globals.css`:** `@theme inline` maps the tokens to utilities (`bg-canvas`, `bg-surface`, `text-fg`,
    `text-muted`, `border-hairline`, `border-strong`, `bg-accent`, `text-on-accent`, `text-link`,
    `bg-tint`, `outline-focus`, `rounded-control`, `rounded-panel`). `inline` keeps `var()`, so
    themes switch at runtime.
  - **The light theme is changed from its design note** (owner decision): white on teal was 2.54:1 and
    the teal focus ring on white 2.4:1, both failing WCAG. Labels on teal are now Ink (7.37:1) in both
    themes, and the light focus ring is Navy (15.97:1).
  - **`tokens.test.ts`** reads the hex values from `tokens.css` and checks 9 pairs per theme: text 4.5:1,
    focus ring 3:1.
  - **The theme cookie:** `features/theme/theme.ts` (`ronne-theme`: `system`, `light` or `dark`, with
    anything else meaning `system`), and a `setTheme` server action. The root layout reads the cookie
    and renders `data-theme` on the server. Checked live: no cookie, `dark`, `light`, and `bogus` (→ `system`).
- **Task 3 (2026-09-27): primitives** in `apps/web/src/components/ui/` (exported from `index.ts`):
  Button (`buttonClasses` for links styled as buttons), Field (`Input`, `Label`, `FieldError`,
  `TextField`, `Checkbox`), `PasswordInput` (show/hide), `Panel` and `PageHeader`, `Badge`, `Notice`,
  `Table` (`Th`, `Td mono`), `Tabs`, `Dialog` (a native `<dialog>`, so the browser handles the focus
  trap, inert background and Esc) and `CopyableCommand`. Only token utilities are used.
  - **`lucide-react` 1.48.0** for icons: ISC, no dependencies (React peer only), no install scripts, and
    an active organisation repository. GitHub shows the license as "NOASSERTION" because the repo also
    credits Feather's MIT icons; the npm package declares ISC. Checklist done here.
  - **Tests:** `ui.test.tsx` covers render and accessibility (labels, `aria-describedby`, `aria-invalid`,
    `role=alert` only for errors, tabs roles, dialog labelling). Interactions (copy, show/hide, tab
    switching, dialog open and close) get Playwright tests once 006 sets up the harness; no DOM
    simulation dependency was added.
  - **The design rules** are enforced by `src/design-rules.test.ts` (part of `pnpm test`, not `pnpm lint`,
    since Biome can't express them). Over `components/` and `features/`, with comments ignored, it
    rejects raw hex colours, shadows, gradients and red, yellow or green classes. It was checked with a
    deliberately bad file.

