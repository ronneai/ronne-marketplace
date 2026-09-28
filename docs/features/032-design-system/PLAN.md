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

- [x] **4. App shell.** Header (brand, role-aware navigation, user menu), footer and content column,
  and the brand SVGs and favicons in `public/`. The setup-required screen uses the new parts.
  *Done when:* a render test covers the navigation for `user` and `root`, and the favicon matches the theme.

- [x] **5. Styleguide page.** `/styleguide`, root-only in production, showing every primitive in both themes.
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
- **Task 4 (2026-09-27): app shell and brand assets.**
  - **`components/app-shell/AppShell.tsx`:**
    - header with `BrandMark`, "ronne" and a mono "/ registry", role-aware navigation (`nav.ts`:
      Home, and Admin for root only), and `aria-current`;
    - a user menu on a native `<details>`, which works without JavaScript: Account, Access tokens,
      theme buttons (`setThemeFromForm`), and Sign out via a `signOutAction` prop that 006 wires;
    - a 1024px content column and a footer.
  - **The home page moved to `app/(app)/`,** whose layout renders the shell with `user={null}` until 006 protects it.
  - **`components/ui/BrandMark.tsx`:** the monogram's paths inline. The stem is `fill-current` and the
    corner `fill-accent`, so it follows the theme, including the manual toggle.
  - **The brand wordmark SVG wasn't used,** because it draws "ronne AI" as live `<text>`, which falls
    back to another font inside an `<img>`. The shell writes "ronne" in Manrope instead.
  - **Favicons:**
    - `app/icon.svg` uses the favicon paths, with a `prefers-color-scheme: dark` rule inside the SVG
      (browsers follow the OS for tab icons);
    - `app/icon.png` is the 401px light PNG, as a fallback.

    Adobe XMP and C2PA metadata was stripped from the public copies.
  - **The setup-required screen** now uses `Panel`, `BrandMark`, `CopyableCommand` and `Notice`.
  - **Vitest** now resolves the `@/` alias (it isn't read from tsconfig). Before that, three test
    files failed to import, so a "passed" count alone wasn't enough.
  - **Checked live:** a configured instance renders the shell (dark theme via the cookie); both icons are
    linked; `/icon.svg` returns 200 as `image/svg+xml`; setup mode shows the restyled screen.
- **Task 5 (2026-09-27): styleguide.** `/styleguide` (`src/app/(app)/styleguide/page.tsx`) renders
  `features/styleguide/Styleguide.tsx`: the same sample twice, in a `data-theme="light"` and a
  `data-theme="dark"` container, with the colour swatches, type, buttons, fields, badges, notices,
  table, tabs, copyable command, dialog and panel.
  - **Access:** `canViewStyleguide(nodeEnv, user)` allows everyone outside production, and only root in
    production. Until 006 passes the signed-in user, the page returns 404 in production for everyone.
  - **Design rule change:** the shadow check matched the page's copy "no shadow". It now matches only
    a `shadow` or `drop-shadow` class token, or a CSS `box-shadow:`. Throwaway files with `shadow-lg`, a bare `shadow` class and
    `box-shadow` still fail it.
  - **Checked by hand** in Chrome against `pnpm dev`: both themes side by side at 1200px, and at 390px
    wide (the swatches wrap and there's no horizontal scroll), with no console errors. A production
    build (`next start`) returns 404 at `/styleguide` and 200 at `/`. Screenshots weren't kept in the
    repo; the UI materials they'd sit next to stay private.
- **Changed later (2026-09-27, owner decision, on the 006 branch):** the header and footer now span the
  full width, and the content column is 72% of the width from 1024px up (it was 1024px). Sign-in uses
  the new `BrandLogo` (monogram and wordmark) in place of the monogram alone, and so does the header
  (34px tall, 24px on phones, where the navigation padding also tightens so it fits at 360px). SPEC.md has the rule.
- **Fixed later (2026-09-27, on the 009 branch, owner's report):**
  - **The current navigation item didn't follow navigation,** in the header (Home, Admin) or in the
    admin tabs (Users, Audit log). Next.js keeps layouts mounted across client-side navigation, and
    the current item came from the first request's path. `MainNav` and `AdminNav` are now client
    components that read `usePathname()`. The audit end-to-end test clicks through and checks the
    highlight each time; with a broken `AdminNav` it failed as expected.
  - **In the dark theme, the current header item didn't show,** because the tint is the header's own
    navy. It now also uses the link colour and a semibold weight. `link` on `tint` joined the
    contrast tests.
  - **The theme switch moved** from the user menu to a header button: system → light → dark, with a
    Monitor, Sun or Moon icon. It's still a form, so it works without JavaScript. On phones, the
    user menu opens from an icon in place of the word "account", so the header fits at 360px.
- **Changed later (2026-09-27, owner decision):** only light and dark, no "system" (follow the OS).
  Light is the default; an old `system` cookie reads as light. The `prefers-color-scheme` block in
  `tokens.css` is gone (a test checks it stays gone), and the header button switches light ↔ dark,
  showing a moon in light and a sun in dark. The favicon still follows the browser's own setting.
- **Changed later (2026-09-27, owner decision):** the header shows the user's **name**, not their
  email (cut at 12rem). The open menu starts with the name and the email, on every screen size.
  Phones keep the icon. The end-to-end users got readable names (`E2E_NAMES`), and the tests find
  the name in the header's menu button (`e2e/helpers.ts`).
- **Changed later (2026-09-27, 010):** the header gained "Scopes" for everyone. On phones, "Home"
  hides (the logo links home) and the header's padding and gaps are tighter, so three links still
  fit at 360px.

