# 050 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. The popover.** Add `@floating-ui/react` (exact version) and rewrite `HelpTip` as a client
  component: button, popover with flip, shift, arrow and fixed positioning, dismiss, focus and ARIA;
  the `<noscript>` fallback.
  *Done when:* `pnpm install --frozen-lockfile` and `pnpm licenses:check` pass; unit tests cover the
  server render (button, `aria-expanded="false"`, the noscript answer) and the page tests still
  find their helpers.

- [x] **2. In a browser.** The end-to-end tests that open helpers (docs, composer, review, catalogue)
  pass with popovers; a test checks that opening one doesn't move the page, that it stays in the
  window, Esc closes it and focus returns.
  *Done when:* the full end-to-end suite passes.

## Notes
- **Task 1.** Floating UI's `useRole` adds `role="dialog"`, but Biome can't see through the spread
  props, so the role is also written out. The light teal panel is its own token pair (`popover`,
  `popover-border`): the existing `tint` is navy in the dark theme, the same as the cards.
- **Task 2.** Helpers are buttons now, so Playwright's loose name matching found two buttons for
  "Propose a change" (the helper asks "What happens when I propose a change?"); that locator is
  exact. `docs.e2e.ts` checks the popover: the page below doesn't move, it stays 8px inside the
  window, Esc closes it and focus returns. Screenshots in both themes were checked by eye.
