# Regular expressions that CodeQL flags as slow

CI runs CodeQL on every pull request (`.github/workflows/codeql.yml`). Its query
`js/polynomial-redos` ("Polynomial regular expression used on uncontrolled data", severity
**high**) fails the check, and it has now stopped two pull requests. Read this before writing a
regular expression that runs on text the code didn't write itself.

## What the error means

A regular expression engine like JavaScript's backtracks: when a match fails, it goes back and
tries the other ways the pattern could have matched. Some patterns have many such ways on some
inputs, so matching a string of length *n* costs *n²* steps (or worse) instead of *n*. On a few
kilobytes of crafted input that is seconds of CPU; on a server it's a denial of service.

CodeQL reports it when **both** are true:

1. The text comes from outside the code: a file a person wrote, a request, a config value. CodeQL
   calls this "library input" or "uncontrolled data". For `@ronneai/core`, which is a library,
   every exported function's arguments count, even when today's callers pass something short.
2. The pattern can match the same text in more than one way, and it isn't anchored so tightly
   that the engine gives up early.

CodeQL doesn't know that a value was validated elsewhere, or that it's always short. Only the
pattern itself convinces it.

## The two cases we hit

**1. Trimming with an unanchored `x+$` (038, `toItemName`).**

```ts
value.replace(/^-+|-+$/g, "")   // flagged
```

`-+$` is tried at every position. On `"-----…-----a"`, each position starts a run of `-` that
fails at `a`, and the next position scans the same run again: quadratic. The fix was a loop from
both ends (`trimDashes` in `packages/core/src/read/text.ts`), like the older
`trimTrailingNewlines` in `packages/core/src/render/helpers.ts`.

**2. A "rest of the value" class that can contain the start again (040, `withoutDefaults`).**

```ts
value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):-[^}]*\}/g, …)   // flagged
```

`[^}]*` can match `${A:-` itself. On `"${A:-${A:-${A:-…"` with no closing `}`, every `${` starts
a match that runs to the end of the string before failing, and the next `${` does it again.

## How to avoid it

- **Prefer a loop or `indexOf` to a regex** for trimming, splitting on a delimiter, or finding
  `start … end` pairs. It's linear by construction and CodeQL doesn't question it.
- **Never end a pattern with an unanchored `x+$` or `x*$`.** To trim, loop from the ends.
- **Keep the start of a match out of anything that repeats inside it.** If a match begins with
  `${`, the part that follows mustn't be able to match `$` or `{`: write `[^}$]*` or
  `[^{}]*`, not `[^}]*`.
- **Don't put two quantifiers side by side over overlapping characters**, such as `\s*\w*\s*`,
  `(a+)+`, `(a|a)*` or `.*.*`. Make each piece match something the next one can't.
- **Split on the plain delimiter, then trim**, rather than `split(/\s*,\s*/)`: an unanchored
  `\s*,` rescans every run of spaces that has no comma after it. CodeQL didn't flag this one in
  `listOf` (040), but it's the same flaw, and it was fixed with the other.
- **Bound what you can.** `{0,64}` instead of `*` when the thing has a known maximum (names are
  64 characters, a manifest 64 KB).
- **Anchor both ends** (`^…$`) for "is this string exactly X" checks, and test the whole string
  once rather than searching it.
- **A pattern built with `new RegExp(…)` from input** must escape or validate that input first
  (the command reader checks an argument name against `^[a-z][a-z0-9_]*$` before using it).
- **Add a test with an adversarial input**: 100,000 repetitions of the repeating part and no
  closing character, with a time limit (see `packages/core/src/read/text.test.ts`, "stays fast on
  long runs"). A quadratic pattern takes seconds; a linear one, milliseconds.

## Before pushing

Look at every new regex in code that reads files, requests or configs, and ask: can this pattern
match the same characters in two ways, and is there input where it fails only at the very end?
If yes, rewrite it with a loop or a stricter class.

The alert names the file and line, and the message names the input that's slow (for example
"strings starting with '${{A:-' and with many repetitions of '${{A:-'"). After the fix, CodeQL
closes the alert on the next run of the pull request.

## A third query: removing tags with a regex (049)

CodeQL also fails a pull request on `js/incomplete-multi-character-sanitization` (severity
**high**), whatever the file is for, tests included. 049 added a test helper that turned rendered
HTML into text:

```ts
const textOf = (html: string) => html.replace(/<[^>]+>/g, "");   // flagged, three times
```

CodeQL reads any tag-stripping `replace` as an attempt to sanitize HTML, and one pass can leave a
`<script` behind (`<scr<b>ipt>` becomes `<script>`). It doesn't know the input is our own render
output. **Don't strip tags in tests:** match the HTML itself, element included, which is stricter
anyway: `toMatch(/published <time[^>]*>2026-09-20<\/time>/)`. React puts `<!-- -->` between
adjacent text pieces, so allow `(?:<!-- -->)?` where text and an expression meet. In app code, never
sanitize HTML with a regex at all: render text with React, or use the Markdown renderer's own
sanitizer.
