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
