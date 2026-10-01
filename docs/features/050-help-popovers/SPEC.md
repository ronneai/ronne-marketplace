# 050 — Helpers as popovers

> Milestone: cross-cutting · Depends on: 033, 032 · Design: [033's inline helpers](../033-in-app-help/SPEC.md)

## Goal

An inline helper's answer floats next to its question instead of opening inside the page (owner,
2026-10-01). Today `HelpTip` is a `<details>`: opening it inserts the answer into the flow, which
pushes the page down and often lands it in an awkward place, such as the far side of a card or under
a button row.

## Scope

**In:**
- `HelpTip` (`components/ui/HelpTip.tsx`), which every helper uses (`<Help id>` and the setup's own),
  becomes a button that opens a popover placed by **Floating UI** (`@floating-ui/react`, owner's
  choice over the browser's Popover API and CSS anchor positioning).
- Keyboard and screen readers: the question is a button with `aria-expanded`; the popover is a
  non-modal dialog labelled by the question; Esc and a click outside close it and focus returns to
  the question.
- Without JavaScript (the setup page is tested that way, 036), the answer shows inline under the
  question, as today.

**Out:**
- The answers' words and links: unchanged (033).
- Tooltips on hover: a helper opens on click or Enter/Space only, so touch and keyboard work the
  same way.

## Behaviour

- **Placement:** under the question, start-aligned (`bottom-start`); flips above when there's no
  room below, and shifts sideways to stay 8px inside the window. Recomputed on scroll and resize
  while open. A small arrow points at the question.
- **Size and look:** at most 20rem wide, flat (no shadow), in a light teal (owner, 2026-10-01): the
  `popover` token, `#E8F7F4` on light and `#0F2A2E` on dark, with a teal hairline
  (`popover-border`); text 17:1 and links 14.5:1 on light, 14.3:1 and 5.9:1 on dark. Above the
  page (`z` above cards and the header).
- **Inside a dialog** (publish, submit): our dialogs are native modal `<dialog>`s in the browser's
  top layer, so the popover isn't portalled elsewhere; it renders where the helper is, with fixed
  positioning, which also lets it escape a parent that clips its content.
- **One at a time per helper:** opening a second helper doesn't close the first unless the click
  lands outside it, which it does (outside click).
- **Without JavaScript:** the button does nothing; a `<noscript>` block under it shows the answer
  and the "Learn more" link.

## Edge cases

- **A helper near the bottom of the window:** opens above the question.
- **A narrow phone:** the popover is at most the window's width minus 16px.
- **"Learn more" inside the popover:** a normal link; following it closes the popover.

## Documentation

- None: helpers say the same things and link to the same sections. 033's spec notes that helpers
  open as popovers since 050.

## Dependency

`@floating-ui/react` 0.27.20 (MIT), with `@floating-ui/react-dom`, `dom`, `core`, `utils` and
`tabbable` (all MIT): six packages, no install scripts. Released July 2026, published with npm
provenance by the Floating UI maintainers (two), widely used; no advisories on osv.dev for any of
them (checked 2026-10-01). Needed because the platform alone can't place a popover next to its
button in every browser (CSS anchor positioning isn't in Firefox), and it brings the dismiss, focus
and ARIA handling. 0.x is its stable line (no 1.0 exists).

## Acceptance criteria

- [ ] Every helper opens as a popover next to its question, without moving the page.
- [ ] It flips and shifts to stay in the window, also inside dialogs.
- [ ] Esc and a click outside close it; focus returns to the question; the question has
      `aria-expanded` and the popover is labelled by it.
- [ ] Without JavaScript, the answer shows inline.
- [ ] The dependency passes the license, audit and pack checks.
