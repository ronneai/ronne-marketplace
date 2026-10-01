# 050 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. The popover.** Add `@floating-ui/react` (exact version) and rewrite `HelpTip` as a client
  component: button, popover with flip, shift, arrow and fixed positioning, dismiss, focus and ARIA;
  the `<noscript>` fallback.
  *Done when:* `pnpm install --frozen-lockfile` and `pnpm licenses:check` pass; unit tests cover the
  server render (button, `aria-expanded="false"`, the noscript answer) and the page tests still
  find their helpers.

- [ ] **2. In a browser.** The end-to-end tests that open helpers (docs, composer, review, catalogue)
  pass with popovers; a test checks that opening one doesn't move the page, that it stays in the
  window, Esc closes it and focus returns.
  *Done when:* the full end-to-end suite passes.

## Notes
