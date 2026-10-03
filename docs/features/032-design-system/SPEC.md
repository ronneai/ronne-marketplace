# 032 — Design system and app shell

> Milestone: M1 · Depends on: 001 · Design: [MVP §8](../../MVP/MVP.md#8-web-application), [§9.3](../../MVP/MVP.md#93-frontend-feature-first)
> · Source material: `docs/UI-Mocks-Materials/` (brand, fonts, Stitch mocks and the two `DESIGN.md` files). **It's git-ignored and kept only on the owner's machine**, so this spec records every rule and token needed to build from. Only what the app serves (fonts, logos, favicons) is copied into `apps/web` and published.

## Goal

Turn the brand and the two design notes into code once, so every M1 page (sign-in, account,
admin) is built from the same tokens, fonts and components, in a light and a dark theme. Pages then
compose parts; they don't restyle them.

## Scope

**In:**
- Design tokens for both themes, as CSS variables, mapped into Tailwind's theme.
- Self-hosted fonts: Manrope (the variable font in the materials) and IBM Plex Mono, with their licenses.
- Light and dark themes, switched by a button in the header next to the user menu, and remembered in a cookie. Light is the default. There's no "follow the OS" mode (owner decision, 2026-09-27; it was the default before).
- `components/ui` primitives: Button, Input (text, password with show/hide), Checkbox, Label and
  field error, Card and Panel, Badge, Notice, Table, Tabs, Dialog, CopyableCommand, and Page header.
- The app shell: a header with the full brand (`BrandLogo`) and navigation, a user menu (showing the user's name; the menu adds the email), a footer, and a centered content column.
- Brand assets: the favicon (light and dark), the monogram (`BrandMark`) and the full brand, monogram plus wordmark (`BrandLogo`), from `Branding/SVG`.
- An internal `/styleguide` page (root only in production) showing every primitive in both themes.

**Out:**
- Page-specific layouts → the features that own them (006–009 in M1; the catalogue in 018).
- Charts and graphs, which no MVP page needs.

## Behaviour

**The two design notes are one system.** `ronne_pure_technical_minimal/DESIGN.md` (light) and
`ronne_dark/DESIGN.md` (dark) share every rule except colour roles:

| Rule | Both themes |
|---|---|
| Fonts | **Manrope** for human text (UI, titles, prose). **IBM Plex Mono** for machine values: ids, versions, commands, tokens, paths, codes. Badges and other pills (filter chips, step numbers, initials) use Manrope (owner, 2026-10-02). |
| Weights | 500 and 600 only. No 400 or 700. |
| Depth | **Completely flat.** No shadows, blurs, glows or gradients. Surfaces separate by tone and 1px hairlines. |
| Radii | 6px for buttons and inputs, 8px for cards, panels and dialogs, full pill for badges. |
| Spacing | A 4 and 8px rhythm (4, 8, 12, 16, 24). Dense, with 36px controls. |
| Notices | **Red for errors and amber for warnings, and nowhere else** (owner's style-guide mock, 2026-09-28; it replaces "no red, yellow or green"). Both keep the mono prefix (`WARN:`, `ERR:`), so the colour is never the only signal. Information stays a framed panel. |
| Accent | Teal `#18B6A4` is the one accent: primary buttons, focus rings, active states, badges. |

**Palette** (the brand sheet): Ink `#0B1220`, Navy `#14213D`, Teal `#18B6A4`, Mint `#BFE9E1` and Paper `#F7F9FA`.

| Role (token) | Light | Dark |
|---|---|---|
| `canvas` | Paper `#F7F9FA` | Ink `#0B1220` |
| `surface` (cards, panels, inputs) | White `#FFFFFF` | Navy `#14213D` |
| `text` | Ink `#0B1220` | Paper `#F7F9FA` |
| `text-muted` (labels, meta) | Navy `#14213D` | Mint `#BFE9E1` |
| `border` | `rgba(20, 33, 61, 0.10)` | `rgba(191, 233, 225, 0.12)` |
| `border-strong` (notices, containment) | `rgba(20, 33, 61, 0.30)` | Teal or Mint hairline |
| `accent` (marks, borders, selections) | Teal | Teal |
| `accent-strong` (fills that carry text: primary buttons, accent badges) | **Deep teal `#0D7C70`** | Deep teal |
| `on-accent` (text on `accent-strong`) | **White** | White |
| `focus` (focus ring) | **Navy** | Teal |
| `link` | Navy, semibold | Teal |
| `tint` (selection, soft fill) | Mint | Navy |

- **Chart colours are the second exception** (owner, 2026-10-01, [047](../047-usage-on-item-page/SPEC.md)):
  the usage charts give each AI tool its own colour, from the owner's item overview mockup one step
  deeper so each passes 3:1 on both surfaces and the colour-blind checks: `chart-cursor` teal-600
  `#0D9488`, `chart-claude-code` indigo-500 `#6366F1`, `chart-codex` amber-600 `#D97706`, in both
  themes. The daily bars are `chart-neutral` on a `chart-well`, with the peak in `chart` (Deep teal
  on light, Teal on dark). These are chart series only: amber still means a warning everywhere
  else, and a run that ended in an error is a labelled row, never red.
- **Syntax colours are the first exception to a single accent** (owner, 2026-09-30, [044](../044-item-contents/SPEC.md)):
  code in the viewer and editor uses GitHub's Primer syntax palette as `syntax-*` tokens (grey
  comments, green keys, blue strings and constants, purple keywords, never red), at 4.5:1 on the
  surface and the tint in both themes.
- **Teal is never text in the light theme** (the light note's rule). It fails contrast on white. In
  the dark theme, teal text is allowed (7.4:1 on Ink).
- **White labels on teal fills** (owner decision, 2026-09-28, replacing the Ink labels decided on
  2026-09-27). White on the brand Teal would be 2.54:1 and fail WCAG, so fills that carry text
  (primary buttons, accent badges) use **Deep teal `#0D7C70`**: white on it is 5.08:1, and it keeps
  at least 3.1:1 against every background of both themes. The brand Teal stays for marks, borders,
  selections and the dark focus ring. Buttons and badges look the same in both themes.
- **Errors and warnings** (owner's style-guide mock, 2026-09-28): `error` Red `#D9383A` (dark
  `#FF6B6B`) and `warning` Amber `#C07D18` (dark `#F6AD55`) for fills, borders and bars;
  `error-text` `#C22F31` and `warning-text` `#9A6414` in the light theme, where the fill colours
  are under 4.5:1 on Paper (the dark theme uses the fill colours for text); `error-subtle` and
  `warning-subtle` backgrounds (`#FEF2F2`, `#FFFBEB`; dark `#361317`, `#33220F`); `on-error` white
  (dark Ink). They're used for: invalid and warned fields (red or amber border, `ERR:`/`WARN:`
  line), error and warning notices (subtle fill, a 3 px bar), `warning` and `error` badges (risk
  flags, changes requested, rejected), the `destructive` button (delete, withdraw, leave without
  saving), and the `ERR:`/`WARN:` prefixes in issue lists.
- **The light focus ring is Navy** (15.97:1), not the design note's teal ring (2.4–2.5:1 on white
  or Paper, which fails WCAG; owner decision, 2026-09-27).
- Tokens live in `apps/web/src/app/tokens.css` as CSS variables under `:root` (light) and
  `[data-theme="dark"]`. Tailwind 4's `@theme` maps them to utilities (`bg-surface`, `text-muted`,
  `border-hairline`…), so components never use raw hex values.
- **Theme choice:** stored in a `ronne-theme` cookie (`light`, `dark` or `system`). The root layout
  reads it and sets `data-theme` on `<html>` on the server, so there's no flash of the wrong theme.
  `system` follows `prefers-color-scheme`.

**Fonts** are self-hosted with `next/font/local`, with no request to Google at runtime (it's a
self-hosted product):
- Manrope: `docs/UI-Mocks-Materials/Manrope-VariableFont_wght.ttf`, copied to `apps/web/src/app/fonts/`, weights 500–600.
- IBM Plex Mono: 500 and 600, from IBM's official release.
- Both are OFL-1.1. They're allowed for font files only (dependency policy §1), and their license
  texts ship next to the files.

**Icons:** the Stitch mocks load Material Symbols from Google's CDN. The app uses a local icon set
instead, with no runtime CDN: `lucide-react` (ISC), if it passes the dependency checklist. Icons are
16 or 20px, stroke only, in `text` or `text-muted`.

**Primitives** follow the notes' component specs:

| Component | Key rules |
|---|---|
| Button | `primary` (teal fill), `secondary` (surface with a hairline), `ghost`. 36px high, 6px radius, Manrope 600 14px. A 2px teal focus ring. A `loading` state disables it and keeps its width. |
| Input | 36px, surface, hairline border. Focus: a strong border plus a teal ring. `type=password` has a show/hide button. Errors show below, as a mono `ERR:` line, not red. |
| Badge | A pill, Manrope 600 11px, the default font (owner, 2026-10-02; IBM Plex Mono before). `accent` (teal) and `muted` (mint on light, navy on dark). |
| Notice | A surface with `border-strong`, a mono prefix (`INFO:`, `WARN:`, `ERR:`) and a semibold title. |
| Table | Header on `canvas`, 12px semibold. Rows 36–40px with a hairline between them. Machine values in mono. |
| CopyableCommand | A mono command with a `copy` button (clipboard API, "copied" for 2s). Used for `rmk` snippets and the one-time token display. |
| Dialog | An 8px panel, flat, focus trapped, closes on Esc. |

**App shell** (from the mocks' header):
- **Left:** the monogram, "ronne", and a muted "/ registry".
- **Middle:** navigation, showing only pages that exist. In M1 that's the home page, and **Admin** for root. Catalogue, Reviews, Composer and Releases arrive with their features.
- **Right:** the user's email, a role badge (`root`, `moderator`) and a menu (Account, Access tokens, theme, Sign out).
- **Footer:** the version and license, and GitHub.
- **Layout:** the header and footer span the full width. The content column is 72% of the width from 1024px up (owner decision, 2026-09-27, for more room), and full width with 24px side padding below that (16px on mobile). The sign-in and setup screens keep their narrow centered card.

**Phones and tablets** (M10, [065](../065-mobile-foundations/SPEC.md); owner, 2026-10-02). Every
feature builds to these; [`docs/knowledge/mobile-layout.md`](../../knowledge/mobile-layout.md) has
the how.
- **Widths:** phone below 640px (`sm`), tablet 640–1023px, desktop from 1024px (`lg`), with
  Tailwind's default breakpoints only. Supported from 360px; at 320px nothing is cut off.
- **No sideways page scroll.** Only things wide by nature scroll sideways, inside their own frame:
  a code line in a `pre`, a wide Markdown table, a tab strip.
- **Touch targets:** on a coarse pointer (`pointer-coarse:`), every control's tap area is at least
  44×44px; the drawn control may stay smaller, with the area added around it. Everywhere, nothing
  under 24×24px (WCAG 2.2 AA, 2.5.8). Desktop density doesn't change.
- **Form fields are 16px on a coarse pointer,** so iOS Safari doesn't zoom the page on focus.
- **Nothing only on hover.** What a `title` or `group-hover` reveals is also reachable by a tap and
  by the keyboard.
- **Heights use `dvh`, not `vh`;** fixed and sticky edges pad themselves with the safe-area insets
  (`pt-safe`, `pb-safe`, `px-safe`).
- **The page scrolls, not boxes inside it,** on phones: no nested vertical scroll areas except a
  dialog's body and a menu's list.
- **The browser bar** takes the header's colour (`surface`) of the chosen theme (`theme-color`).

**Not taken from the mocks, on purpose:**
- **The `daemon: local (0.14.0)` chip.** There's no daemon.
- **Amber "Lifecycle Hook" and "Permissions: Exec" badges** in the light catalogue mock. They break
  the no-yellow rule. Risk flags (MVP §12) use neutral badges and notices instead.
- **Copy claiming "cryptographically verified" packages.** Signing is post-MVP (MVP §14.2).
- **The light sign-in `screen.png`**, which is a failed download: its content is the text
  `<FIFE Image failed to fetch>`. Its `code.html` is intact and was used instead.

## Edge cases

- **Contrast:** every text and background pair meets WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI
  parts) in both themes. Checked in tests from the token values.
- **Reduced motion:** no animations beyond instant state changes. The "copied" feedback is text, not motion.
- **No JavaScript:** pages and forms render and submit (server actions). Only copy-to-clipboard and
  the password eye need JavaScript, and they degrade to plain text.
- **The setup-required screen (005)** switches to the design system too.

## Acceptance criteria

- [x] Tokens for both themes exist once (`tokens.css`), and components use only token utilities (a
      lint check rejects raw hex colours in `components/` and `features/`).
- [x] Manrope and IBM Plex Mono load from the app itself (no request to fonts.googleapis.com or
      gstatic.com), in weights 500 and 600, with their OFL texts in the repo.
- [x] Light is the default; the header toggle switches to dark. The choice persists across reloads with no
      flash, and the server renders `data-theme`. (Following the OS was dropped on 2026-09-27, owner decision.)
- [x] Every primitive in the table exists in `components/ui`, with tests, and appears on `/styleguide` in both themes.
- [x] The app shell renders the brand, the navigation for the user's role, and the user menu, and
      the favicon switches with the theme.
- [x] Automated contrast checks pass for every documented text and background pair in both themes.
- [x] The UI has no shadows, gradients, or raw red, yellow or green classes (a lint check on classes and CSS); red and amber come only from the error and warning tokens.

## Open questions

- None.
