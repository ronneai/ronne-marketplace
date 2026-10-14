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
