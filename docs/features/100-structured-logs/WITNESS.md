# 100 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Task 1 — The logger

Witnessed: 2026-10-14 11:53 EDT, by a fresh agent (blind). Commit: 381f0ec1. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A line is one JSON object with `time`, `level`, `msg`; `event`, `domain`, `requestId`, `userId` only when they apply; other fields flat | no | confirmed | Scratch probe → `{"time":…,"level":"info","msg":"Released","event":"version.released","domain":"submissions","requestId":"R1","userId":"U1","count":3}`; outside a request no `requestId` |
| 2 | Field order matches the spec's example lines | no | partly | JSON writes `msg,event,domain`, the example `msg,domain,event`; text writes `requestId=… items=3`, the example `items=3 requestId=…` |
| 3 | `err` is `{ name, message, code, stack }`, the stack only at `error` | no | confirmed | Probe; `redact.ts:84-93`; mutation (stack always) → 2 tests fail |
| 4 | Four levels; `LOG_LEVEL` filters lower ones | no | confirmed | 39 passed; mutation (no filter) → 5 fail |
| 5 | An event uses its level unless overridden | no | confirmed | `logger.ts:117-120`; test |
| 6 | `LOG_FORMAT=text`: `time LEVEL domain event msg key=value…`, coloured only on a TTY, never in JSON | no | confirmed | Probe; `index.ts:27`; mutation → 3 fail. Order: row 2 |
| 7 | Request context: `requestId` inside, `userId` once set, none outside, concurrent requests apart | no | confirmed | 200 concurrent runs → 400 lines, 0 wrong; mutation → 4 fail |
| 8 | Secret keys redacted, any case, as the name's end, at any depth, arrays, child bindings | no | confirmed | Probe → all `[redacted]`; mutations → 1 / 1 / 3 fail |
| 9 | Access tokens replaced by `rmk_[redacted]` in any string | no | confirmed | Probe; mutation → 3 fail |
| 10 | A URL password is hidden as `redactDatabaseUrl` does | no | partly | `redactString("postgres://u:pa ss@h/d")` → unchanged (leak); `redactDatabaseUrl` hides it; tabs too |
| 11 | An error's message and stack redacted; a non-Error as its type only | no | confirmed | Probe; mutations → 1 / 1 fail |
| 12 | Long values cut to 2,000 characters and `…` | no | confirmed | Probe; a token at the cut is already redacted |
| 13 | A cycle or `BigInt` marks only that field | no | confirmed | Probe. Remark: removing the cycle check still passes the tests (stack overflow caught) |
| 14 | Logging never throws | no | confirmed | Proxy, `undefined` msg, throwing clock and write; mutation → 14 fail |
| 15 | An invalid `LOG_LEVEL` writes one `log.level_invalid` warn, without its value, and uses `info` | no | confirmed | Settings-file probe; mutations → 2 / 1 fail |
| 16 | `LOG_LEVEL`, `LOG_FORMAT` read through `config.ts` | no | confirmed | `config.ts:24-26,50-51`; env beat the file |
| 17 | Events in one module, matching the spec's table | no | confirmed | `events.ts`: 20 events plus `log.level_invalid` |
| 18 | No new dependency | no | confirmed | `git show 381f0ec1 --stat -- '**/package.json' package.json pnpm-lock.yaml` → nothing |
| 19 | The *Done when* tests exist, pass and catch breakage | no | confirmed | 18 mutations, 16 caught; not caught: the cycle check, `msg` redaction |
| 20 | Regexes follow `codeql-regex.md` | no | confirmed | Bounded patterns only; URL redaction a loop; 200k-repeat inputs → 37 ms |
| 21 | No environment value reaches a line (`codeql-logging.md`) | no | confirmed | Fixed text; test asserts the value is absent |
| 22 | Lint and types clean | no | confirmed | biome, tsc → clean |

**Overall:** not met: a URL password with a space or tab is written in the clear (row 10), and the order differs from the spec's examples (row 2). Remarks: no test for `msg` redaction or the cycle check; text format writes `msg`, `domain`, `event` raw (a newline splits the line); keys aren't value-redacted; the context's values aren't redacted.

## Task 1 — The logger (adversarial)

Witnessed: 2026-10-14 11:55 EDT, by a fresh agent (adversarial). Commit: 381f0ec1. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Four levels and the filter; `event()` level or override | no | confirmed | Each level probed: 7 / 5 / 3 / 2 lines |
| 2 | `child()` adds bindings, nested children both, bindings redacted | no | confirmed | `child({x: token})` → redacted |
| 3 | JSON: one object per line | no | confirmed | Newline, CR, ESC, U+2028 escaped |
| 4 | Text: one line per entry, not injectable | no | not met | `info("line1\nFAKE 00:00 ERROR forged")` → two lines; same for a key and a `domain`; ESC written raw |
| 5 | Context: `requestId`, `userId`, apart, nested, `setRequestUser` outside does nothing | no | confirmed | 200 concurrent → 600 lines, 0 wrong. Remark: context values written raw |
| 6 | Fields can't forge `time`, `level`, `msg`, `event`, `requestId` | no | confirmed | Forged fields ignored; a `userId` field replaces the context's, by design |
| 7 | Secret keys redacted in any spelling and depth | no | confirmed | 32 spellings; Maps, Sets, Symbols, toJSON → `{}` |
| 8 | Tokens and URL passwords removed from every string | no | partly | Leaks: keys (`{[token]:1}`); an Error's `code`; `postgres://user:pa ss@host` and `pa\nss`; `new String(token)`, `Buffer.from(secret)` written per character/byte. Not caught, as in `redactDatabaseUrl`: no-scheme `user:pw@host`, `?password=` |
| 9 | Errors: `{name, message, code}`, stack at `error`, non-Error as type | no | partly | `code` not redacted |
| 10 | The cut comes after redaction | no | confirmed | 1950–2001 paddings → no token slice |
| 11 | Cycle, BigInt mark only their field | no | confirmed | Probe |
| 12 | Never throws | no | confirmed | Hostile Proxies, getters, 100,000-deep nesting, throwing clock/write/stdout. Remark: a throwing top-level getter loses the whole line; the text fallback is JSON |
| 13 | Never blocks: linear redaction | no | partly | 17 hostile inputs linear (0.3–30 ms); but a 10 MB `Buffer` field → 3,743 ms; a 1e6-element array → a 4 MB line; a 1 MB key → a 1 MB line |
| 14 | Invalid `LOG_LEVEL`: one warn, no value, `info` | no | confirmed | `LOG_LEVEL=rmk_…` → no leak |
| 15 | `LOG_FORMAT` parsing | no | confirmed | `TEXT`, `" text "` → text; else JSON |
| 16 | Read in `config.ts` | no | confirmed | Stubbed env reached the logger |
| 17 | Events in one module | no | confirmed | 20 plus `log.level_invalid` |
| 18 | No new dependency | no | confirmed | 8 files under `apps/web/src/server/` |
| 19 | Tests cover the *Done when* | no | partly | 19 mutations, 16 caught; not: `msg` redaction, `error.name` redaction, the cycle check |
| 20 | Lint and types clean | no | confirmed | biome, tsc → clean |

**Overall:** not met: secrets can be written (keys, an Error's `code`, URL passwords with whitespace, boxed strings and bytes, the context's values); text format can be split or carry ANSI escapes; a large Buffer blocks for seconds; tests miss `msg` and `error.name` redaction and the cycle check.

## Task 1 — The logger (re-check)

Witnessed: 2026-10-14 12:03 EDT, by a fresh agent (blind). Commit: 164f7454. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Line fields, present only when they apply | no | confirmed | 52 passed; probe outside a request → no `requestId` |
| 2 | Field order matches the spec's examples | no | confirmed | JSON `msg,domain,event,requestId,userId,items`; text `… Released items=3 requestId=… userId=…`. Remark: no test pins the JSON order |
| 3 | `err` with the stack only at `error` | no | confirmed | Mutation → 1 fails |
| 4 | Levels and the filter | no | confirmed | Mutation → 5 fail |
| 5 | Event level or override | no | confirmed | Mutation → 1 fails |
| 6 | `child()` bindings, nested, redacted | no | confirmed | Mutation → 1 fails |
| 7 | Text format, coloured only on a TTY | no | confirmed | Mutation → 1 fails |
| 8 | Text: control characters can't split or forge a line | no | confirmed | C0, DEL, C1, U+2028/9, ESC escaped; mutations → 1 / 1 fail. Remark: a quoted value shows JSON's `\n`, not `\uXXXX` |
| 9 | Request context | no | confirmed | Mutation (`enterWith`) → 2 fail |
| 10 | Secret keys at any depth | no | confirmed | Mutations → 3 / 1 / 1 / 3 fail |
| 11 | Tokens in any string | no | confirmed | Mutation → 8 fail |
| 12 | URL passwords, whitespace included | no | partly | `pa ss`, tabs, newlines, `pä ß`, `p:w/d` hidden. Leak: `postgres://user:p://x@host:5432/db` unchanged |
| 13 | Keys redacted like values | no | partly | `cleanKey` cuts at 200 before redacting: `"x"*170 + token` → 26 of the token's characters written |
| 14 | Message, request ID, user id redacted | no | confirmed | Mutations → 1 / 1 / 1 fail |
| 15 | Error name, message, code, stack; other properties dropped; non-Error as type | no | confirmed | Mutations → 1 each. Remark: a nested Error's extra properties untested |
| 16 | Values cut at 2,000 after redaction | no | confirmed | Remark: cutting before redaction isn't caught by a test |
| 17 | Caps: depth, items, keys, key length, bytes | no | partly | Mutations caught; an object's marker is `"[more]": N`, the spec says `"[N more]"` |
| 18 | Cycle, BigInt; never throws | no | confirmed | Cycle mutation → 3 fail (now caught) |
| 19 | A throwing getter marks its field | no | confirmed | Mutation → 6 fail |
| 20 | Fallback line in the logger's format | no | confirmed | Mutation → 1 fails |
| 21 | Invalid `LOG_LEVEL` | no | confirmed | Settings-file probe; mutation → 1 fails |
| 22 | Read through `config.ts` | no | confirmed | Probe |
| 23 | Events in one module | no | confirmed | 20 plus `log.level_invalid` |
| 24 | No new dependency | no | confirmed | `git diff e6b43434 164f7454 --stat -- '**/package.json' package.json pnpm-lock.yaml` → empty |
| 25 | Tests catch breakage | no | confirmed | 42 mutations, 38 caught; not: cut before redaction, nested Error's properties, JSON order (2) |
| 26 | Regexes and loop per `codeql-regex.md` | no | confirmed | 300k + 100k hostile inputs → 62 ms |
| 27 | No environment value in a line | no | confirmed | Fixed message; test |
| 28 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a long key is cut before redaction (part of a token leaks), a password containing `://` is written, and the object cap marker differs from the spec.

## Task 1 — The logger (adversarial re-check)

Witnessed: 2026-10-14 12:08 EDT, by a fresh agent (adversarial). Commit: 164f7454. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels, filter, event level | no | confirmed | 52 passed; mutation → 2 fail |
| 2 | `child()` bindings, nested, redacted | no | confirmed | Probe in both formats |
| 3 | `child()` never throws | no | not met | `createLogger(...).child(hostile)` fine; the shared `logger.child({get domain(){throw}})` throws (`index.ts:46`); same with a throwing `ownKeys` Proxy |
| 4 | JSON one object per line | no | confirmed | Control characters escaped |
| 5 | Text: no split, no terminal control | no | confirmed | Remark: keys aren't quoted (`{"x requestId":"forged"}` fakes a field); U+202E written raw |
| 6 | Context values redacted | no | confirmed | Remark: a non-string `userId` (cast) written raw |
| 7 | Secret keys | no | confirmed | Top, nested, arrays, both formats |
| 8 | Tokens out of msg, values, keys, boxed strings; bytes as size | no | confirmed | Probe |
| 9 | URL passwords | no | partly | Leaks: `postgres://u:XYZPASS://more@h/db`; `postgres://admin@srv:S3cr3tPw@srv…azure.com/db` (a valid URL; `redactDatabaseUrl` misses it too) |
| 10 | Errors | no | confirmed | No secret in either format |
| 11 | A cut never leaves part of a secret | no | partly | Values fine; keys cut before redaction: `"k"*190 + T` → 6 token characters; a URL key → the password's start |
| 12 | Cycle, BigInt | no | confirmed | Mutations → 3 / 2 fail |
| 13 | Never blocks on big values | no | confirmed | 100 MB Buffer 1.6 ms; 1e6 array 4.6 ms; 1e6 keys 143 ms; 10 MB key 5.9 ms |
| 14 | Output bounded for any value | no | not met | Shared references multiply: arrays 100^4 → 7.1 s then `Unloggable line`; objects 100^4 → heap out of memory after 25 s |
| 15 | URL loop linear | no | confirmed | 14 patterns × 1e5 → ≤ 9.9 ms |
| 16 | Never throws: getters, Proxies, msg, clock, write | no | confirmed | Field marked; fallbacks |
| 17 | Fallback in the logger's format | no | confirmed | JSON and text |
| 18 | The shared logger and `event()` never throw | no | partly | `RONNE_ENV_FILE=<a folder>` → `logger.info` throws `EISDIR` (`rootLogger()`); `event("nope.nope")` throws a TypeError |
| 19 | stdout closed: no crash | no | not met | `… \| head -1` → unhandled `'error'` `EPIPE`, process killed. On Linux, pipe writes are synchronous (Node's docs) |
| 20 | Invalid `LOG_LEVEL` | no | confirmed | Mutation → 2 fail |
| 21 | `LOG_FORMAT` | no | confirmed | Test |
| 22 | Read in `config.ts` | no | confirmed | Test |
| 23 | Events in one module | no | confirmed | 21 events |
| 24 | No new dependency | no | confirmed | Empty diff |
| 25 | Tests catch the asked mutations | no | confirmed | 26 of 26 |
| 26 | Lint and types | no | confirmed | Clean |

**Overall:** not met: shared references block for seconds or exhaust memory; URL passwords with `://` or behind an `@` in the user name leak, and parts of long keys; the shared logger's `child()` and calls with unreadable settings throw; a closed stdout crashes the server.

## Task 1 — The logger (third check)

Witnessed: 2026-10-14 12:13 EDT, by a fresh agent (blind). Commit: f3598170. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Line fields; reserved fields can't be overwritten | no | confirmed | 62 passed; mutation → 1 fails |
| 2 | JSON order matches the spec | no | confirmed | Test pins it; mutation → 1 fails |
| 3 | Levels and the filter | no | confirmed | Mutation → 5 fail |
| 4 | Event level; unknown event dropped | no | confirmed | Mutation → 1 fails |
| 5 | `child()` bindings; the shared logger's `child()` never throws | no | confirmed | Mutations → 6 / 1 fail; probe |
| 6 | Text format, colours, `LOG_FORMAT` | no | confirmed | Mutations → 3 / 1 fail |
| 7 | Text: controls and bidi marks escaped; keys quoted | no | partly | U+061C written raw; removing U+2066–9 or U+200E/F escaping → 0 fail |
| 8 | "JSON escapes them already" | no | partly | A JSON line holds U+2028, U+0085, U+009B and U+202E raw |
| 9 | Request context | no | confirmed | Mutation → 2 fail |
| 10 | Secret keys | no | confirmed | Mutations → 1 / 2 fail |
| 11 | Tokens | no | confirmed | Mutation → 10 fail |
| 12 | URL passwords with spaces, `@`, `://`, an `@` in the user name | no | partly | Leak: `postgres://u:p@x://y@h/db` → `postgres://u:***@x://y@h/db` |
| 13 | Keys, message, request ID, user redacted | no | confirmed | Mutations → 2 / 1 / 1 / 2 fail |
| 14 | Errors | no | confirmed | Mutations → 1 / 1 / 1 / 1 / 2 fail |
| 15 | Cuts after redaction | no | confirmed | Mutations → 1 / 1 fail |
| 16 | Caps and markers | no | confirmed | Remark: the object marker's form untested |
| 17 | One line's budget | no | partly | Bindings and fields each get a budget: a 99,205-character line; removing the value budget → 0 fail |
| 18 | Shared values stay small and fast | no | confirmed | 100^6 shared objects → 0 ms |
| 19 | Cycle, BigInt | no | confirmed | Mutations → 3 / 2 fail |
| 20 | Throwing getter | no | confirmed | Mutation → 6 fail |
| 21 | Never throws; fallback | no | confirmed | Mutation → 2 fail |
| 22 | Closed stdout | no | confirmed | `\| head -1` → alive; mutation → 1 fails |
| 23 | Node writes pipes synchronously on Linux | no | can't check here | macOS buffers (2 MB in 3 ms); Node's docs not offline |
| 24 | Unreadable settings | no | confirmed | Probe; mutation → 1 fails |
| 25 | Invalid `LOG_LEVEL` | no | confirmed | Mutations → 2 / 1 fail |
| 26 | Read in `config.ts` | no | confirmed | Diff |
| 27 | Events in one module | no | confirmed | 20 plus one |
| 28 | No new dependency | no | confirmed | Empty diff |
| 29 | Tests catch breakage | no | confirmed | 50 mutations, 46 caught |
| 30 | Regexes per `codeql-regex.md` | no | confirmed | Under 1 s on hostile inputs |
| 31 | No environment value in a line | no | confirmed | Only `index.ts:27` reads it, as a level |
| 32 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a password with `@` then `://` leaks its end; a line can hold twice its budget; U+061C passes in text; the spec's "JSON escapes them already" is wrong; Node's Linux pipe behaviour can't be checked here.

## Task 1 — The logger (adversarial, third check)

Witnessed: 2026-10-14 12:21 EDT, by a fresh agent (adversarial). Commit: f3598170. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels, filter, event level | no | confirmed | 7/6/4/3 lines |
| 2 | `child()`, hostile bindings | no | confirmed | 16 of 16 hostile shapes OK |
| 3 | JSON one object per line | no | confirmed | Remark: U+2028/9 raw (valid JSON) |
| 4 | Text: every control range and bidi mark escaped | no | partly | All 1,112,064 code points: only U+061C raw |
| 5 | Text: no forged field or line | no | partly | Object values, `msg` and `domain` unquoted: `v={"a":" requestId=FORGED"} requestId=REAL` |
| 6 | Context | no | confirmed | 300 concurrent → 0 wrong; values redacted |
| 7 | Secret keys | no | confirmed | Any spelling, nested, arrays |
| 8 | Every token out of any string | no | partly | `rmk_` + 42 characters + token → all 43 secret characters written; `rmk_rmk_` + body → 4 |
| 9 | URL rule | no | confirmed | 31 cases; remark: `u:p@ss://word@h` is the rule's limit |
| 10 | URL loop linear | no | confirmed | 18 patterns × 1e5 → ≤ 13.7 ms |
| 11 | Keys redacted before cut | no | confirmed | Mutation → 1 fails |
| 12 | Errors | no | confirmed | Both formats |
| 13 | Cycle, BigInt | no | confirmed | Probe |
| 14 | Budget: milliseconds, never seconds | no | not met | Shared 10 MB Error → 8,468 ms; shared 1e6-key object of `undefined` → 24,192 ms; shared 10 MB string → 687 ms |
| 15 | Budget: a line stays small | no | not met | Shared Error with 5,000-character fields → a 7.9 MB line; `undefined` holes → 495 KB; bindings + fields → 991 KB |
| 16 | The budget never lets a secret through | no | confirmed | `[too big]` or dropped |
| 17 | Shared logger: unknown event, odd `msg` | no | confirmed | Nothing written or fallback |
| 18 | Unreadable settings | no | confirmed | Folder, `chmod 000` |
| 19 | Closed or throwing stdout | no | confirmed | 200,000 lines `\| head -1` → survived |
| 20 | Invalid `LOG_LEVEL` | no | confirmed | No value written |
| 21 | `config.ts` | no | confirmed | Env beats the file |
| 22 | Events | no | confirmed | 20 plus one |
| 23 | No new dependency | no | confirmed | Empty diff |
| 24 | Tests pass | no | confirmed | 62 passed |
| 25 | Tests catch the new behaviour | no | partly | 30 mutations, 24 caught; removing the value budget → a 202 MB line, all pass |
| 26 | Lint and types | no | confirmed | Clean |

**Overall:** not met: the budget doesn't hold for Errors, big strings, many-key objects or slots that spend nothing (8–24 s, lines up to 8 MB); a token after another `rmk_` run is written; text can show a forged field through object values, `msg` or `domain`, and U+061C passes; no test covers the value budget.

## Task 1 — The logger (fourth check)

Witnessed: 2026-10-14 12:36 EDT, by a fresh agent (blind). Commit: 18c3fc59. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Line fields and JSON order; reserved fields kept | no | confirmed | 69 passed; mutation → 7 fail |
| 2 | Levels and filter | no | confirmed | Mutation → 7 fail |
| 3 | Events in one module; unknown dropped | no | confirmed | `events.ts:17-67` |
| 4 | Invalid `LOG_LEVEL` | no | confirmed | Probes; mutation → 1 fails |
| 5 | `config.ts`; unreadable settings | no | confirmed | Folder probe |
| 6 | `child()` bindings, hostile too | no | confirmed | Mutation → 6 fail |
| 7 | Text format, TTY colours | no | confirmed | Probe |
| 8 | Text quoting; `=` escaped in the head | no | confirmed | Probe. Test gaps: row 20 |
| 9 | Control characters and bidi marks escaped in text and JSON | no | confirmed | Every code point; 7 mutations → each 1–2 fail |
| 10 | Context, redacted | no | confirmed | Mutations → 1 / 2 fail |
| 11 | Secret keys | no | confirmed | Mutation → 1 fails |
| 12 | Whole token runs | no | confirmed | Mutation `{43}` → 1 fails |
| 13 | URL rule | no | confirmed | 17 cases. Test gap: row 20 |
| 14 | Keys, msg, request ID, user redacted | no | confirmed | Mutations → 1 / 1 fail |
| 15 | Errors | no | confirmed | Mutations → 1/1/5/3 fail |
| 16 | Cuts and caps | no | confirmed | Mutations → 2 / 1 fail |
| 17 | One budget per line | no | partly | The top-level `err` spends nothing: 57,778 characters against 50,000 |
| 18 | Work once per line; milliseconds | no | confirmed | 162 ms on 10 MB shared 300×. Test gap: row 20 |
| 19 | Cycle, BigInt, getters; never throws | no | confirmed | Mutations → 3 / 2 / 6 fail |
| 20 | Tests catch breakage | no | partly | 48 mutations, 41 caught; not: URL rule after a first URL; key names not charged; string and error caches removed; `=` quoting; object values unquoted; top-level `"[more]"` |
| 21 | Closed stdout | no | confirmed | 200,000 lines `\| head -1` → alive |
| 22 | The stdout note matches Node's docs | no | confirmed | nodejs.org process docs: pipes asynchronous on POSIX; files and TTYs synchronous |
| 23 | `codeql-regex.md` | no | confirmed | ≤ 17 ms on hostile inputs |
| 24 | `codeql-logging.md` | no | confirmed | Token in `LOG_LEVEL` not written |
| 25 | No new dependency | no | confirmed | Empty diff |
| 26 | Lint and types | no | confirmed | Clean |

**Overall:** not met: the top-level `err` skips the budget; six test gaps.

## Task 1 — The logger (adversarial, fourth check)

Witnessed: 2026-10-14 12:39 EDT, by a fresh agent (adversarial). Commit: 18c3fc59. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels, filter | no | confirmed | 6/5/3/2 lines |
| 2 | `child()`, hostile bindings | no | confirmed | Getter, `ownKeys` Proxy, `null` |
| 3 | JSON valid, controls escaped | no | confirmed | Every BMP code point, surrogates: 0 parse failures |
| 4 | Text: one line, controls escaped | no | confirmed | 88 lines, 0 raw |
| 5 | Text: no forged field; head `=` escaped | no | confirmed | Remarks: a literal `\u000a` looks like an escape; quoting untested |
| 6 | Context | no | confirmed | 300/300 |
| 7 | Secret keys | no | confirmed | `__proto__` dropped |
| 8 | Whole token runs | no | confirmed | Every shape |
| 9 | URL to the last `@` | no | confirmed | 24 cases |
| 10 | Linear token regex and URL loop | no | confirmed | ≤ 16.9 ms |
| 11 | Errors | no | confirmed | Stack only at `error` |
| 12 | Every string a line holds is redacted | no | partly | A Date with its own `toISOString`, a `Date` subclass, an invalid Date's `toString`, a Buffer's `byteLength` getter → token written |
| 13 | Caches never return a wrong result | no | confirmed | Alternating getters, changing `ownKeys` |
| 14 | A line stays small | no | not met | 170,804 (`[redacted]` and syntax uncharged); 288,162 / 336,174 (escaping uncharged); 384,225 (`err` uncharged) |
| 15 | Milliseconds, never seconds | no | not met | The string cache is a `Map`; V8 hashes strings over 16,383 characters by length, so equal-length strings share a bucket: 1,000 × 20 KB → 840 ms, 200 KB → 8.9 s, 1 MB → 42 s; a getter returning new 1 MB strings → 11 s |
| 16 | Never exhausts memory | no | not met | `d.toISOString = () => "x".repeat(5e6)` × 100 → heap out of memory |
| 17 | Cycle, BigInt | no | confirmed | Both marked |
| 18 | Never throws | no | partly | `event({toString(){throw}})` throws (`Object.hasOwn`), only past the types |
| 19 | Closed stdout | no | confirmed | `>&-` and `\| head -1` → alive |
| 20 | Unreadable settings | no | confirmed | Folder, `chmod 000` |
| 21 | Invalid `LOG_LEVEL` | no | confirmed | No value written |
| 22 | `config.ts`, `LOG_FORMAT` | no | confirmed | Parsing |
| 23 | Events | no | confirmed | 21 names |
| 24 | No new dependency | no | confirmed | Empty diff |
| 25 | Tests pass | no | confirmed | 69 |
| 26 | Tests catch the new behaviour | no | partly | 38 mutations, 31 caught; not: key charging, objects spending, string and error caches, URL after a first URL, `=` quoting, object quoting |
| 27 | Lint and types | no | confirmed | Clean |

**Overall:** not met: the string cache is quadratic on long equal-length strings; lines reach 170–385 KB; Dates and Buffers with replaced methods write secrets and can exhaust the heap; `event()` throws on a hostile name; seven test gaps.

## Task 1 — The logger (fifth check)

Witnessed: 2026-10-14 12:53 EDT, by a fresh agent (blind). Commit: 99922b6b. Machine: macOS 27.0.1, Node v24.0.0. Judged within the spec's scope (realistic inputs, owner's decision).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Line fields in the spec's order | no | confirmed | Shared logger run; test |
| 2 | Levels and filter | no | confirmed | 78 passed; `LOG_LEVEL=warn` run |
| 3 | Events in one module; unknown dropped | no | confirmed | M8 → 1 fails |
| 4 | Non-string event name doesn't throw | no | confirmed | Six shapes probed |
| 5 | Invalid `LOG_LEVEL` | no | confirmed | M24 → 2 fail |
| 6 | `config.ts`; unreadable settings | no | confirmed | Probes |
| 7 | `child()` | no | confirmed | Tests |
| 8 | Text format, TTY colours | no | confirmed | Real run; colour by test |
| 9 | Text quoting as the spec says | no | partly | An object value with `"` isn't quoted (`o={"a":1}`), as the code and test intend; the spec says it is |
| 10 | Controls and bidi marks escaped | no | confirmed | M20 → 1 fails |
| 11 | Request context | no | confirmed | M19 → 2, M31 → 1 fail |
| 12 | Secret keys | no | confirmed | M17 → 1 fails |
| 13 | Whole token runs | no | confirmed | M18 → 1 fails |
| 14 | URL rule | no | confirmed | M9, M30 → 1 fail each |
| 15 | Keys, msg, IDs redacted; keys cut after | no | confirmed | M16 → 1 fails |
| 16 | Errors | no | confirmed | M21, M25 → 1, M33 → 2 fail |
| 17 | Cycles, BigInt, getters; never throws | no | confirmed | M22 → 2, M23 → 3 fail |
| 18 | Cuts and caps | no | confirmed | M13, M35–37 → 1 fail each |
| 19 | One budget; `err` and keys charged | no | confirmed | M1, M10, M26, M29 → 1, M27 → 2 fail |
| 20 | Strings charged by raw length first | no | confirmed | M2 → 1 fails |
| 21 | Strings and keys over 64 KB not read | no | partly | `isSecretKey` reads the whole raw key on every visit: five 10 MB keys shared 1,000× → 2,004 ms |
| 22 | The line is at most 131,072 characters | no | partly | A non-string `domain` or `userId` stays in the fallback head: 299,809 characters; the fallback isn't measured |
| 23 | Dates and bytes through built-ins | no | confirmed | M6, M7 → 1 fail each |
| 24 | Milliseconds on realistic inputs | no | confirmed | 100,000-object body → 30 ms; except row 21 |
| 25 | Closed stdout | no | confirmed | M34 → 1 fails |
| 26 | Tests catch breakage | no | partly | 38 mutations, 36 caught; not: `cleanText`'s 64 KB check, the error cache |
| 27 | The *Done when* list | no | confirmed | Each backed by a failing mutation |
| 28 | `codeql-regex.md`, `codeql-logging.md` | no | confirmed | Linear; no value written |
| 29 | No new dependency | no | confirmed | Empty diff |
| 30 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a non-string `domain` or `userId` takes a line past the cap; huge keys are read by the secret-key check; the spec's quoting sentence disagrees with the code; two test gaps.

## Task 1 — The logger (adversarial, fifth check)

Witnessed: 2026-10-14 12:53 EDT, by a fresh agent (adversarial). Commit: 99922b6b. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope (realistic inputs).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels, events | no | confirmed | 5/4/2/1 lines |
| 2 | `child()` | no | confirmed | Chained bindings |
| 3 | JSON valid, one line | no | confirmed | 22 hostile shapes from `JSON.parse` |
| 4 | Text: one line, no forged field | no | confirmed | 1 unquoted `requestId=`, the real one |
| 5 | Context | no | confirmed | 300 concurrent → 0 wrong |
| 6 | No secret written | no | confirmed | AggregateError, system errors, tokens, URLs, keys → 0 leaks |
| 7 | Strings over 64 KB not read | no | confirmed | 10 MB shared 100×100 → 0.5 ms |
| 8 | Keys over 64 KB not read | no | partly | `isSecretKey` runs on the raw key first, every visit |
| 9 | Budget charged by raw length | no | confirmed | M6, M7 → 3 / 1 fail |
| 10 | Milliseconds, never seconds | no | not met | A plain object with a 100 MB key shared 100×100 → 10,861 ms |
| 11 | Line at most 131,072 characters | no | not met | `userId` or `domain` an array of controls → 288,177 (JSON), 336,185 (text) |
| 12 | The replacement line keeps the head, valid JSON | no | confirmed | 172 characters, parses |
| 13 | Top-level `err` charged | no | confirmed | M10 → 1 fails |
| 14 | No string cache | no | confirmed | Only `errors` and `keys` maps |
| 15 | Dates and bytes | no | confirmed | M15, M16 → 2 / 1 fail |
| 16 | Cycles, BigInt | no | confirmed | Both formats |
| 17 | Never throws | no | confirmed | M17 → 1 fails |
| 18 | stdout, settings, `LOG_LEVEL` | no | confirmed | 200,000 lines; `>&-` |
| 19 | `config.ts`, events, no dependency | no | confirmed | Empty diff |
| 20 | Tests pass | no | confirmed | 78 |
| 21 | Tests catch the new behaviour | no | partly | 20 mutations, 14 caught; not: the replacement's head, the cap's size, `cleanText`'s 64 KB check, a string cache |
| 22 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a huge key blocks for seconds through `isSecretKey`; the replacement line can pass the cap through a non-string `domain` or `userId`; six mutations pass the tests.

## Task 1 — The logger (sixth check)

Witnessed: 2026-10-14 13:10 EDT, by a fresh agent (blind). Commit: 11f436db. Machine: macOS 27.0.1, Node v24.0.0. Judged within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Line fields in order | no | confirmed | H3 → 2 fail |
| 2 | Levels, filter | no | confirmed | 82 passed; D1 → 5 fail |
| 3 | Events in one module | no | confirmed | 21 names |
| 4 | Invalid `LOG_LEVEL` | no | confirmed | D5 → 1, D6 → 2 fail |
| 5 | `config.ts` | no | confirmed | Fallback to the environment |
| 6 | `child()` | no | confirmed | Test |
| 7 | JSON and text | no | confirmed | D7 → 8 fail |
| 8 | Request context | no | confirmed | D2 → 9 fail |
| 9 | Secret key spellings | no | confirmed | 39 spellings, 0 missed; 10 ordinary names, 0 false positives |
| 10 | Secret check once per object per line | no | confirmed | K6 → 1, K7 → 4 fail |
| 11 | Only a key's end is read | no | partly | A trailing run of `_`/`-` is read whole: 900 objects sharing a 10M-underscore key → 23,455 ms |
| 12 | Redaction rules | no | confirmed | D8, D9, R1–R4 caught |
| 13 | Head keeps names only | no | confirmed | H2 → 1 fails; H1 survives |
| 14 | Fallback under the cap | no | confirmed | Worst head 48,065 characters; H5, H6 → 1 fail each; the third candidate unreachable |
| 15 | Message or ID over 64 KB | no | confirmed | C1 → 1, C2 → 2 fail |
| 16 | Keys over 64 KB not read | no | confirmed | R5 → 2 fail |
| 17 | Quoting sentence matches | no | confirmed | Q1, Q3 → 1 fail each |
| 18 | Cycles, BigInt | no | confirmed | D3 → 3, D4 → 2 fail |
| 19 | Tests pass | no | confirmed | 82 |
| 20 | Tests catch breakage | no | partly | 34 mutants, 28 caught; not: `SECRET_TAIL` one short (`authorizations` missed), a whole-key read, a small non-name domain kept, a string with `"` unquoted |
| 21 | `codeql-regex.md`, `codeql-logging.md` | no | confirmed | Linear; no env value written |
| 22 | No new dependency | no | confirmed | Empty diff |
| 23 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a trailing run of `_` or `-` is read whole; four mutants pass the tests.

## Task 1 — The logger (adversarial, sixth check)

Witnessed: 2026-10-14 13:02 EDT, by a fresh agent (adversarial). Commit: 11f436db. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels; `LOG_LEVEL` trimmed, any case | no | confirmed | Probe |
| 2 | Invalid `LOG_LEVEL` | no | confirmed | One warn line |
| 3 | `child()`; a field's domain wins | no | confirmed | Probe |
| 4 | Events; unknown names dropped | no | confirmed | No throw |
| 5 | Context under concurrency | no | confirmed | 300 → 0 wrong |
| 6 | `config.ts`, settings fallback | no | confirmed | Folder probe |
| 7 | Valid JSON, one line, both formats | no | confirmed | 52 runs |
| 8 | No secret written | no | confirmed | Keys, tokens, URLs, errors, msg, IDs, domain → 0 leaks |
| 9 | Every secret-key spelling caught | no | confirmed | 15 spellings true; 4 ordinary false |
| 10 | A key of any length costs little | no | not met | Separators don't count: 500 objects sharing a 10 MB `id___…` key → 10,645 ms |
| 11 | Head names only | no | confirmed | Object, array left out |
| 12 | Every line ≤ 131,072 | no | confirmed | Largest 50,096 |
| 13 | Fallback valid, head kept | no | confirmed | Parses |
| 14 | Text: nothing passes for a field | no | partly | A key `requestId` + U+200B shows as `requestId=forged` |
| 15 | Cycles, BigInt, no throw | no | confirmed | 52 runs, 0 throws |
| 16 | Dates, Buffers | no | confirmed | `[7000000 bytes]` |
| 17 | Milliseconds on request data | no | partly | 149 ms worst; the shared-key case of row 10 → seconds |
| 18 | Closed stdout | no | confirmed | Alive |
| 19 | No new dependency | no | confirmed | Empty diff |
| 20 | Tests pass | no | confirmed | 82 |
| 21 | Tests catch the new behaviour | no | partly | 12 mutations, 8 caught; not: `SECRET_TAIL` one short, the head's domain check, the per-object cache |
| 22 | Lint and types | no | confirmed | Clean |

**Overall:** not met: separator runs read whole; a zero-width space lets a key pass for `requestId` in text; two test gaps. Remark: a `__proto__` field from request JSON is dropped silently.

## Task 1 — The logger (seventh check)

Witnessed: 2026-10-14 13:06 EDT, by a fresh agent (blind). Commit: 5564b186. Machine: macOS 27.0.1, Node v24.0.0. Judged within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels and the filter | no | confirmed | 4/3/2/1 lines; M41 → 5 fail |
| 2 | Invalid `LOG_LEVEL` | no | confirmed | M43 → 2, M48 → 1 fail |
| 3 | `config.ts`; settings fallback | no | confirmed | Tests pass |
| 4 | Events in one module | no | confirmed | Unknown or `{}` dropped |
| 5 | `child()`; a field's domain wins | no | confirmed | M45 → 1 fails |
| 6 | JSON and text; order | no | confirmed | M46 → 9 fail |
| 7 | Request context | no | confirmed | 200 concurrent → 0 wrong; M44 → 9 fail |
| 8 | Secret key spellings | no | confirmed | 37 spellings, 0 missed; 15 ordinary names, 0 false positives |
| 9 | `isSecretKey` reads at most 256 characters | no | confirmed | 10M-`-` key × 1,000 → 4 ms; M1, M2, M4 → 1 fail each |
| 10 | Values redacted | no | confirmed | 0 leaks; M25, M26, M31, M39, M40 caught |
| 11 | Errors | no | confirmed | M27–M30, M42 caught |
| 12 | Boxed strings, bytes | no | confirmed | M33 → 1 fails |
| 13 | Cut after redaction | no | confirmed | M37 → 1, M38 → 2 fail |
| 14 | Cycles, BigInt | no | confirmed | M34–M36 caught |
| 15 | `__proto__` kept, pollutes nothing | no | confirmed | M7 → 2, M8 → 1 fail |
| 16 | Invisible and control characters escaped | no | confirmed | 23 code points → 0 raw |
| 17 | Text quoting; head `=` | no | confirmed | M15 → 1 fails |
| 18 | Head names only | no | confirmed | M16 → 2, M17 → 1 fail |
| 19 | Two-step cap | no | confirmed | Worst 48,097 characters; M18–M20, M47 caught |
| 20 | Fast on request data | no | confirmed | 200k keys → 49 ms |
| 21 | New tests catch breakage | no | partly | 48 mutations, 45 caught; not: U+180E, U+200C–D, U+2061–4 dropped |
| 22 | Tests pass | no | confirmed | 87 |
| 23 | `codeql-regex.md`, `codeql-logging.md` | no | confirmed | Linear |
| 24 | No new dependency | no | confirmed | Empty diff |
| 25 | Lint and types | no | confirmed | Clean |

**Overall:** not met: three of the spec's invisible characters aren't pinned by a test. Remark: a URL in a stack is hidden to the stack's last `@` (pnpm paths hold one), as the spec allows.

## Task 1 — The logger (adversarial, seventh check)

Witnessed: 2026-10-14 13:12 EDT, by a fresh agent (adversarial). Commit: 5564b186. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels; `child()` | no | confirmed | 87 passed |
| 2 | `isSecretKey` misses no spelling | no | confirmed | 400,000 fuzzed keys against a reference → 0 missed |
| 3 | A key of any length costs little | no | confirmed | ≤ 2.2 µs per call; shared × 1,000 → ≤ 3.9 ms |
| 4 | `__proto__` kept, no leak, no forged field | no | confirmed | JSON and text, nested, bindings |
| 5 | JSON valid, one line | no | confirmed | Every probe line parses |
| 6 | Text: nothing passes for a field (homoglyphs aside) | no | partly | Default-ignorable characters outside the list written raw: U+034F, U+3164, variation selectors, tag characters (astral: `charCodeAt(0)` sees a surrogate) |
| 7 | Request context | no | confirmed | 300 → 0 wrong |
| 8 | No rule-covered secret written | no | confirmed | 21 bodies × 2 formats × 2 levels; real system errors |
| 9 | Line cap; head kept | no | confirmed | Largest 55,119 |
| 10 | Milliseconds | no | confirmed | Worst 23.4 ms |
| 11 | Cycles, BigInt, Dates, Buffers; no throw | no | confirmed | Probes |
| 12 | Closed stdout | no | confirmed | Alive |
| 13 | Invalid `LOG_LEVEL`; `config.ts` | no | confirmed | Tests |
| 14 | Events; no dependency | no | confirmed | Empty diff |
| 15 | *Done when* tests | no | confirmed | 87 pass |
| 16 | Tests catch the new behaviour | no | partly | 19 mutations, 14 caught; not: `SECRET_READ` 255 or 4096, U+180E, U+200C/D, U+2061–4 |
| 17 | Lint and types | no | confirmed | Clean |

**Overall:** not met: text can be forged through default-ignorable characters outside the escaped list; the 256-character bound and four escaped characters aren't pinned by tests. Remark (the spec's limit): a secret inside free text that isn't a token or URL password, or under a key outside the list, is written.

## Task 1 — The logger (eighth check)

Witnessed: 2026-10-14 13:20 EDT, by a fresh agent (blind). Commit: 16ff8786. Machine: macOS 27.0.1, Node v24.0.0. Judged within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels and the filter | no | confirmed | `logger.test.ts:30-59`; mutation `<` → `<=` → 7 fail |
| 2 | Invalid `LOG_LEVEL`: one line, no value, `info` | no | confirmed | Mutations → 2 / 2 fail |
| 3 | `config.ts`; settings fallback | no | confirmed | `config.ts:24-26,50-51`; `index.ts:23-28` |
| 4 | Events in one module; unknown dropped | no | confirmed | `events.ts`; tests |
| 5 | `child()`; a field's domain wins | no | confirmed | Mutations → 1 / 1 fail |
| 6 | JSON and text; order | no | confirmed | Tests |
| 7 | Request context | no | confirmed | 300 concurrent → 0 wrong; mutation → 9 fail |
| 8 | Secret keys | no | confirmed | 200,000 fuzzed keys → 0 missed, 0 false positives |
| 9 | 256-character read, both sides pinned | no | confirmed | `SECRET_READ` 255, 257, 4096 → 1 fails each; 10M key × 1,000 → 2.5 ms |
| 10 | Values, keys, message, IDs redacted | no | confirmed | 9 mutations caught |
| 11 | Errors | no | confirmed | 5 mutations caught |
| 12 | Fields, nested, arrays | no | confirmed | Mutation → 2 fail |
| 13 | Boxed strings; bytes | no | confirmed | Mutations → 1 / 3 fail |
| 14 | Cuts and caps | no | confirmed | 4 mutations caught |
| 15 | Cycles, BigInt | no | confirmed | Mutations → 3 / 2 fail |
| 16 | Hidden characters escaped per code point | no | confirmed | Every code point U+0000–U+10FFFF: 4,274 hidden, 0 raw; 1,107,790 others, 0 lost; JSON round-trips |
| 17 | Astral as surrogate pairs; valid JSON | no | confirmed | U+E0041, U+E0100, U+1D173 |
| 18 | Text: nothing passes for `requestId` | no | confirmed | 11 keys escaped or quoted; U+0301 (visible) raw, a homoglyph |
| 19 | Text quoting; head `=` | no | confirmed | 4 mutations caught |
| 20 | Every escaping category pinned | no | confirmed | 11 mutations caught |
| 21 | Head names only; line cap | no | confirmed | Worst 48,124 characters |
| 22 | Tests pass | no | confirmed | 87 |
| 23 | Tests catch breakage | no | confirmed | 53 non-equivalent mutations, all caught |
| 24 | `codeql-regex.md`, `codeql-logging.md` | no | confirmed | Linear; no value written |
| 25 | No new dependency | no | confirmed | Empty diff |
| 26 | Lint and types | no | confirmed | Clean |

**Overall:** met: every claim holds; the seventh checks' gaps are closed. Remarks: a lone surrogate (or a cut splitting an astral pair) is written raw in text, shown as U+FFFD; a visible combining mark stays raw, a homoglyph.

## Task 1 — The logger (adversarial, eighth check)

Witnessed: 2026-10-14 13:22 EDT, by a fresh agent (adversarial). Commit: 16ff8786. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Levels, filter, `child()`, events | no | confirmed | 91 passed (with `config`) |
| 2 | Invalid `LOG_LEVEL`; `config.ts` | no | confirmed | Tests; tsx run |
| 3 | JSON parses and round-trips, lone surrogates included | no | confirmed | 6,000 fuzzed lines |
| 4 | No raw hidden character; one line each | no | confirmed | Every code point scanned |
| 5 | Text: no field forged, homoglyphs aside | no | confirmed | 16 keys. Remark: U+1D159 and U+16FE4 raw, outside the categories, counted with homoglyphs |
| 6 | Escaping fast | no | confirmed | 120,132-character lines → median 1–2 ms |
| 7 | Line cap; head kept | no | confirmed | Largest 109,091 |
| 8 | Fast on request data | no | confirmed | ≤ 24 ms |
| 9 | No covered secret written | no | confirmed | 0 leaks across every place and both formats |
| 10 | Cycles, BigInt, no throw; closed stdout | no | confirmed | Alive |
| 11 | Request context | no | confirmed | 300 → 0 wrong |
| 12 | Tests catch the escaping | no | confirmed | 16 mutants, all caught |
| 13 | Tests catch the redaction | no | confirmed | 10 mutants, all caught |
| 14 | Tests catch text quoting | no | partly | `/[\s"=]/` → `/[ "=]/` passes all tests; then an NBSP key shows as `x requestId=FORGED` |
| 15 | No new dependency | no | confirmed | Empty diff |
| 16 | Lint and types | no | confirmed | Clean |

**Overall:** not met: the code holds against every in-scope attack; no test pins quoting on a non-ASCII space.

## Task 1 — The logger (adversarial, ninth check)

Witnessed: 2026-10-14 13:30 EDT, by a fresh agent (adversarial). Commit: 4fedd7fb. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | 16ff8786..4fedd7fb only adds a test | no | confirmed | `git diff --stat` → `logger.test.ts`, `WITNESS.md` |
| 2 | The new test catches string quoting narrowed to ASCII | no | confirmed | `/[ "=]/` → 1 fails |
| 3 | It catches object quoting narrowed | no | confirmed | `/[=]/` → 1 fails |
| 4 | Tests catch breakage of escaping, quoting and redaction | no | confirmed | 49 mutants, all caught |
| 5 | No covered secret written | no | confirmed | Both formats → 0 leaks; `secretKey` written (outside the list, a stated limit) |
| 6 | JSON valid, one line, no hidden character, no forged reserved field | no | confirmed | 3,000 fuzzed lines per format × 6 |
| 7 | Text: nothing passes for a field | no | partly | The head doesn't escape `"`: a domain `x"` from request JSON gives `INFO  x" Request received note=" requestId=FORGED " requestId=REAL`; pairing quotes leaves `requestId=FORGED` bare |
| 8 | Never blocks; line cap | no | confirmed | Worst 8.4 ms; largest 51,045 |
| 9 | Never throws; cycles, BigInt | no | confirmed | Probes |
| 10 | Tests pass | no | confirmed | 88 |
| 11 | No new dependency | no | confirmed | Empty diff |
| 12 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a `"` in the head shifts quote pairing in text.

## Task 1 — The logger (ninth check)

Witnessed: 2026-10-14 13:34 EDT, by a fresh agent (blind). Commit: fe722463. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Since the blind eighth pass, only `headText`, two tests and a spec sentence changed | no | confirmed | `git diff bce8f80c fe722463 --stat` |
| 2 | The rebase touched nothing in `server/log`, `config.ts` or dependencies | no | confirmed | `d1d4db34..0bdeafde`: 3 docs files |
| 3 | The head escapes `=` and `"` | no | confirmed | `d"=x m" requestId=FORGED …` |
| 4 | Pairing quotes, the only bare `requestId` is the real one | no | confirmed | 20,000 fuzzed text lines → 0 forged, 0 lone quotes |
| 5 | Tests catch the head escapes | no | confirmed | Each removed → 1 fails |
| 6 | Non-ASCII space quoting tested | no | confirmed | `\s` → ASCII space → 1 fails |
| 7 | The spec states the rule | no | confirmed | SPEC.md diff |
| 8 | Levels | no | confirmed | 4/3/2/1 lines |
| 9 | `child()` | no | confirmed | Probe |
| 10 | JSON and text | no | confirmed | Tests |
| 11 | Request context | no | confirmed | Survives `await` |
| 12 | Redaction | no | confirmed | Probes; tests |
| 13 | Long strings cut | no | confirmed | 2,000 and `…` |
| 14 | Cycles, BigInt; no throw | no | confirmed | Probes |
| 15 | `LOG_LEVEL`, `LOG_FORMAT` | no | confirmed | Parsing |
| 16 | Events in one module | no | confirmed | `events.ts` |
| 17 | No new dependency | no | confirmed | Empty diff |
| 18 | Tests pass; lint clean | no | confirmed | 89 passed |

**Overall:** met.

## Task 1 — The logger (adversarial, tenth check)

Witnessed: 2026-10-14 13:38 EDT, by a fresh agent (adversarial). Commit: fe722463. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass | no | confirmed | 93 with `config` |
| 2 | The head holds no field or quote | no | confirmed | 15,000 fuzzed lines |
| 3 | No forged field to a logfmt-style reader | no | confirmed | 14,787 lines read right |
| 4 | Nothing reads as a bare `requestId=` to a shell-like reader; every line parses | no | not met | A key `requestId\` → `requestId\=FORGED` (shlex: `requestId=FORGED`); unquoted `'` pairs; a quoted key keeps its `=` |
| 5 | The real `requestId` stays its own field | no | not met | A value or message ending in `\` swallows the next token; at the line's end, shlex fails |
| 6 | JSON valid, round-trips | no | confirmed | 15,000 lines |
| 7 | No covered secret written | no | confirmed | 122 lines, both formats |
| 8 | Never throws | no | confirmed | Probes |
| 9 | Never blocks; cap | no | confirmed | Worst 25.7 ms; largest 111,003 |
| 10 | Tests catch breakage | no | partly | 39 mutants, 37 caught; object quoting on `=` unpinned |
| 11 | No new dependency | no | confirmed | Empty diff |
| 12 | Lint and types | no | confirmed | Clean |

**Overall:** not met: to a shell-like reader, a raw `\` or `'`, or a quoted key holding `=`, forges `requestId=`, swallows the real one or stops the line parsing. Remark: a `userId` field can replace or blank the request's user.

## Task 1 — The logger (tenth check)

Witnessed: 2026-10-14 13:47 EDT, by a fresh agent (blind). Commit: b51b7220. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the logger, its tests and the docs changed; no dependency | no | confirmed | `git diff fe722463 b51b7220 --stat` |
| 2 | Tests pass; lint and types | no | confirmed | 95 passed |
| 3 | Plain only when safe, otherwise JSON strings | no | confirmed | `logger.ts:86-109` |
| 4 | The head escapes `\`, `=`, `"`, `'` | no | confirmed | 20,000 fuzzed lines |
| 5 | To `shlex.split`: no forgery, real ids kept, every line parses | no | confirmed | 20,000 lines: 0 errors, 0 forged, 0 wrong user |
| 6 | Nothing swallows the real ids for a reader that splits as a shell does | no | partly | A word starting with `#` (`Item #3`, key `#k`, domain `#d`) is a comment to `sh -c eval` or `shlex.split(comments=True)`: the ids are gone |
| 7 | The request's user wins | no | confirmed | Probes |
| 8 | Tests catch each new rule | no | partly | 18 mutants, 17 caught; the `'` escape in `quoted` isn't tested |
| 9 | The spec states the rules | no | confirmed | SPEC.md |
| 10–19 | Levels, `child()`, formats, context, redaction, cuts, cycles, `LOG_LEVEL`, events, regexes | no | confirmed | Probes and tests |

**Overall:** not met: a word starting with `#` reads as a shell comment; the `'` escape is untested.

## Task 1 — The logger (adversarial, eleventh check)

Witnessed: 2026-10-14 13:49 EDT, by a fresh agent (adversarial). Commit: b51b7220. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass | no | confirmed | 95 |
| 2 | logfmt reader: no forgery, ids kept, every line parses | no | confirmed | 30,000 fuzzed lines |
| 3 | `shlex.split`: the same | no | confirmed | 30,000 lines; hand cases |
| 4 | A POSIX shell's word rules keep the ids | no | partly | `{"#":"x"}` → `… m #=x requestId=…`: `eval "set -- …"` drops the ids; 1,485 of 30,000 lines |
| 5 | To a person: one bare `requestId=` and `userId=`, at the end | no | confirmed | 30,000 lines |
| 6 | The request's user wins | no | confirmed | 3,730 lines |
| 7 | JSON valid, round-trips | no | confirmed | 50,000 lines |
| 8 | No covered secret written | no | confirmed | 24 lines, 4 levels, 2 formats |
| 9 | Never throws | no | confirmed | Probes |
| 10 | Never blocks; cap | no | confirmed | Worst 24.0 ms |
| 11 | Tests catch each new rule | no | partly | 22 mutants, 21 caught; not the `'` escape in `quoted` |
| 12 | No new dependency | no | confirmed | Empty diff |
| 13 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a word starting with `#` hides the ids from a shell's word rules; the `'` escape is untested.

## Task 1 — The logger (eleventh check)

Witnessed: 2026-10-14 13:56 EDT, by a fresh agent (blind). Commit: 07904fe4. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only `PLAIN`, `headText`, tests and the spec changed; no dependency | no | confirmed | `git diff b51b7220 07904fe4` |
| 2 | Tests pass; lint and types | no | confirmed | 96 passed |
| 3 | `#` never plain; escaped in the head | no | confirmed | `logger.ts:86,124` |
| 4 | `shlex.split`, with and without comments: no forgery, ids kept, every line parses | no | confirmed | 30,000 fuzzed lines (11,104 with `#`) → 0 failures |
| 5 | logfmt reader | no | confirmed | Same lines → 0 bad |
| 6 | No word starts with an unquoted `#` | no | confirmed | 0 of 30,000 |
| 7 | `'` escaped in quoted keys and values | no | confirmed | Probe |
| 8 | Tests catch each escaping and quoting rule | no | partly | 19 mutants caught; but `.replaceAll` → `.replace` (first occurrence only) passes for each of the 6 escapes; with `#` first-only, `Item #3 or #4` hides the ids from `shlex.split(comments=True)` |
| 9 | The request's user wins | no | confirmed | Mutant caught; fuzz |
| 10 | The spec states the rules and readers | no | confirmed | SPEC.md diff |
| 11–20 | Levels, `child()`, formats, context, redaction, cut, cycles, `LOG_LEVEL`, events, regexes | no | confirmed | Probes and tests |

**Overall:** not met: the tests don't pin that every occurrence is escaped.

## Task 1 — The logger (adversarial, twelfth check)

Witnessed: 2026-10-14 13:59 EDT, by a fresh agent (adversarial). Commit: 07904fe4. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass | no | confirmed | 96 |
| 2 | `shlex.split(comments=True)`: no forgery, ids kept, every line parses | no | confirmed | 60,000 fuzzed lines → 0 |
| 3 | `shlex.split` (no comments): the same | no | confirmed | 0 |
| 4 | A lenient logfmt reader | no | confirmed | 0 errors |
| 5 | A strict logfmt reader parses every line | no | partly | A port of go-logfmt (from memory) refuses a quoted key (`"x y"=v`, `""=e`) and loses the ids after it; nothing forged |
| 6 | A person sees one bare `requestId=` and `userId=`, at the end | no | confirmed | Every line |
| 7 | The request's user wins | no | confirmed | 0 wrong |
| 8 | `domain` is the domain that wrote the line | no | partly | A field `domain` replaces the child's: `child({domain:"submissions"}).info("x",{domain:"identity"})` → `identity` |
| 9 | JSON valid, round-trips | no | confirmed | 50,000 lines |
| 10 | No covered secret | no | confirmed | 24 lines |
| 11 | Never throws | no | confirmed | Probes |
| 12 | Never blocks; cap | no | confirmed | Worst 8.1 ms; longest 99,654 |
| 13 | Tests catch each text rule | no | partly | 36 mutants, 34 caught; not: PLAIN accepting `""`, PLAIN accepting `$` |
| 14 | `LOG_LEVEL`/`LOG_FORMAT` | no | confirmed | Tests |
| 15 | No new dependency | no | confirmed | Empty diff |
| 16 | Lint and types | no | confirmed | Clean |

**Overall:** not met: a field replaces the logging domain; quoted keys stop a strict logfmt reader; an empty key or value isn't pinned.

## Task 1 — The logger (twelfth check)

Witnessed: 2026-10-14 14:07 EDT, by a fresh agent (blind). Commit: d2929240. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the logger, its tests and the docs changed; no dependency | no | confirmed | `git diff 07904fe4 d2929240 --stat` |
| 2 | Tests pass; lint and types | no | confirmed | 95 passed |
| 3 | Keys never quoted, percent-encoded; empty key `%` | no | confirmed | 30,000 lines, 56,227 keys |
| 4 | Keys distinct and decodable | no | confirmed | 0 mismatches |
| 5 | A strict logfmt reader (go-logfmt port) parses every line | no | confirmed | 0 errors |
| 6 | `shlex.split` with and without comments | no | confirmed | 0 errors |
| 7 | A person: one bare `requestId=`/`userId=`; no `'`; no word starting `#` | no | confirmed | 0 failures |
| 8 | Every occurrence escaped in the head | no | confirmed | 5 first-only mutants caught |
| 9 | The logger's domain wins | no | confirmed | Probes; 3 mutants caught |
| 10 | The request's user wins | no | confirmed | Mutant caught |
| 11 | Tests catch each new rule | no | partly | 29 mutants, 27 caught; not: `"` allowed in `KEY_CHAR` (the line then stops a strict reader); `$` in `PLAIN` |
| 12 | The spec states the rules | no | confirmed | SPEC.md diff |
| 13 | The rest of the task | no | confirmed | Tests and probe |
| 14 | `codeql-regex.md` | no | confirmed | One anchored class |

**Overall:** not met: no test pins a `"` in a key being encoded. Remarks: stale comments and test titles say keys are quoted; an empty `domain` binding counts as the logger's own.

## Task 1 — The logger (adversarial, thirteenth check)

Witnessed: 2026-10-14 14:10 EDT, by a fresh agent (adversarial). Commit: d2929240. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope. Strict reader: a port of go-logfmt's decoder, from memory (the real package isn't on this machine).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass; lint and types | no | confirmed | 95 |
| 2 | No new dependency | no | confirmed | Empty diff |
| 3 | Keys never quoted, percent-encoded | no | confirmed | `%=e %2541=2 a%20b=3` |
| 4 | Two keys stay two | no | partly | Lone surrogates `\ud800`, `\udc00` and U+FFFD all written `%EF%BF%BD` |
| 5 | A strict logfmt reader parses every line | no | partly | U+FFFD or a lone surrogate in a head word → "invalid key", the ids lost |
| 6 | `shlex.split` | no | confirmed | 90,000 lines |
| 7 | A person sees the right ids | no | confirmed | 60,000 lines |
| 8 | The logger's domain wins | no | confirmed | Mutants caught |
| 9 | The request's user wins | no | confirmed | Mutant caught |
| 10 | No covered secret | no | confirmed | 0 leaks |
| 11 | Never blocks; cap | no | confirmed | Worst 2.5 ms |
| 12 | JSON round-trips | no | confirmed | 20,000 sets |
| 13 | Never throws | no | confirmed | Probes |
| 14 | Tests catch each text rule | no | partly | 48 mutants, 44 caught; not: `"` in `KEY_CHAR`, `'` in `PLAIN`, `isPlain` without the hidden check, `$` in `PLAIN` |
| 15 | `LOG_LEVEL`/`LOG_FORMAT` | no | confirmed | Tests |

**Overall:** not met: U+FFFD or a lone surrogate in the head stops a strict reader; lone-surrogate keys collide; three test gaps.

## Task 1 — The logger (thirteenth check)

Witnessed: 2026-10-14 15:02 EDT, by a fresh agent (blind). Commit: 1471fd6f. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope. Strict reader: a go-logfmt-style decoder written for the pass.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the logger, its tests and the docs changed; no dependency | no | confirmed | `git diff d2929240 1471fd6f --stat` |
| 2 | Tests pass; lint and types | no | confirmed | 97 passed |
| 3 | `Cs` and U+FFFD escaped in the head, values and JSON | no | confirmed | 100,000 fuzzed lines → 0 raw |
| 4 | Lone-surrogate keys as `%uXXXX`, all keys distinct | no | confirmed | 0 mismatches, 0 duplicates |
| 5 | A strict logfmt reader parses every line, ids last | no | confirmed | 100,000 lines → 0 errors |
| 6 | `shlex.split` with and without comments | no | confirmed | 0 failures |
| 7 | An empty domain or user counts as none | no | confirmed | Probes |
| 8 | Tests catch each new rule | no | confirmed | 15 mutants, 13 caught; the 2 survivors are equivalent (byte-identical output) |
| 9 | The spec states the new rules | no | confirmed | SPEC.md diff |
| 10–14 | Levels, `child()`, formats, context; redaction; `LOG_LEVEL`; never throws; regexes | no | confirmed | Tests and probes |

**Overall:** met. Remark: one test title still says "quoted keys".

## Task 1 — The logger (adversarial, fourteenth check)

Witnessed: 2026-10-14 15:10 EDT, by a fresh agent (adversarial). Commit: 1471fd6f. Machine: macOS 27.0.1, Node v24.0.0. Within the spec's scope. Strict reader: a line-by-line port of the real go-logfmt `decode.go`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass; lint and types | no | confirmed | 97 passed |
| 2 | No new dependency | no | confirmed | Empty diff |
| 3 | Levels; `LOG_LEVEL`/`LOG_FORMAT`; invalid level | no | confirmed | Mutants caught |
| 4 | No covered secret written | no | confirmed | 4 levels × 2 formats, every place → 0 |
| 5 | JSON valid, round-trips | no | confirmed | 120,000 lines |
| 6 | Never throws | no | confirmed | 18 inputs × 2 msgs × 2 formats |
| 7 | Never blocks; line cap | no | confirmed | Worst 23.3 ms; longest 56,062 |
| 8 | Request context | no | confirmed | 50 concurrent → 0 wrong |
| 9 | The logger's domain wins; empty counts as none | no | confirmed | Mutants caught |
| 10 | The request's user wins | no | confirmed | Mutant caught |
| 11 | In a request, always the request's user | no | partly | In a request with no known user yet, a field names it; the spec's wording and the code disagree |
| 12 | Events in one module | no | confirmed | Mutant caught |
| 13 | Tests catch each rule | no | partly | 92 mutants, 87 caught; not: the 200-character key cut, `\p{M}` in `PLAIN` |
| T1 | Strict logfmt reader parses every line | no | confirmed | 120,000 lines → 0 errors |
| T2 | Keys never quoted, decode to the JSON keys, distinct | no | confirmed | 0 mismatches |
| T3 | logfmt: no forged ids, real ones last | no | confirmed | 0 failures |
| T4 | `shlex.split` | no | confirmed | 240,000 splits → 0 |
| T5 | No two keys the same; the real ids not lost | no | partly | A field `domain` on a logger with no domain goes into the head unencoded: `requestId userId Released … requestId=REAL`; a reader keeping the first value reads them empty |
| T6 | Hidden characters escaped | no | confirmed | Mutants caught |

**Overall:** not met: a field `domain` can put bare words in the text head (T5); the spec's user wording disagrees with the code (11); two test gaps (13). Owner's decision (2026-10-14): this was the last hunting round; T5 is recorded in the spec as a known limit of the text format; 11 is fixed in the spec's wording (the code's rule is the intended one: `auth.signed_in` names the user before authentication has); 13 gets tests.

## Task 1 — The logger (adversarial, closing check)

Witnessed: 2026-10-14 15:13 EDT, by a fresh agent (adversarial). Commit: 87ac3857. Machine: macOS 27.0.1, Node v24.0.0. As the owner decided, it confirmed the fourteenth check's findings were fixed or recorded and didn't hunt new text-format edge cases.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | T5 recorded in SPEC.md's Edge cases as a known limit of the text format | no | confirmed | SPEC.md:149, "Known limits of the text format" |
| 2 | T5 doesn't affect JSON | no | confirmed | `{domain:"requestId userId x"}` → JSON parses with the real ids |
| 3 | The spec's `userId` row: a field names the user only before authentication knows it | no | confirmed | SPEC.md diff |
| 4 | `logger.ts` matches it | no | confirmed | Known user + field → known user; no user + field → field; `setRequestUser` later → the request's user |
| 5 | A test pins the 200-character key cut | no | confirmed | Mutant → 1 fails |
| 6 | A test pins combining marks being quoted | no | confirmed | `\p{M}` in `PLAIN` → 1 fails |
| 7 | Tests pass | no | confirmed | 99 passed |
| 8 | No covered secret written | no | confirmed | 480 lines, 20 hostile inputs × 4 levels × 2 formats → 0 |
| 9 | JSON parses with the right ids | no | confirmed | Every line |
| 10 | Nothing throws | no | confirmed | Cycle, BigInt, getters, Proxies, odd fields |
| 11 | Under the cap, one line, no block | no | confirmed | ≤ `MAX_LINE`+1; no call over 200 ms |
| 12 | Lint and types | no | confirmed | Clean |
| 13 | No new dependency | no | confirmed | Empty diff |

**Overall:** met.

## Task 2 — Requests

Witnessed: 2026-10-14 15:23 EDT, by a fresh agent (blind). Commit: 48d706c3. Machine: macOS 27.0.1, Node v24.0.0. Live probes ran against `next start` builds of a scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every `route.ts` exports only `apiRoute` methods with its own pattern, never the filled-in path | no | confirmed | 22 files; live `GET /api/v1/items/acme/secret-name` → `"route":"/api/v1/items/[scope]/[name]"`, no name in the log |
| 2 | The route guard fails on an unwrapped route or a wrong pattern | no | confirmed | 6 mutations, each 1 failure |
| 3 | Every exported action goes through `serverAction`; its guard fails when one doesn't | no | partly | The guard reads only files starting with `"use server";`: a comment first, or no semicolon, passes; inline `"use server"` actions aren't checked |
| 4 | Lines from a service called by a route carry the ID | no | confirmed | Test; live probe route |
| 5 | Lines from a service called by an action carry the proxy's ID | no | confirmed | Test; live action POST, a spoofed ID ignored |
| 6 | `X-Request-Id` on API responses and pages | no | confirmed | Live: health, 401, auth, sign-in, 307, 404, action POSTs; 413 by test |
| 7 | The incoming ID only with `TRUST_PROXY=true` and well formed | no | confirmed | Live: kept `abc-123.X_y`, 128×`a`; replaced 129×`a`, `a%20b`, `rmk_é`, `a;b`; with false, replaced |
| 8 | An API error → one `http.error` and a 500 in MVP §11's shape | no | confirmed | Live: `internal_error` with the request's ID; one `http.error`; `http.request` 500 at error |
| 9 | A page or action error → one `http.error` from `onRequestError` | no | confirmed | Live: the proxy's ID and the route's pattern; Next's own plain-text line is out of scope (SPEC.md:37) |
| 10 | Next's control flow passes through unlogged | no | confirmed | Live `notFound()`, `redirect()`, a redirecting action → no `http.error` |
| 11 | `http.request` fields and levels | no | confirmed | Live; tests (429 warn, 5xx error) |
| 12 | The user id recorded once a token or session is known | no | confirmed | Live with a real token. Remark: no test fails without `setRequestUser` |
| 13 | `instrumentation.ts`; Next accepts the wrapped exports | no | confirmed | `TURBO_FORCE=true pnpm build` → 5 tasks; `.next/server/instrumentation.js` |
| 14 | Tests pass | no | confirmed | Unit 1496, db (SQLite) 209 |

**Overall:** not met: the action guard misses files with a comment before the directive and inline actions; no test guards the user id on lines.

## Task 2 — Requests (re-check)

Witnessed: 2026-10-14 15:28 EDT, by a fresh agent (blind). Commit: 37fbc142. Machine: macOS 27.0.1, Node v24.0.0. Rows other than 3 and 12 carry over from the first pass; nothing they rest on changed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2, 4–11, 13 | As the first pass | no | confirmed | `git diff --stat 48d706c3 37fbc142` → tests and WITNESS.md only |
| 3 | Every exported action goes through `serverAction`; its guard fails when one doesn't | no | partly | 20 real files pass; a comment first, no semicolon, single quotes, `export default`, `export async function`, inline, `export { hidden }`, CRLF, BOM all fail. Escaped: a second declarator (`export const ok = serverAction(…), sneaky = async …`); `.mts`, `.cts`, `.cjs` files never read; only `apps/web/src` walked |
| 12 | The user id recorded, and tests guard it | no | confirmed | Removing `setRequestUser` from `require-token.ts` or `session.ts`, each alone → 1 test fails |
| 14 | Tests pass; lint and types | no | confirmed | 93 passed; clean |

**Overall:** not met: a multi-declarator export and `.mts`/`.cts`/`.cjs` action files get past the guard.

## Task 2 — Requests (second re-check)

Witnessed: 2026-10-14 15:33 EDT, by a fresh agent (blind). Commit: 4c0c3ad0. Machine: macOS 27.0.1, Node v24.0.0. Rows other than 3 carry over from the earlier passes.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2, 4–13 | As the earlier passes | no | confirmed | `git diff --stat 37fbc142 4c0c3ad0` → `server-action.ts`, its test, WITNESS.md |
| 3 | Every exported action goes through `serverAction`; its guard fails when one doesn't | no | partly | 20 real files pass; 20 bad probes fail (second declarator, re-export, `.mts`/`.cts`/`.cjs`/`.js`/`.tsx`/`.jsx`, `bind`, `Proxy`, `Object.assign`, `export *`, …). Still past: a file under a folder named `e2e` or `test-results` at any depth (skipped by name; `next build` registers it); an escaped `"use server"` directive (Next registers it). Remark: an export that differs under Vitest only passes on purpose |
| 14 | `isServerAction` accepts only `serverAction`'s functions | no | confirmed | Wrappers and plain functions → false; mutations caught |
| 15 | `serverAction` behaves as before | no | confirmed | Its tests pass |
| 16 | No regressions; lint, types and build | no | confirmed | 93 passed; `pnpm lint`; typecheck; `TURBO_FORCE=true pnpm build` → 5 successful |

**Overall:** not met: nested `e2e`/`test-results` folders and escaped directives get past the guard.

## Task 2 — Requests (third re-check)

Witnessed: 2026-10-14 15:38 EDT, by a fresh agent (blind). Commit: 886118e3. Machine: macOS 27.0.1, Node v24.0.0. Rows other than 3 and 16 carry over. A `next build` (16.4.0, Turbopack) checked which probes Next registers as actions.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2, 4–15 | As the earlier passes | no | confirmed | `git diff --stat 4c0c3ad0 886118e3` → the guard test, WITNESS.md |
| 3 | Every exported action goes through `serverAction`; its guard fails when one doesn't | no | partly | Now caught: nested `e2e`/`test-results`/`playwright-report`/`.next`, `"use\x20server"` (CRLF, BOM). Still past, each registered by `next build`: `"use\u{20}server"`, `"u\se server"`, a line continuation, `"use strict"` then an escaped directive, a `.js` in a nested `node_modules` |
| 16 | No regressions; lint and types | no | confirmed | 93 passed; clean |

**Overall:** not met: escapes JSON can't read, a later directive in the prologue, and a nested `node_modules` get past the guard.

## Task 2 — Requests (fourth re-check)

Witnessed: 2026-10-14 15:45 EDT, by a fresh agent (blind). Commit: 51f666fe. Machine: macOS 27.0.1, Node v24.0.0. Rows other than 3 and 16 carry over. A `next build` checked which probes Next registers.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2, 4–15 | As the earlier passes | no | confirmed | `git diff --stat 886118e3 51f666fe` → the guard test, WITNESS.md |
| 3 | Every exported action goes through `serverAction`; its guard fails when one doesn't | no | partly | The third re-check's five probes, 13 earlier ones and new ones fail the guard; 20 real files pass. Past it, each needing a deliberately escaped `use server`: an escaped inline directive; a comment between a prologue string and its `;`; a hashbang first; a CRLF line continuation |
| 16 | The prologue reader can't run code; nothing regressed | no | confirmed | 23 hostile inputs and 300,000 fuzzed strings → nothing ran; 93 passed; typecheck; lint unchanged |

**Overall:** not met: four escaped-directive forms get past the guard; none can be written by mistake. Owner's decision (2026-10-14): a deliberately escaped `use server` is out of scope; recorded in the guard's comment and SPEC.md.

## Task 2 — Requests (closing check)

Witnessed: 2026-10-14 15:51 EDT, by a fresh agent (blind). Commit: 2cfee292. Machine: macOS 27.0.1, Node v24.0.0. As the owner decided, it confirmed the decision is recorded and the guard catches every action written without deliberate escapes; it didn't hunt new escaped forms. Rows other than 3 and 17 carry over.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2, 4–16 | As the earlier passes | no | confirmed | `git diff --stat 51f666fe 2cfee292` → a comment, SPEC.md, WITNESS.md |
| 17 | The owner's decision is recorded in the guard's comment and SPEC.md, covering the four forms | no | confirmed | `server-action.test.ts:93-96`; `SPEC.md:86-88`. Remark: the comment's list left out the CRLF continuation (added since) |
| 3 | Within that scope, every exported action goes through `serverAction`, and the guard fails when one doesn't | no | confirmed | One probe at a time → 1 failed each: unwrapped export, second declarator, re-export, `.mts`, `.cjs`, comment first, inline plain directive, nested `e2e/`, `"use strict"` then `"use server"`; wrapped control passes; 20 real files pass |
| 16 | No regressions | no | confirmed | 93 passed |

**Overall:** met.

## Task 3 — The events

Witnessed: 2026-10-14 16:10 EDT, by a fresh agent (blind). Commit: c8a7c616. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every table event named in one module, level and fields | no | confirmed | `events.ts:17-70`: 21 events, plus `log.level_invalid` |
| 2 | `server.started` after the server loads; the scripts build | no | confirmed | `start.mjs` with a stub server → the line after `STUB SERVER LOADED`; no DATABASE_URL or PUBLIC_URL |
| 3 | `server.migrations_applied` | no | confirmed | Built `start.mjs` → `count:24, latest:0024_scope_moves`; next run "Database up to date" |
| 4 | `http.request`, `http.error` unchanged | no | confirmed | No diff since task 2 |
| 5 | Sign-in and token-exchange events | no | confirmed | `log-events.db.test.ts`. Remark: the exchange's failure also has `via: "cli"` |
| 6 | `token.exchanged`, `token.rejected` (`unknown`, `revoked`, `expired`) | no | partly | The code also writes `disabled`, not in the spec; no test asserts `expired` or `disabled` |
| 7 | `version.released`: one per release, one per bulk release | no | confirmed | Tests: count 1; count 2 |
| 8 | `version.yanked` once per yank | no | confirmed | Second yank writes nothing |
| 9 | `draft.uploaded`, `draft.upload_refused` | no | confirmed | Test. Remark: only the API path logs; web-app drafts write none |
| 10 | Upload and usage rate limits | no | confirmed | Tests |
| 11 | `submission.checks_failed` replaces the `console.warn` | no | confirmed | Test; `err` redacted |
| 12 | `feed.built` tested | no | partly | The line is right (probe: info, then debug from cache) but no test asserts it |
| 13 | `feed.size_warning`, `feed.plugin_skipped`, no item names | no | confirmed | Tests |
| 14 | `db.unavailable` at the health check and at start | no | partly | Health check: tested. At start: only `start.ts`'s plain `✗ Migrations failed …`, no JSON line |
| 15 | Lines the table doesn't name are harmless | no | confirmed | Setup mode, "Database up to date", background build lines, Better Auth's |
| 16 | No line holds an email, a name, an item name, a token, a password or a database URL | no | partly | An `err` carries a library's message as is: a storage EACCES wrote `…/team/secret-item/1.0.0.tgz` under `submission.checks_failed` |
| 17 | Environment values not logged, but the stated exception | no | confirmed | `PORT` as a number; before setup `url` and `command` |
| 18 | Better Auth's logger routed to ours, without its other arguments | no | confirmed | Its "Invalid password" line as `identity`, `source: better-auth`; test |
| 19 | `console.*` gone from `apps/web/src/server` | no | confirmed | One hit, a comment |
| 20 | The guard fails on a new `console.*` | no | confirmed | Catches `console.log`, `console["log"]`, `globalThis.console.log`, a new `.mts`; misses `const { log } = console`, `const c = console` |
| 21 | Tests, lint, types | no | confirmed | Unit 958, db 784; clean |

**Overall:** not met: `feed.built` untested; no `db.unavailable` at start; `token.rejected`'s `disabled` unlisted and `expired`/`disabled` untested; an `err` can carry an item's name through a storage path. Owner's decision (2026-10-14): hide paths under the storage's folder in log lines.
