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

## A helper passed into a component

`help-not-in-paragraph.test.ts` reads the sources, so it sees a `<Help>` written inside a `<p>`,
but not one passed as a prop (a `hint={…}` or a `label={…}`) to a component that wraps that prop
in a `<p>`. 189's Email tab did that: the From address field's `hint` held `<Help id="email-domain">`
and the field drew its hint in a `<p>`, so the tab failed to hydrate in `pnpm dev` while every test
passed. A component that takes text which may hold a helper draws it in a `<div>` (or a `<span>`
for one line), and its tests parse the rendered markup for a block inside a `<p>`, as
`email.test.tsx` does (`p div, p p, p ul, p ol`). The guard's own regex also matches a literal `<p>`
in a comment, so a comment there says "paragraph", not the tag.
