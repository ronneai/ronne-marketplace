# Mobile layout

The web app works on phones and tablets (M10). The rules are in
[032's spec, "Phones and tablets"](../features/032-design-system/SPEC.md); this note is how to
follow them and how to check them. The work is planned in
[065](../features/065-mobile-foundations/SPEC.md)–[075](../features/075-mobile-sign-off/SPEC.md).

## The rules, in short

- Phone below `sm` (640px), tablet `sm`–`lg`, desktop from `lg` (1024px). Supported from 360px.
- The page never scrolls sideways. Wide things scroll inside their own frame.
- On a coarse pointer: 44px tap areas and 16px form fields. Everywhere: no target under 24px.
- Nothing only on hover: no answer that lives only in a `title`.
- `dvh`, not `vh`; safe-area padding on fixed and sticky edges.
- On phones the page scrolls, not boxes inside it.

## How

- **Touch sizes without changing desktop:** Tailwind's `pointer-coarse:` variant, such as
  `h-9 pointer-coarse:h-11` or `text-sm pointer-coarse:text-base`. It follows the *primary*
  pointer, so a laptop with a touch screen stays dense, and an iPad is coarse.
- **A bigger tap area around a small control:** keep the drawn size and add a transparent area,
  `relative after:absolute after:-inset-2 after:content-['']` (check it doesn't overlap a
  neighbour's area).
- **Safe areas:** `pt-safe`, `pb-safe` and `px-safe` (in `globals.css`) set the padding to the
  device's inset (0 on a screen without one). Put them on an edge's outer element with no padding
  of its own and keep the usual padding on the element inside, as `AppShell`'s header, content and
  footer do. They only matter because the viewport has `viewport-fit=cover`, which also means any
  new full-width fixed or sticky element needs them.
- **Heights:** `min-h-dvh`, `h-dvh`, `max-h-[calc(100dvh-…)]`. `100vh` on iOS Safari includes
  the area behind the toolbar.

## Checking it

- **Projects:** `pnpm test:e2e` runs the phone and tablet projects next to the desktop one:
  - `phone`: Chromium as a Pixel 7.
  - `phone-webkit`: WebKit as an iPhone 15, so iOS Safari behaviour shows up.
  - `tablet`: Chromium at 768×1024 with touch.
  They only run `*.mobile.e2e.ts` files. To run one project: `pnpm --filter @ronneai/web exec
  playwright test --project phone` after a build. The first time, run
  `pnpm --filter @ronneai/web exec playwright install chromium webkit`.
- **The sweep** (`e2e/mobile-sweep.mobile.e2e.ts`) opens every page in `e2e/pages.ts` as each role,
  at the project's size and at 360px and 320px. It fails when the document scrolls sideways, and
  names the page and the widest element that sticks out. A unit test makes `pages.ts` list every
  `page.tsx`, so a new page can't be left out.
- **`EXPECTED_FAILURES`** in the sweep lists pages that still fail, each with the feature that fixes
  it. Fix a page, remove its entry. An entry for a page that now passes fails the sweep too, so the
  list can't go stale.
- **Reports:** the sweep's last test writes `overflow.txt` (every failure, listed or not) and
  `touch-targets.txt` (controls under 44px at the device's width, `(<24)` marks the ones under
  24px) into `apps/web/test-results/mobile-sweep…-<project>/`. CI uploads them as the
  `mobile-sweep-reports` artifact. The tap targets are a report until 075 makes them a failure.
- **Sign-ins:** each project signs in with its own users (`mobileRoot`, `mobileModerator`,
  `mobileMember` per project in `e2e/users.ts`), because of the per-email sign-in limit
  ([e2e-sign-in-limit.md](./e2e-sign-in-limit.md)).

## Absolute boxes escape a scrolling frame

A frame with `overflow-x: auto` only clips an absolutely positioned child if the frame (or
something between them) is positioned. Screen-reader text (`sr-only`) is absolute, so a count's
"waiting" label inside the scrolling main nav widened every page by 12px on a phone until the nav
got `relative`. When a scrolling strip holds `sr-only` text or anything absolute, make the strip
`relative`. The sweep follows the same rule, so it names the `span.sr-only` when this happens.

## Reading a sweep failure

`/catalogue as member at 320px: page is 412px wide; widest: select[name=scope] (412px)` means the
element named grows past the viewport. Look for a fixed width, a `min-w-*`, a `whitespace-nowrap`
on long text, or a grid track that isn't `minmax(0,1fr)`. When the element is inside a flex row,
the row's child usually needs `min-w-0`.

## Seen on devices

To fill in (065 task 7, 075): what the automated projects miss on a real iPhone, Android phone and
iPad.
