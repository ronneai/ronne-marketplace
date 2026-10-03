# 065 — Mobile foundations and phone tests

> Milestone: M10 · Depends on: 032, 006 · Design: [MVP §8](../../MVP/MVP.md#8-web-application), [032 layout](../032-design-system/SPEC.md) · Contracts: none new

## Goal

M10 makes the web app work on phones and tablets (owner, 2026-10-02). Before any page is fixed,
the app needs the rules every later feature builds to, and tests that look at it the way a phone
does. Today nothing runs at a phone width: every Playwright project is `Desktop Chrome`. This
feature sets the rules, the page-level plumbing (viewport, safe areas, theme colour) and the
phone and tablet test projects, with a sweep that fails when any page scrolls sideways.

## Scope

**In:**
- **The mobile rules**, added to 032's spec under "Layout" and kept there as the reference:
  - **Widths.** Phone is below 640px (`sm`), tablet 640–1023px, desktop from 1024px (`lg`), using
    Tailwind's default breakpoints (no custom ones). Supported from **360px** wide; at 320px
    nothing is cut off and the page never scrolls sideways, though it may be cramped.
  - **No sideways page scroll.** Only things that are wide by nature scroll sideways, and only
    inside their own frame: a code line in a `pre`, a wide Markdown table, a tab strip.
  - **Touch targets.** On a coarse pointer (`pointer-coarse:` variant), every control's tap area is
    at least **44×44px**; the drawn control may stay smaller, with the extra area added around it.
    Everywhere, no target is under **24×24px** (WCAG 2.2 AA, 2.5.8). Desktop density doesn't change.
  - **Form fields are 16px on a coarse pointer**, so iOS Safari doesn't zoom the page on focus.
  - **Nothing only on hover.** Anything a pointer reveals on hover (a `title`, `group-hover`) is
    also reachable by a tap and by the keyboard (068 fixes what exists).
  - **Heights use `dvh`, not `vh`,** so the browser's toolbars don't hide content.
  - **The page scrolls, not boxes inside it,** on phones: no nested vertical scroll areas except a
    dialog's body and a menu's list.
- **The root layout's viewport** (`app/layout.tsx`): a `generateViewport` with
  `width=device-width, initial-scale=1, viewport-fit=cover` and a `themeColor` from the theme cookie
  (the `surface` token of the chosen theme, the header's colour), so the browser bar matches the
  header in light and dark. Zoom stays
  allowed (`maximum-scale` is never set).
- **Safe areas:** the header, the footer, a full-screen dialog and a sticky bottom bar pad
  themselves with `env(safe-area-inset-*)`. Two utilities in `globals.css` (`pt-safe`, `pb-safe`
  and the side insets) so features don't repeat the `max()`.
- **`min-h-screen` becomes `min-h-dvh`** where it sizes a page (sign-in, setup, database
  unavailable).
- **Test projects** in `playwright.config.ts`:
  - `phone`: Chromium with `devices["Pixel 7"]` (412×915, touch, mobile), runs every
    `*.mobile.e2e.ts` file.
  - `phone-webkit`: WebKit with `devices["iPhone 15"]` (393×852), the same files, so iOS Safari's
    behaviour (focus zoom, `dvh`, safe areas) is seen. Installing WebKit joins the e2e setup
    command and CI.
  - `tablet`: Chromium at 768×1024 with touch.
  - The desktop `chromium` project ignores `*.mobile.e2e.ts`.
- **The sweep** (`e2e/mobile-sweep.mobile.e2e.ts`): signs in as root, a moderator and a member, and
  opens every page each can reach (the list lives in `e2e/pages.ts`, with seeded data so tables,
  item pages and the review page aren't empty). On each page, at each project's size and at 360px
  and 320px: the document doesn't scroll sideways (`scrollWidth <= clientWidth`), and no element
  sticks out of the viewport unless it sits in a scrolling frame. Failures name the page and the
  element. A page that still fails is listed in an `expectedFailures` map that names the feature
  fixing it; each later feature empties its entries, and 075 checks the map is empty.
- **A tap-target check** (`e2e/touch-targets.ts`, used by the sweep in report mode): lists every
  visible link, button, input and summary under 24px (always a failure once the map is empty) and
  under 44px on a coarse pointer (a report, attached to the run, for 067 to work from).
- **A knowledge note**, `docs/knowledge/mobile-layout.md`: the rules above in short, the
  `pointer-coarse:` and safe-area utilities, how to run the phone projects, and how to read the
  sweep's failures.

**Out** (and where it goes instead):
- Fixing the pages the sweep finds: 066–074, each owns its part.
- A web app manifest, installing to the home screen, offline use: not in M10 (see Decisions).
- Native apps: never planned.

## Behaviour

- Nothing a person sees changes on desktop. On a phone, the browser's bar takes the header's colour, and on a phone with a notch the header and footer stay clear of it in landscape.
- `pnpm test:e2e` runs the desktop, wizard, phone, phone-webkit and tablet projects.
  `pnpm test:e2e --project phone` runs one.

## Edge cases

- **The theme cookie changes** after the page loaded (the header toggle): the toggle also updates
  the `theme-color` meta, so the browser bar follows without a reload.
- **The setup wizard and the "database unavailable" page** have no signed-in user: the sweep opens
  them with the blank instances, as the wizard projects do.
- **WebKit on CI:** it's part of `@playwright/test` (Apache-2.0), already a dependency; the CI step
  installs `chromium webkit` with `--with-deps`. The dependency policy checklist is run for it.
- **Run time:** the phone projects run only the `*.mobile.e2e.ts` files, not the whole desktop
  suite again.

## Documentation

None: nothing a person sees changes yet. The rules live in 032's spec and the knowledge note; the
Documentation topic about phones comes with 075.

## Acceptance criteria

- [ ] 032's spec states the mobile rules above; the knowledge note exists and links to it.
- [ ] The viewport meta has `viewport-fit=cover`, no `maximum-scale`, and a `theme-color` matching
  the theme, updated by the toggle (unit test on `generateViewport`, e2e on the toggle).
- [ ] The header, footer and a full-screen dialog respect the safe-area insets (unit test on the
  classes; checked by hand in the iPhone simulator, see PLAN).
- [ ] `phone`, `phone-webkit` and `tablet` projects run in `pnpm test:e2e` and in CI.
- [ ] The sweep visits every page in `e2e/pages.ts` for each role and fails on sideways scroll;
  today's failures are listed in `expectedFailures` with the feature that fixes each.
- [ ] The tap-target report is attached to the e2e run.

## Decisions

Owner, 2026-10-02:

- **Install to home screen** (web app manifest, icons): after M10, as its own feature, once the
  pages are good on phones.
- **WebKit runs on every pull request**, since iOS is where most phone-only bugs are; revisit if it
  slows CI noticeably.

## Open questions

- None.
