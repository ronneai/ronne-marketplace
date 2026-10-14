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
