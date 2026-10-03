# 067 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. 16px fields.** `pointer-coarse:` sizes in `Field.tsx`, `PasswordInput`, the pager's
  select; remove the `text-xs`/`h-8` overrides in features where the base classes now fit (keep
  the look on desktop with `pointer-fine:` if a feature needs it denser); CodeMirror theme
  compartment.
  *Done when:* the field scan test passes; `fields.mobile.e2e.ts` (WebKit) shows scale 1 after
  focusing each field kind.

- [x] **2. Tap areas.** `Button` (box and text variants), `HelpTip`, checkbox wrappers, copy
  buttons and chips, `FilterChips`, pager, `FileTree` rows, menu items.
  *Done when:* unit tests check the classes; the tap-target report has no `components/ui` entries.

- [x] **3. Dialog.** Full screen below `sm`, the title bar at the top and `DialogActions` stuck to
  the bottom; max height on desktop; the `side` variant; focus-into-view inside the body. Every
  dialog's final button row became `DialogActions` (21 rows in 12 files).
  *Done when:* `Dialog` unit tests pass; `dialogs.mobile.e2e.ts` opens Create access token on each
  phone and tablet project and finds the title, close and buttons on screen with a field focused.
  (Publish and bulk approve are checked by 073, which reworks them. Playwright can't open an
  on-screen keyboard, so "keyboard open" is a focused field.)

- [x] **4. `BottomBar`.** Sticky, safe-area padded, follows `visualViewport`, breakpoint (`until`)
  and `hideWhileTyping` options, a `toolbar` with a label; shown last on the styleguide.
  *Done when:* unit tests pass; `bottom-bar.mobile.e2e.ts` finds the bar at the bottom of the
  screen at the top of the page and after scrolling, and whole on screen with a field focused, on
  every phone and tablet project.

- [x] **5. Small primitive fixes.** `Badge` nowrap, `PageHeader` wrap, `CopyableCommand` wrapping
  below `sm`.
  *Done when:* unit tests pass; the styleguide shows them.

- [x] **6. Copy on http.** `copyText` helper with the three paths; `CopyableCommand` and `CopyChip`
  use it.
  *Done when:* unit tests for each path; an e2e copies on the test server's LAN address.

- [ ] **7. Styleguide.** Show coarse-pointer sizes and the full-screen dialog.
  *Done when:* the styleguide unit test passes; the sweep's 067 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **The features' `h-8 text-xs` overrides stay.** `cn` only joins classes, and Tailwind emits
  variants after plain utilities, so `pointer-coarse:min-h-11 pointer-coarse:text-base` in the
  shared classes wins on touch while the override keeps desktop dense. A minimum height, not a
  height, so textareas (`h-auto`) keep growing.
- **Two fields style themselves** (the composer's range box, the new item's name inside its
  `@scope/` frame); they use `touchFieldClasses`. `src/touch-rules.test.ts` fails on any other.
- **CodeMirror's size is a CSS variable,** `--editor-font-size` (13px, 16px on a coarse pointer in
  `globals.css`), so no editor reconfiguration is needed.
- **Playwright's WebKit doesn't zoom on focus** the way iOS Safari does, so `fields.mobile.e2e.ts`
  checks the cause (focused text under 16px) as well as the page scale.
- **`touch-hit`** (`globals.css`) is the tap area for small controls: an invisible `::after`, at
  least 44×44px and centred, only on a coarse pointer. The sweep's tap-target report counts it.
  Controls with room grow for real (`pointer-coarse:h-11`): buttons, chips, tabs, pager, fields.
  The phone report went from 315 to 178 entries; what's left is in features (prose links, which
  WCAG exempts, the item and docs tabs for 066, cards for 071, row checkboxes for 069, the editor's
  view switcher for 072), none in `components/ui`.
- **`DialogActions` instead of a footer slot:** see the spec. The conversion was scripted over
  every `flex … justify-end` row that ends a dialog's body; three rows that aren't a dialog's last
  (a section inside the draft settings dialog, the own-row help) were left alone.
- **The 16px fields widened the new item form** past 360px in every engine (the sweep caught it);
  its `EXPECTED_FAILURES` entry for 072 now covers every project.
- **The keyboard lift can't be tested here.** Playwright opens no on-screen keyboard, and its
  WebKit doesn't resize the visual viewport for one, so the bar's `visualViewport` follow is only
  seen on a real iPhone (075's device pass).
- **At the end of a page the bar rests on the footer,** which is how `sticky` works: it's pulled
  to the bottom of the screen only while its place in the page is below it.
- **The copy test opens sign-in on the machine's LAN address** (`copy.e2e.ts`, desktop project):
  not a secure context, so no `navigator.clipboard`, the case that failed silently before. It's
  skipped on a machine with no LAN address. A locator by the button's name ("copy") re-resolves
  to the next copy button once the first says "copied"; anchor it to its command instead.
