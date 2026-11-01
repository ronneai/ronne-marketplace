# 140 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 5f78b1b0 (tree clean). Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has an "Upgrade check" row | no | confirmed | `grep -n -i "upgrade check" docs/MVP/MVP.md` → line 1011 |
| 2 | The row agrees with the SPEC's Goal and Decisions | no | confirmed | root only, notification center, per-install instructions, off switch, silent offline; Decisions 2-4 are left out, not contradicted |
| 3 | README lists 140 in M21 with its dependencies | no | confirmed | line 393: `139, 122, 102, 005, 035, 082, 085`, same as the SPEC header |
| 4 | The README row says what the SPEC says | no | confirmed | covers the daily request, lease, one notification per version, the tab, the mark, the switch |
| 5 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.


## Task 2 — The check

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: e8264c57 plus the uncommitted `apps/web/src/server/updates/`. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `checkForUpdate({ fetch, current })` is pure: fetch is injected, nothing else is touched | no | confirmed | imports only `compareNewestFirst` from core |
| 2 | The request: URL, 10 s timeout, fixed `User-Agent`, no credentials | no | confirmed | `redirect: "manual"` → `"follow"` in a scratch copy fails a test |
| 3 | Newer, equal and older are told apart | no | confirmed | flipping the comparison fails 4 tests |
| 4 | A running pre-release hears of the stable one; a pre-release tag is never announced | no | confirmed | `stable = true` fails 1 test |
| 5 | A bad tag is `bad_answer` | no | confirmed | `it.each`, anchored regex |
| 6 | 403 and 429 are `rate_limited`, other errors `unreachable` | no | confirmed | removing the branch fails 1 test |
| 7 | A timeout or network error is `unreachable` | no | partly | the test only makes the fake fetch throw; nothing shows the signal aborts a hanging fetch |
| 8 | Redirects stay on the same host; a loop fails | no | confirmed | removing the host check fails 1 test |
| 9 | An oversized body is refused, declared or streamed | no | partly | replacing `size > MAX_BYTES` with `false` left all 17 tests passing: the streamed test body was not JSON |
| 10 | The unit tests pass | no | confirmed | 17 passed |

**Overall:** not met: rows 7 and 9 are tests too weak for the Done when.

### Adversarial

Witnessed: 2026-10-31, by a fresh agent (adversarial). Commit: e8264c57 plus the uncommitted `apps/web/src/server/updates/`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests cover every case in the Done when | no | confirmed | 18 passed |
| 2 | Redirects stay on https://api.github.com | no | confirmed | `api.github.com@evil`, `//evil`, `:444`, `.evil` suffix, backslash tricks all refused without a second request |
| 3 | The request leaks nothing about the instance | no | confirmed | headers are `User-Agent` and `Accept` only |
| 4 | The 10 s timeout covers a slow body | no | partly | real fetch stalled body: `unreachable` at 10 s, but nothing in the code guaranteed it; a hop got a fresh signal (worst case 40 s) |
| 5 | The 1 MiB limit holds for streamed bodies | no | confirmed | `readLimited` counts per chunk and cancels |
| 6 | Odd tags are handled sensibly | no | partly | accepted `v01.2.3`, `rc..1`, huge numbers and a 100 000-character pre-release |
| 7 | `html_url` cannot spoof the notes link | no | partly | `.../tag/..` and another tag of the same repo were accepted |
| 8 | The comparison holds against odd running versions | no | partly | `""`, `0.8` and `garbage` silently gave `newer` false/true without an error |
| 9 | A redirect response's body is released | no | partly | never cancelled |

**Overall:** not met: rows 4 and 6 to 9.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (adversarial re-check). Commit: e8264c57 plus the uncommitted `apps/web/src/server/updates/`. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| a | One 10 s deadline covers the whole check, including a stalled body and every hop | no | confirmed | real server, stalled and dribbling bodies: `unreachable` at 10 s; slow hops share the deadline; removing `untilAborted` fails the stalled-body test |
| b | Tags are strict semver of at most 64 characters | no | confirmed | accepted `v1.0.0-rc.1`, `v0.10.2`, `v1.0.0-alpha-1`; refused leading zeros, `+b`, empty identifiers, a trailing newline; removing the length check fails a test |
| c | The notes URL is built from the version; `html_url` is ignored | no | confirmed | `html_url: https://evil/x` → built URL; mutation fails 2 tests |
| d | Redirect bodies are cancelled | no | confirmed | removing the cancel fails its test |
| e | A running version that isn't semver is `bad_answer`; build metadata is allowed | no | confirmed | `01.0.0`, `v0.8.2`, `""`, `1.0` refused; `0.8.2+build.5` ok |
| f | The streamed-oversize test fails without the streamed limit | no | confirmed | mutation fails 1 test |
| g | A hanging fetch is covered by a test | no | confirmed | 29 passed |

**Overall:** met. Minor, not blocking: a `current` of `0.8.2+` is accepted.

### Re-check (blind)

Witnessed: 2026-10-31, by a fresh agent (blind re-check of rows 7 and 9). Commit: e8264c57 plus the uncommitted `apps/web/src/server/updates/`. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | A hanging fetch is given up on when the 10 s signal aborts | no | confirmed | 29 passed; the stalled-body test fails when `untilAborted` is removed; the hanging-fetch test itself was not mutated |
| 9 | A streamed body over 1 MiB with no content-length is refused | no | confirmed | `size > MAX_BYTES` → `false` fails "refuses a body over 1 MiB"; a body just under the limit passes |

**Overall:** met.
