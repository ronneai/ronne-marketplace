# "DOM text reinterpreted as HTML" on a link's address

CodeQL's `js/xss-through-dom` fails a pull request (severity **high**) when text that came from
the page, such as a form field's `event.target.value`, reaches a sink that can run it: an `<a
href>` takes `javascript:` addresses. It stopped #221 (feature 124): the Notice tab's preview put
what root types into the same `NoticeBanner` that draws the real notice, and the banner links
`[words](address)` to that address.

## What did not help

- **Validating the address first.** `noticeParts` only makes a link of an address `isNoticeHref`
  allows, but CodeQL does not follow a check made in another function.
- **Writing the address as a fixed start plus the rest** (`` `/${href.slice(1)}` ``): the alert
  stayed. Do not spend a push on it.

## What did

Keep the sink away from the typed text. Anything drawn from text a person is typing right now (a
live preview) uses a component with no `href`: `NoticePreview` underlines the link words as a
`<span>`. The component with the `<a href>` (`NoticeBanner`) only receives what the server read
from the database, so no DOM text reaches it. It suits a preview anyway: a click in it should not
leave the form.

When the same words must be drawn live and saved, write two small components, not one with a flag:
CodeQL ignores the flag and follows the call.
