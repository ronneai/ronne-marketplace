# 141 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 1ad89a71 plus the uncommitted diff to the 132 SPEC and MVP.md. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 "Languages" says root sets the default, whether people may choose and which languages are offered | no | confirmed | line 999: "Planned in 141 … root sets the instance default language, whether people may choose, and which languages are offered" |
| 2 | The row's older text ("no instance default language", "else English") doesn't contradict it | no | partly | the old sentence stood without saying 141 supersedes it |
| 3 | The 132 SPEC points to 141 for the instance default, in Out and in Open questions | no | confirmed | `git diff` of the 132 SPEC |
| 4 | README lists 141 under M19 with its dependencies | no | confirmed | line 361: `129, 132, 122, 007`, same as the SPEC header |
| 5 | The 141 SPEC Goal, Scope and Decisions agree with the MVP row and the 132 pointers | no | confirmed | read |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: row 2.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, row 2). Commit: 1ad89a71 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | MVP.md:999 reads as superseded by 141 and agrees with the SPEC | no | confirmed | "there was no instance default language (a possible later feature, then planned in 141 below)" and "else English (…; the instance's default once 141 is built)" |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.


## Task 2 — Choosing with the instance's settings

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 48d76e23 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `chooseLocale` takes the instance's offered languages and default: off returns the default; on goes saved, cookie, browser, default, skipping a language not offered at each step | no | confirmed | `instance: { default, choosing, offered }` carries the same as separate `offered` and `fallback`; removing the choosing-off return fails 1 test, the offered filter on the cookie fails 2, on the browser 2 |
| 2 | The model and service: three keys, the default always offered, garbage reads as its default, nothing stored gives the defaults | no | confirmed | dropping `wanted.add(fallback)` fails 2 model tests |
| 3 | `requestLocale` reads the settings once per request and falls back as today when it can't | no | confirmed | `requestLanguagePolicy` is wrapped in `cache` and returns null on failure; `server.test.ts`; the cache was read, not run |
| 4 | The unit tests pass | no | confirmed | 24 files, 466 tests |
| 5 | The db tests cover the settings service on SQLite and the servers | no | confirmed | 4 passed on SQLite, PostgreSQL, MySQL and MariaDB |

**Overall:** met. The witness ran its mutations in the working tree and restored them (checked byte for byte); the implementer reran the tests after.


## Task 3 — Settings › Languages

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 647b1428 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tab is in 122's strip and `?tab=languages` renders it, for root only | no | confirmed | `tabs.ts`, `page.tsx`; `languages.test.tsx` strip and 404 |
| 2 | The default's box is ticked and locked, and the lock moves with the default | no | confirmed | removing the hidden field in a scratch copy fails "locks the default's box" |
| 3 | The switch off hides the list, and the ticks are kept when it comes back | no | confirmed | `hidden={false}` fails 2 tests |
| 4 | The "reads as off" note appears when only the default is offered and is gone otherwise | no | confirmed | forcing `readsAsOff` false fails 2 tests |
| 5 | Without JavaScript the locked default is still sent, and the server also adds the default | no | confirmed | removing `wanted.add(fallback)` fails 2 db tests |
| 6 | A default that isn't a language is refused; an empty list becomes the default alone; a non-root actor is refused | no | confirmed | `InvalidLanguageError`, `requirePermission`; db tests |
| 7 | Saving the same values twice writes no row and no audit event | no | confirmed | removing the early return fails 3 tests |
| 8 | The audit event records who, the IP, the target, and from/to (db test) | no | confirmed | cutting `to` down to `{default}` fails the test |
| 9 | The audit sentence reads correctly from empty and rich metadata in en, pt and fr | no | confirmed | `summary.test.ts`, the fixture, the key-parity tests |
| 10 | A saved `user.locale` survives a language turned off | no | confirmed | db test |
| 11 | The tests pass on SQLite and the three servers | no | confirmed | 645 unit tests; 7 db tests; 11 on each server |

**Overall:** met.
