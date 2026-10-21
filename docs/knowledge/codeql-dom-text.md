# "DOM text reinterpreted as HTML" on a link's address

CodeQL's `js/xss-through-dom` fails a pull request (severity **high**) when text that came from
the page, such as a form field's `event.target.value`, reaches a sink that can run it: an `<a
href>` takes `javascript:` addresses. It stopped #221 (feature 124): the Notice tab's preview puts
what root types into the same `NoticeBanner` that draws the real notice, and the banner links
`[words](address)` to that address.

## Why validating is not enough

`noticeParts` only makes a link of an address `isNoticeHref` allows (`https://…` or a path with a
single `/`), so a `javascript:` address is never a link. CodeQL does not follow a check made
in another function, so the value still looks tainted at the `href`.

## What it accepts

An address built as a fixed start plus the rest, in the same expression as the sink's value:

```tsx
const onSite = (href: string) => `/${href.slice(1)}`;
const secure = (href: string) => `https://${href.slice("https://".length)}`;
<a href={secure(part.href)}>…</a>
```

The value is the same; the start is now a constant, so no scheme can be written by the person. Do
this where an address from a person is drawn as a link, even when it was validated earlier. A
rejected address (not starting with either) is not drawn as a link at all.
