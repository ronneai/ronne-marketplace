# 121 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Tasks 1, 2, 4, 5 and 6 — the clients' job, the refusal, CI, docs and website

Witnessed: 2026-10-14 10:54 EDT, by a fresh agent (blind, read-only). Commit: 9042631 (ronne-web: 9b1a6d8). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task 1: a `windows-latest` job installs and builds core, rmk and rmk-mcp and runs their tests | no | confirmed | `clients-windows.yml`: `runs-on: windows-latest`, the filtered install, `turbo run build test` for the three; ci.yml:136-141 calls it |
| 2 | Task 1: it runs when ci-scope says the clients changed, on every push to main, and nightly | no | confirmed | `ci-scope.js:51-55` `clients`; `changes.yml` sets `clients=true` on non-PR events; `nightly.yml:48-49` |
| 3 | Task 1: the job passed on PR #183 at this commit | yes | confirmed | Run 38582824014, headSha 90426311, job 115917002558: mcp 52 passed; cli 257 passed, 1 skipped; core 380 passed, 1 skipped; "Tasks: 6 successful" |
| 4 | Task 1: tests that fail only on Windows are fixed or written down | yes | confirmed | `apply.test.ts:272` and `tar-stream.test.ts:88` skip on Windows, both in PLAN.md's notes with the 12 rmk failures (1 bug fixed, 11 POSIX assumptions) |
| 5 | (notes) rmk's folder hash leaves executable bits out on Windows, both sides, with a test | yes | confirmed | `apply.ts:249-254` `hashFor`, used at `:308` and `:401`; no other `stateHash(` call; `apply.test.ts:563-576` |
| 6 | (notes) `core.autocrlf` off so golden files match on Windows | yes | confirmed | The step before checkout; log line 38 |
| 7 | Task 2: `"os": ["darwin","linux"]` | no | confirmed | `package.json:51-52`; `platform.test.ts` checks it against `SUPPORTED_PLATFORMS` |
| 8 | Task 2: the refusal comes first in `main`, with a faked-platform test | no | confirmed | `run.ts:75-81` before `parseArgs`; `platform.test.ts` (the pure function with the platform passed in) |
| 9 | Task 2: the Refuses Windows job passes with both steps | no | confirmed | Job 115918299015: "OK: npm refused it for the platform"; the one line, then "OK: refused in one line, exit 1" |
| 10 | Task 2: `packages:check` and `release:smoke` pass with the `os` field | no | confirmed | Node 24 job 115917002167: "2046 files, all on the allowlist"; "started and answered 503 setup_required" |
| 11 | Task 4: four bundles, and their jobs passed | no | confirmed | `bundles.yml:25-28`; the four bundle jobs pass, none win32 |
| 12 | Task 4: no `install.ps1`, its tests, `test-windows-service.ps1`, `winsw.js`; no PowerShell job | no | confirmed | `ls scripts/install scripts/service`; `install-scripts.js:7-9`; `install-scripts.yml` jobs `sh`, `install-scripts` |
| 13 | Task 4: `server-checks.yml` has no Windows install, WinSW or disk job | no | confirmed | Matrix `[ubuntu-latest, macos-latest]`; jobs Install and run, Refuses Windows, Service on Linux, Service on macOS |
| 14 | Task 4: `release.yml` attaches four bundles and `install.sh` only; its notes name no Windows assets | no | partly | `:411` 4 bundles, `:447` the assets, `:433` the WSL line; `:30` still said "six bundles" |
| 15 | Task 4: every remaining suite green on the PR | no | confirmed | `gh pr checks 183` all pass |
| 16 | Task 4: a release dry run lists four bundles and `install.sh` only | no | not met | No release run since 2026-10-06 |
| 17 | Task 4: nothing outside history refers to WinSW, install.ps1, win32 bundles or the Windows service | no | confirmed | Only older features' records, MVP:937, install.md:8-9, negative test fixtures; and feature 100's spec (specified) naming WinSW's rolling files |
| 18 | Task 5: install.md's Windows section; the other docs lose the Windows server | no | confirmed | `install.md:236-253`; README, incident-response, release, threat model |
| 19 | Task 5: MVP's decision with the reason; index rows; "Withdrawn by 121"; the sids note removed | no | confirmed | `MVP.md:937`; 086/087 "withdrawn (121)"; both SPECs; the note gone |
| 20 | Task 5: each changed command was run, or the notes say why not | no | not met | The WSL and PowerShell commands need Windows; the notes didn't say |
| 21 | Task 6: the website builds; tests and typecheck pass | no | confirmed | ronne-web #40's checks: compiled, 105 pages; locally 138 passed, typecheck clean |
| 22 | Task 6: each language has the same sections, with Windows and no Windows server rows | no | confirmed | `docs.test.ts` per language; `windows:` in each install.tsx; none in operations.tsx |
| 23 | Task 6: `install#windows` in both repositories' topics.ts | no | confirmed | ronne-web `topics.ts`; marketplace `help/topics.ts:27`; the refusal's link resolves to it |
| 24 | Task 6: `/install.ps1` no longer redirects | no | confirmed | `next.config.ts` redirects only `install.sh`; `redirects.test.ts` |

**Overall:** not met: tasks 1, 2 and 6 hold with CI evidence; task 4 has no release dry run and `release.yml:30` said six bundles; task 5's notes didn't say the Windows commands weren't run. Remarks: the pt and fr examples kept an English comment.

**Since this pass:** `release.yml:30` says four (fc527969); the notes say the WSL and PowerShell commands weren't run and why (fc527969); feature 100's spec no longer names WinSW; the pt and fr comments translated (ronne-web b309914). Task 4's dry run waits for the merge: `release.yml` runs its dry run from `main`.

## Task 3 — The Windows service and paths go

Witnessed: 2026-10-14 10:53 EDT, by a fresh agent (blind, read-only). Commit: 90426311. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | windows.ts, winsw.ts, their tests and Windows golden files removed | no | confirmed | `git diff --stat`; `ls __golden__` → linux, linux-domain, macos, macos-domain, macos-user |
| 2 | The Windows layout gone | no | confirmed | `windowsLayout`, `programData`, `logDir`, `proxyLogDir` removed; `ServicePlatform = "linux" \| "darwin"` |
| 3 | The `win32` branches gone from control, install, args, model, system, index, paths, run, cli | no | confirmed | Read each file's diff |
| 4 | No `win32` in packages/server/src but the refusal | no | confirmed | Only `platform.test.ts:9` |
| 5 | The web app's Windows-only branches gone, tests updated | no | confirmed | `restartHint`, `writeEnvFile`, `followUp`; one stale comment at `rotate-secret.ts:54` |
| 6 | Every test passes (CI) | no | confirmed | PR #183 head 9042631: all pass; Node 22 job 2309 passed, 15 skipped; databases and e2e pass; packages/server 99 passed locally |
| 7 | Install matrix on Ubuntu and macOS, no Windows entry | no | confirmed | Four install jobs pass with the restore lines; macOS also the STORAGE/b refusal |
| 8 | Service on Linux (systemd) | no | confirmed | Job 115918299399's lines |
| 9 | Service on macOS (launchd) | no | confirmed | Job 115918299448's lines |
| 10 | No WinSW outside 086's, 087's and 121's docs | no | partly | `packs.test.js:45,68,75` (a guard test's input); history in 083, 098, 099 records and 100's spec; 086's index row |
| 11 | Linux and macOS behave exactly as before | no | confirmed | Every Linux/macOS string byte-identical; the removed no-ops and Windows-only members; goldens unchanged. Changed for them: help text (no Windows line, `service --help` lists restore) and the refusal of any platform but darwin or linux |

**Overall:** not met: the removal holds, CI is green, Linux and macOS paths unchanged but help text; the literal WinSW search still finds files (row 10).

**Since this pass** (fc527969): `packs.test.js` rejects `vendor/tool/tool.exe`; feature 100's spec no longer names WinSW; the stale comment fixed; the spec says the refusal covers every system but Linux and macOS; task 3's search excludes past features' records (their PLAN notes and WITNESS passes), clarified in its *Done when*.

## Task 3 — The Windows service and paths go (adversarial)

Witnessed: 2026-10-14 11:09 EDT, by a fresh agent (adversarial). Commit: 90426311. Machine: macOS 27.0.1, Node v24.0.0; a Debian trixie container for a simulated Linux service.

Safety record, the same before and after: `md5 apps/web/.env` → b9eb4577b627e856bf865342d88e9368; `git -C apps/web status --short --ignored .env data` → `!! .env`, `!! data/`; `grep -l w121-adv node_modules/.bin/*` → nothing. Container and clones removed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every test passes | no | confirmed | `pnpm test` in a clone → exit 0; typecheck, lint clean; PR checks pass |
| 2 | No Linux/macOS server test dropped or changed in meaning | no | confirmed | `vitest list` at main and HEAD: only the Windows `dataDir` test gone, 2 refusal tests added |
| 3 | Server checks on Ubuntu and macOS | no | confirmed | Run 38582824391, success |
| 4 | service install/uninstall/status/start/stop/restart/logs as on main | no | confirmed | A harness driving both trees' `runService`: 1500 random scenarios → 0 differences; a planted change → 52 |
| 5 | `scriptForService` as on main | no | confirmed | Same harness, every script: 0 differences |
| 6 | Real Linux: scripts as the account; refusals hold | no | confirmed | Container: setup, rotate-secret, migrate, backup as rmk-server; env or service.json as a link, `"user":"root"`, a non-root caller → refused |
| 7 | Root-only actions need root | no | confirmed | "…needs root. Run: sudo …", exit 1; mutations caught by tests |
| 8 | `isRoot`, `which` unchanged off Windows | no | confirmed | Diff and a probe. Remark: `isRoot` has no unit test (already so on main) |
| 9 | `dataDir`, layouts, plans, messages, paths unchanged | no | confirmed | Differential: equal |
| 10 | `run.ts` opener and start | no | confirmed | `open`/`xdg-open` as before |
| 11 | Web `writeEnvFile`, `restartHint`, rotate-secret's hint unchanged off Windows | no | confirmed | Differential over each case: equal |
| 12 | rmk `hashFor`: Linux/macOS hashes as before; existing state files keep matching | no | confirmed | 400 random folders: equal to `stateHash`; main's state matches HEAD's `diskHash`; a lost exec bit still seen; mutation caught |
| 13 | No `win32` in packages/server/src but the refusal | no | confirmed | `platform.test.ts:9` only |
| 14 | No WinSW outside 086, 087, 121's docs | no | partly | 8 files: history (083, 098, 099, the 086 index row), 100's spec, `packs.test.js` |

**Overall:** not met: every behaviour claim holds, with no differences from main for Linux/macOS; the literal WinSW search finds files (row 14), fixed since in fc527969 (see the blind pass's "Since this pass").

## Tasks 1, 2, 3, 5 and 6 — re-check after the fixes

Witnessed: 2026-10-14 11:12 EDT, by a fresh agent (blind, read-only; it read the notes and earlier passes, as asked). Commit: ff3b6071 (ronne-web: b309914). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Nothing tasks 1, 2 and 6 rest on changed since the earlier passes | no | confirmed | `git diff 90426311 ff3b6071 --stat` → comments, packs.test.js, docs; no code in packages/server, cli, core, clients-windows.yml or server-checks.yml |
| 2 | Task 1: the clients' Windows job passes on ff3b6071 | no | confirmed | Run 38587080754, headSha ff3b6071: passed |
| 3 | Task 2: the refusal covers every system but Linux and macOS, as the spec says | yes | confirmed | `platform.ts:3,8-11`; SPEC.md:30-32; packages/server 99 passed |
| 4 | Task 3: no `win32` in packages/server/src but the refusal | no | confirmed | `platform.test.ts:9` only |
| 5 | Task 3: packs.test.js and 100's spec no longer name WinSW | yes | confirmed | The diff; repo-tools 162 passed |
| 6 | Task 3: every WinSW hit is in 086's, 087's or 121's docs, or other features' notes or WITNESS passes | yes | partly | 12 files; all fit but 083 PLAN.md:11 (a ticked task's text) and README.md:244 (086's index row): records of the past outside the wording |
| 7 | Task 3: the "administrator" comment gone | yes | confirmed | `rotate-secret.ts:54` |
| 8 | `release.yml` says four bundles | yes | confirmed | `:30`; no "six bundles" |
| 9 | Task 3: the behaviour confirmations still hold | no | confirmed | Only a comment changed in source; packages/server passes |
| 10 | Task 5: the notes say which commands weren't run and why | yes | confirmed | PLAN.md:79-83 |
| 11 | Task 6: the pt and fr WSL comments translated | yes | confirmed | ronne-web b309914 |
| 12 | Task 6: the site's tests, typecheck and CI pass at b309914 | no | confirmed | 138 passed; typecheck clean; run 38585019293 success |
| 13 | PR #183's full CI on ff3b6071 green | no | can't check here | 15 pass, 13 pending at 11:12 |

**Overall:** not met: every fix holds; two WinSW records of the past fall outside the *Done when*'s wording (row 6), and CI was still running (row 13).

**Since this pass:** task 3's *Done when* names finished features' tasks and 086's and 087's index rows among the records of the past (what it meant: history isn't rewritten).

## Tasks 1, 2, 3, 5 and 6 — final check

Witnessed: 2026-10-14 11:34 EDT, by a fresh agent (blind, read-only; it read the earlier passes and PLAN.md's notes, as asked). Commit: da5b7f3a. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task 3: every WinSW hit fits the *Done when*'s wording | yes | confirmed | `git grep -il winsw da5b7f3a` → 12 files: 086's and 121's docs; 083 PLAN.md:11 (a finished feature's ticked task); 083 PLAN.md:47,104 and 099 PLAN.md:391,483 (notes); the WITNESS passes of 083, 098, 099; README.md:244 (086's index row) |
| 2 | The last pass's row 6 is fixed | yes | confirmed | The wording names finished features' tasks and PLAN notes, WITNESS passes, and 086's and 087's index rows |
| 3 | PR #183's head is da5b7f3a | no | confirmed | `gh pr view 183` → da5b7f3a…, MERGED |
| 4 | PR #183's full CI on da5b7f3a is green | no | confirmed | 40 checks pass. CI (run 38588456061) on its second attempt: the first, e2e shard 1/2 (job 115936723936) couldn't start its server ("http://localhost:39209/setup is already used"), a port clash, not 121's code |
| 5 | Task 1: the clients' Windows job passes at da5b7f3a | no | confirmed | Jobs 115936723728 and 115939797396: success |
| 6 | Task 2: Refuses Windows, `packages:check`, `release:smoke` | no | confirmed | Job 115938018539; Node 22/24 jobs pass |
| 7 | Task 3: server checks on Ubuntu and macOS and every test | no | confirmed | Four install jobs, systemd and launchd, the three databases, Node 22/24 |
| 8 | Nothing the earlier confirmations rest on changed (ff3b6071..da5b7f3a) | no | confirmed | 121 PLAN/WITNESS text, 099 PLAN note, and `run-backup.db.test.ts` (+8, test-only: the backup starts once the lock is held) |
| 9 | `pnpm witness:check` passes | no | confirmed | Exit 0 |
| 10 | The earlier passes' confirmations carry over | no | confirmed | WITNESS.md:5-109; the only unconfirmed rows for these tasks were task 5's row 20 (fixed, re-check row 10), task 3's WinSW rows (rows 1-2 here) and re-check row 13 (row 4 here) |

**Overall:** met: every claim for tasks 1, 2, 3, 5 and 6 is confirmed; task 4 waits for a release dry run. Remark: the e2e harness's port can clash (a loose end, not 121's).
