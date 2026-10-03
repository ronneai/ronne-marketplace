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
- **Safe areas:** `pt-safe`, `pb-safe` and `px-safe` (in `globals.css`) add the inset to the
  padding the element would have anyway. They only matter because the viewport has
  `viewport-fit=cover`.
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
- **`expectedFailures`** in the sweep lists pages that still fail, each with the feature that fixes
  it. Fix a page, remove its entry. An entry for a page that now passes fails the sweep too, so the
  list can't go stale.
- **Tap targets:** the sweep writes a report of the controls under 44px (coarse pointer) and under
  24px, attached to the run as `touch-targets.txt`. It's a report until 075 makes it a failure.
- **Sign-ins:** each project signs in with its own users (`mobileRoot`, `mobileModerator`,
  `mobileMember` per project in `e2e/users.ts`), because of the per-email sign-in limit
  ([e2e-sign-in-limit.md](./e2e-sign-in-limit.md)).

## Reading a sweep failure

`/catalogue as member at 320px: page is 412px wide; widest: select[name=scope] (412px)` means the
element named grows past the viewport. Look for a fixed width, a `min-w-*`, a `whitespace-nowrap`
on long text, or a grid track that isn't `minmax(0,1fr)`. When the element is inside a flex row,
the row's child usually needs `min-w-0`.

## Seen on devices

To fill in (065 task 7, 075): what the automated projects miss on a real iPhone, Android phone and
iPad.
