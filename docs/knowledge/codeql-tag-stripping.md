# "Incomplete multi-character sanitization" on stripping tags

CodeQL's `js/incomplete-multi-character-sanitization` flags `html.replace(/<[^>]+>/g, "")`, even
in a test: after one pass the string may still hold `<script` (a broken tag such as `<<b>script>`
leaves one behind). It flagged four test lines in #231 (feature 131), where tests read a rendered
badge's or line's text from `renderToStaticMarkup`.

## What to do

Don't write the regex in a test. Use `textOf` from `apps/web/src/test/text.ts`: it splits on `<`
and keeps what follows each tag's `>`, so no `<` survives.

```ts
import { textOf } from "@/test/text";

expect(textOf(renderToStaticMarkup(<Reach reach={reach} />))).toBe("…");
```

## What did not help

A second replace after the first (`.replace(/<[^>]*>/g, "").replace(/</g, "")`): CodeQL flagged the
helper itself (#231, alert 36). It doesn't credit a later pass; leave `replace` out entirely.

A replace with a space (`.replace(/<[^>]+>/g, " ")`, as the app shell's test does to keep words
apart) is not flagged; new code still uses `textOf` and collapses spaces itself when it needs to.
