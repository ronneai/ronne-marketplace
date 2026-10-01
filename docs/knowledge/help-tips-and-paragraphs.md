# Inline helpers can't go inside a paragraph

`<Help>` and `<HelpTip>` (`apps/web/src/components/help/`, `components/ui/HelpTip.tsx`) render a
`<details>` with a `<summary>`, `<div>`s and `<p>`s. HTML doesn't allow any of those inside a
`<p>`, so the browser closes the paragraph early while parsing, React's tree no longer matches
what the server sent, and the page fails to hydrate.

## What to do

Put the helper **beside** the text, not in it: a `<div>` (often `flex items-center gap-2`) holding
the `<p>` and the `<Help>`. Every helper in the app is placed this way.

## Why the tests didn't catch it at first

- Unit tests render static HTML with `renderToStaticMarkup`, which doesn't validate nesting.
- The end-to-end tests run a production build, and React reports nesting and hydration problems
  only in development (`pnpm dev` prints `In HTML, <details> cannot be a descendant of <p>` and
  `Hydration failed`).

So 047's line "Usage appears once…" shipped with its helper inside a `<p>` and broke only in
`pnpm dev`. `item-page.test.tsx` now fails when a `<details>` appears inside a `<p>` on the
Overview; do the same where you add a helper next to text.
