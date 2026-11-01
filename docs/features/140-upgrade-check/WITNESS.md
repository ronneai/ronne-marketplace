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


## Task 3 — The job, the settings and the notification

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: f7e78b42 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The job runs under a lease: a second run while one holds it is skipped and does not fetch | no | confirmed | `update-check-job.ts` wraps the check in `runJob`; the gated-run test returns `skipped/locked` with fetch uncalled |
| 2 | The scheduler starts the check 10 minutes after start, then every 24 hours | no | confirmed | fake-timer test: 0 runs at 10m-1, 1 at 10m, 1 at 10m+24h-1, 2 at 10m+24h |
| 3 | The result is stored in the `instance_settings` rows | no | confirmed | `update-check.ts` writes at, latest, url, error, notified in one transaction; the db test reads them back; 9/9 on PostgreSQL, MySQL and MariaDB |
| 4 | The switch defaults to on until turned off | no | confirmed | `switchIsOn` is false only for `"false"`; test |
| 5 | `RONNE_UPDATE_CHECK` is in `config.ts` and reaches the job | no | confirmed | `off`, `OFF`, `0`, `false` tested |
| 6 | One notification per version per active root | no | confirmed | roots only; a second check and a later-added root hear nothing; a new version notifies again |
| 7 | Nothing is sent on failure, and the last good answer is kept | no | confirmed | 503 and 429 tests; the job counts `failed: 1` |
| 8 | An equal or older release is stored and notifies nobody | no | confirmed | test with `v0.8.2` and `v0.8.1` |
| 9 | With the check off, fetch is not called | no | confirmed | `vi.fn` not called across the env values and the switch |
| 10 | A failure after notifying leaves no result, marker or notification | no | confirmed | rollback test, SQLite and the three servers |
| 11 | The plumbing handles the new kind: root only, link to updates, subject `instance` | no | confirmed | `read.db.test.ts`; 54 unit tests |

**Overall:** met. Gaps the witness named: no mutation was run, and the en/pt/fr sentences were not read.


## Task 4 — Settings › Updates and the sidebar mark

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 71dd5f6d plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite | no | confirmed | 39 files, 681 tests |
| 2 | The settings db tests pass on all three dialects | no | confirmed | `node scripts/test-db.mjs postgres\|mysql\|mariadb update-check` → 16 passed each |
| 3 | Updates is a tab of Settings, root only | no | confirmed | `updates.test.tsx` (selected by `?tab=updates`; 404 before anything is read); e2e: a non-root user gets a 404 |
| 4 | Check now is rate-limited to once a minute | no | partly | only the pure `checkedTooRecently` was tested; `checkUpdateNow` itself was not |
| 5 | The commands per runtime come from `updatePlan`, each after a backup | no | confirmed | `updates.test.tsx` "shows each runtime's own commands, after a backup"; e2e sees the clone's commands |
| 6 | The switch is read-only when the environment turns the check off | no | confirmed | `updates.test.tsx`; `setUpdateCheck` ignores the environment, but the check stays off because `runUpdateCheck` takes it |
| 7 | Saving the switch is audited as `settings.update_check` with from and to | no | confirmed | db tests on three dialects; the e2e finds the audit row |
| 8 | "Update available" at the sidebar's foot, for root only | no | confirmed | `AppShell.test.tsx` (shown, absent, folded); e2e: a non-root user has no such link |
| 9 | The mark is root-only in the server function too | no | partly | `updateAvailable` had no direct test |
| 10 | An e2e with a fake release answer sees the notification and the tab | no | confirmed | `playwright test e2e/updates.e2e.ts` → 2 passed; the answer is a seed (the check itself needs GitHub; its tests use a fake fetch); it does not click Check now |
| 11 | Messages exist in en, pt and fr | no | confirmed | the i18n tests |

**Overall:** not met: rows 4 and 9.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, rows 4 and 9). Commit: 71dd5f6d plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Check now is rate-limited to once a minute, in the action | yes | confirmed | `update-check-actions.db.test.ts` → 6 passed (22 on PostgreSQL); dropping `checkedTooRecently` from `checkUpdateNow` in a scratch copy fails its test |
| 4b | Check now is root only | yes | confirmed | skipping the permission check fails "is root's alone" |
| 9 | The sidebar mark is root only in `updateAvailable` | yes | confirmed | removing the `can` guard fails "is the newer version for root, and nothing for anyone else" |

**Overall:** met.

### Re-check (install options)

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 71dd5f6d plus the uncommitted working tree. Machine: macOS (Darwin), Node v24. After the owner asked that the tab show every way Ronne is installed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `updatePlans` lists docker, npm, service, package and clone, this instance's first and the only one `current` | no | confirmed | `runtime.ts`; making `now` always "npm" in a scratch copy fails 2 tests |
| 2 | Each way has its own backup command and commands | no | confirmed | `runtime.ts` and `runtime.test.ts` |
| 3 | The panel renders each as `<details>`, only the current one open and marked "This instance" | no | confirmed | making every one open fails "lists every way to install, this instance's first, open and marked" |
| 4 | The texts exist in en, pt and fr | no | confirmed | `src/i18n` tests pass |
| 5a | The e2e asserts this instance's way is the only open block and is marked | no | confirmed | `updates.e2e.ts:49-53`; 2 passed |
| 5b | The e2e asserts another way (Docker, the packages) is hidden until opened | no | confirmed | `updates.e2e.ts:55-59` |
| 6 | The earlier claims still hold (mark, switch, audit, rate limit) | yes | confirmed | 40 files, 704 tests; db project 5 files, 76 tests |

**Overall:** met. An e2e mutation was not run (a rebuild is slow); the same mutation fails the unit test.


## Task 5 — Messages

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: f7584702 plus the uncommitted line in `apps/web/e2e/pages.ts`. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The parity, raw-text and related suites pass | no | confirmed | `npx vitest run src/i18n src/features/admin-settings src/features/notifications src/features/admin-audit` → 41 files, 663 tests |
| 2 | `pnpm lint` passes, including the raw-JSX rules | no | confirmed | exit 0 (42 warnings, 4 infos, no errors) |
| 3 | No raw user-facing string is left in the new components | no | confirmed | grepped `UpdatesPanel`, `UpdatesTab`, `Sidebar`, `AppShell` for JSX text and literal `label`, `title`, `aria-label` |
| 4 | Every new key exists in en, pt and fr with the same ICU placeholders | no | confirmed | the diffs of `admin.json`, `notifications.json`, `shell.json`; the parity test passes |
| 5 | The parity test catches a renamed placeholder | no | confirmed | `{current}` → `{cur}` in pt made `messages.parity.test.ts` fail; restored |
| 6 | The pt copy is real Brazilian Portuguese | no | confirmed | read; "Você usa a {current}" read oddly with a bare version number |
| 7 | The fr copy is real Canadian French and follows `i18n.md` | no | partly | about 8 strings in the new `updates.*` block used the straight apostrophe where the app requires `’` |
| 8 | The phone sweep passes on the Updates tab | no | confirmed | `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone --grep "as root\|no page scrolls sideways"` → 6 passed in en, pt and fr |

**Overall:** not met: row 7.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind re-check of rows 6 and 7). Commit: f7584702 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Every fr string feature 140 added uses the curly apostrophe | yes | confirmed | every added line of `git diff main -U0 -- apps/web/messages/fr` grepped for a letter, a straight `'` and a letter: no match |
| 6 | The update notice reads "You run version {current}" in all three languages | yes | confirmed | `notifications.json`: en, pt "Você usa a versão {current}", fr "Vous utilisez la version {current}"; placeholders match |
| 9 | The `compose.yaml` diff is only the `RONNE_UPDATE_CHECK` pass-through | yes | confirmed | `git diff compose.yaml`: a comment and `RONNE_UPDATE_CHECK: ${RONNE_UPDATE_CHECK:-}` |
| 10 | The i18n, notifications and admin-settings tests pass | yes | confirmed | 37 files, 622 tests |
| 8 | The phone sweep still passes after the rewording | yes | confirmed | rerun by the implementer on phone, phone-webkit and tablet: 6 passed each (the witness did not rerun it) |

**Overall:** met.
