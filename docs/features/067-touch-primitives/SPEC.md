# 067 — Touch-ready primitives

> Milestone: M10 · Depends on: 065, 032 · Design: [032 components](../032-design-system/SPEC.md) · Contracts: none new

## Goal

Most phone problems start in `components/ui`. Form fields use 14px text (12px in some features), so
iOS Safari zooms the page whenever one gets focus. Tap targets are 14–36px: the dialog's close
button is an 18px icon, a help `?` is about 16px, checkboxes are 16px. Dialogs are small centred
boxes whose title scrolls away. Copy buttons fail silently on an instance served over plain http,
as a self-hosted one on a LAN often is. Fixing the primitives once fixes most pages. Desktop
density stays as it is: the changes apply on a coarse pointer or below `sm`.

## Scope

**In:**
- **Fields 16px on a coarse pointer.** `inputClasses` and `selectClasses` (`Field.tsx`),
  `PasswordInput`, textareas, the data table's page-size select, and every feature that overrides
  them with `text-xs` (`BulkRelease`, `BulkApprove`, `CataloguePicker`, `DependencyField`, the
  composer node inputs, `NewDraftForm`) get `pointer-coarse:text-base`, and their height grows to
  44px. The overrides are removed where the base classes do the job. CodeMirror gets 16px on a
  coarse pointer (`CodeEditor.tsx`, via a theme compartment).
- **A lint-like test** that fails when an `<input>`, `<select>` or `<textarea>` in `apps/web/src`
  doesn't use the shared classes or a documented exception (a source scan, like the arrow-function
  plugin but as a Vitest test).
- **Tap areas of 44px on a coarse pointer**, drawn controls unchanged on desktop:
  - `Button`: box variants `pointer-coarse:h-11`; `text` and `text-destructive` get a padded hit
    area (an `after:` inset) so they reach 44px without moving the text.
  - `Dialog` close: a 44px button around the icon (40px on desktop too: it's the only way out with
    a mouse besides Esc).
  - `HelpTip` trigger: a padded hit area; the icon size doesn't change.
  - `Checkbox` and radios: the label is the target (already), and a bare checkbox in a table cell
    gets a 44px label wrapper.
  - `CopyableCommand` copy button, `CopyChip`, `FilterChips`, the catalogue's type and sort chips,
    the docs `TypesExplorer` chips, the pager's links, `FileTree` rows (the whole row, not just the
    name), menu items: 44px on a coarse pointer.
- **Dialogs on phones** (`Dialog.tsx`):
  - Below `sm`, every dialog is **full screen** (`100dvh`, `100vw`) with a sticky title bar (title
    and close) and a sticky footer for its actions; only the body scrolls. Safe-area padding top
    and bottom. From `sm` as today.
  - The default size on desktop gets a max height (`calc(100dvh-2rem)`) with the same sticky title
    and footer, so long dialogs (Publish) keep their title in view.
  - A `footer` slot so features put their buttons where the dialog keeps them.
  - A `side` variant (a sheet from the right, full height, 20rem or full width below `sm`) for
    066's menu.
- **`BottomBar`**, a sticky action bar for phones (used by 072's editor and 073's review page):
  sticky at the bottom of the viewport inside the page flow, safe-area padded, kept above the
  on-screen keyboard (it follows `visualViewport` on iOS), shown only below a breakpoint the caller
  gives; the caller can hide it while a field in the page has focus.
- **Smaller fixes in the primitives:**
  - `Badge` gets `whitespace-nowrap` (a long label never wraps inside its fixed height).
  - `PageHeader`'s actions row wraps (`flex-wrap`).
  - `CopyableCommand` wraps by default below `sm` (`break-all`), and keeps one scrolling line from
    `sm` up; the copy button stays visible.
  - `Tabs` per 066.
- **Copy that works on http.** `CopyableCommand` and `CopyChip` share a `copyText` helper: the
  clipboard API when it's there, else select the text in a hidden textarea and `execCommand("copy")`,
  else select the visible text and say "Press and hold to copy" instead of "copied". Never a silent
  failure.

**Out** (and where it goes instead):
- Hover-only information (`title`): 068.
- Table layouts: 069.
- Page-specific layouts: 070–074.

## Behaviour

- **Desktop with a mouse:** the same sizes as today, except the dialog's close button (40px) and
  long dialogs keeping their title and buttons in view.
- **Phone:** tapping a field doesn't zoom the page; every control can be hit with a thumb; a dialog
  fills the screen with its title at the top and its buttons at the bottom, the keyboard pushing
  the footer up (it's in the dialog's flow, not `position: fixed`).
- **iPad with a touch screen:** coarse pointer, so 16px fields and 44px targets; layouts follow the
  width (tablet).
- **A laptop with a touch screen and a trackpad:** the primary pointer decides (`pointer`, not
  `any-pointer`), so it stays dense.

## Edge cases

- **A dialog opened from another dialog** (Publish from a review, a decision with dependents): the
  second is full screen too, on top; closing it returns to the first with its scroll position.
- **The keyboard opens in a full-screen dialog:** the body scrolls so the focused field stays in
  view (`scrollIntoView({ block: "nearest" })` on focus inside the dialog body, for iOS, which
  doesn't always do it).
- **No JavaScript:** dialogs that are server-rendered forms keep working; full-screen is CSS only.
- **`execCommand` is deprecated** but still the only way on an insecure origin; the helper uses it
  only when the clipboard API is missing.

## Documentation

None in the Documentation: these change sizes, not what people do. The styleguide page
(`features/styleguide`) shows the coarse-pointer sizes and the full-screen dialog, so the next
feature can check against it.

## Acceptance criteria

- [ ] On the `phone-webkit` project, focusing every kind of field on sign-in, the draft editor,
  bulk release and the composer doesn't change the page scale (`visualViewport.scale` stays 1).
- [ ] The field scan test passes and fails on a bare `<input className="text-xs">`.
- [ ] 065's tap-target report shows nothing under 44px from `components/ui` on a coarse pointer;
  desktop screenshots of the styleguide are unchanged except the dialog close.
- [ ] Below `sm` a dialog fills the screen with a fixed title and footer; on desktop a long dialog
  scrolls its body only (unit tests on classes; `dialogs.mobile.e2e.ts`).
- [ ] Copy works on an `http://<LAN IP>` origin in Chromium and WebKit, and says so when it can't
  (unit tests for the three paths; an e2e against the test server's IP).
- [ ] The sweep's `expectedFailures` entries for 067 are gone.

## Decisions

Owner, 2026-10-02:

- **44px tap areas on a coarse pointer** (not 40px): the common ground between Apple (44pt),
  Material (48dp) and WCAG AAA (44px).

## Open questions

- None.
