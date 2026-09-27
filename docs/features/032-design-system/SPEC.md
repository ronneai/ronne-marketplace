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
- The app shell: a header with the full brand (`BrandLogo`) and navigation, a user menu, a footer, and a centered content column.
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
| Fonts | **Manrope** for human text (UI, titles, prose). **IBM Plex Mono** for machine values: ids, versions, commands, tokens, paths, codes, badges. |
| Weights | 500 and 600 only. No 400 or 700. |
| Depth | **Completely flat.** No shadows, blurs, glows or gradients. Surfaces separate by tone and 1px hairlines. |
| Radii | 6px for buttons and inputs, 8px for cards, panels and dialogs, full pill for badges. |
| Spacing | A 4 and 8px rhythm (4, 8, 12, 16, 24). Dense, with 36px controls. |
| Notices | **No red, yellow or green.** Warnings and errors are framed panels with a mono prefix (`WARN:`, `ERR:`), not colour alarms. |
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
| `accent` (fills) | Teal | Teal |
| `on-accent` (text on teal) | **Ink** | Ink |
| `focus` (focus ring) | **Navy** | Teal |
| `link` | Navy, semibold | Teal |
| `tint` (selection, soft fill) | Mint | Navy |

- **Teal is never text in the light theme** (the light note's rule). It fails contrast on white. In
  the dark theme, teal text is allowed (7.4:1 on Ink).
- **The light theme differs from its design note in two places** (owner decision, 2026-09-27). The
  note's white labels on teal buttons (2.54:1) and teal focus ring on white or Paper (2.4–2.5:1)
  fail WCAG. So labels on teal are **Ink** (7.37:1), as in the dark theme, and the light focus ring
  is **Navy** (15.97:1). The brand teal fill is unchanged, and buttons look the same in both themes.
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
| Badge | A pill, IBM Plex Mono 600 11px. `accent` (teal) and `muted` (mint on light, navy on dark). |
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

**Not taken from the mocks, on purpose:**
- **The `daemon: local (0.14.0)` chip.** There's no daemon.
- **Amber "Lifecycle Hook" and "Permissions: Exec" badges** in the light catalogue mock. They break
  the no-yellow rule. Risk flags (MVP §12) use mono badges and notices instead.
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
- [x] The UI has no shadows, gradients, red, yellow or green (a lint check on classes and CSS).

## Open questions

- None.
