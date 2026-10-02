# Props from server components to client components

A server component (a page, or any shared component without `"use client"` that a page renders)
can only pass a client component props that serialise: strings, numbers, plain objects, arrays,
dates, React elements. **Not functions.** A render-prop such as
`<Popover>{(close) => …}</Popover>` from a server component throws at runtime:

> Functions are not valid as a child of Client Components.

Unit tests that render with `renderToStaticMarkup` don't catch it: they render server and client
components together, with no boundary. The page crashes only in Next.js, so the end-to-end tests
(or `pnpm dev`) are what show it.

**How to avoid it**

- A shared client component that takes a function should also take plain content. `Popover`
  (`components/ui/Popover.tsx`) accepts `children` as a node or as `(close) => node`.
- From a server component, pass the node form. Keep the function form for client components.
- If the content really needs a callback, move the caller into a `"use client"` file.

## Calling a function from a client module

The same boundary applies to plain functions. Everything a `"use client"` module exports is a
client reference on the server, even a pure helper with no hooks, so a server component can't
**call** it:

> Attempted to call utcText() from the server but utcText is on the client.

060's audit dialog hit this by calling `utcText` from `LocalTime.tsx`. As above, only the built app
shows it; unit tests render server and client code together.

**How to avoid it:** keep pure helpers in a module without `"use client"` (such as
`components/ui/time-text.ts`), and have the client component import them from there.
