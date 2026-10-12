# 098 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The threat model

Witnessed: 2026-10-11 22:25 EDT, by a fresh agent (blind). Commit: 149e14a9 (+ uncommitted `docs/security/threat-model.md`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The file has the spec's six sections | no | confirmed | `threat-model.md:14,37,50,91,152,174` → What it holds, Who might attack, Trust boundaries, Threats, Known gaps, Keeping it true |
| 2 | Section 1 lists the assets the spec names | no | confirmed | `:25-35`: accounts, sessions, token hashes, versions, drafts, audit log with IPs, usage totals, settings file, backups; argon2 is real (`identity/repositories/argon2-password-hasher.ts`) |
| 3 | Section 2 lists the eight attackers from spec item 2 | no | confirmed | `:39-48`, all eight rows |
| 4 | Mermaid boundary diagram with browser, rmk/MCP, feed helper, web app, DB/storage, review, dev machine and mirror | no | confirmed | `:52-79` is a `mermaid` flowchart with all of them |
| 5 | One threat table per boundary (4.1–4.6), each with "what stops it" and "what's left" | no | confirmed | `:93-150`, six tables; boundaries 5 and 6 share 4.5; none missing |
| 6 | 4.1: non-author approval; override audited | no | partly | `decisions.ts:18`, `audit-event.ts:48` confirmed; but "root's own override needs a reason" is false (`reviews.ts:106`, optional since 054), and personal workspaces' self-approval (`submissions.ts:321`) isn't mentioned |
| 7 | 4.1: the 7 risk-flag kinds, `rmk info`, bulk approve flagged first | no | confirmed | `risk-flags.ts` → 7 kinds, `:68`; `registry-commands.ts:170`; `BulkApprove.tsx:104` |
| 8 | 4.1: sha256 checked; `checksum_mismatch` at install.ts:141 | no | confirmed | `install.ts:141,302` |
| 9 | 4.1: `rmk install` writes files and never runs them | no | confirmed | no `child_process`/`spawn`/`execFile` in `cli/src/apply.ts`, `install.ts`, `core/src/render` |
| 10 | 4.1: yank moves `latest` back; "`rmk` warns about yanked pins" | no | not met | `versions.ts:189` `latestAfterYank` confirmed; no yank warning: `resolve.ts:50` warns only `deprecated`; probe locked to yanked 1.1.0 → `"warnings":[]` |
| 11 | 4.1: `secretLike` at package-checks.ts:90 | no | confirmed | `:90` defined, `:299` used |
| 12 | 4.2: sign-in limits and the same answer for every failure | no | confirmed | `login-rate-limiter.ts:19-20`; `token-exchange.ts:3,13`; `session.ts:46` |
| 13 | 4.2: sessions read every request, no cookie cache, 30 days | no | confirmed | `session.ts:26-32`; no `cookieCache`; `better-auth.ts:17` |
| 14 | 4.2: token facts | no | confirmed | `access-token.ts:8,14,18,40`; `user-admin.ts:195-196,259-260`; `access-tokens.ts:136` (refs off by 1–2) |
| 15 | 4.2: `AUTH_SECRET` is 32 random bytes | no | confirmed | `setup/env-file.ts:117-119` |
| 16 | 4.2: HTTP/1.1 only under E-7 | no | confirmed | `compose.yaml:135`, `caddyfile.ts:35`, `dependencies.md:157` |
| 17 | 4.2: upload limits | no | partly | values confirmed; links are refused in `pack/tar.ts:107` and `submissions/models/zip.ts:124`, not `package-checks.ts`; the 50-draft cap is the upload API's only (`drafts.ts:564`) |
| 18 | 4.2: usage report limits, nothing about the sender | no | confirmed | `usage-rate-limit.ts:10-11`; `usage-api.ts:22`; `0012_usage.ts` |
| 19 | 4.3: visibility guard tests | no | confirmed | both `visibility-guard.db.test.ts` and the audit guard → 3 files, 12 tests passed |
| 20 | 4.4: settings file 0600 via a temporary file; audit append-only guard | no | confirmed | `env-file.ts:96-107`; `audit-log.guard.test.ts` passes |
| 21 | 4.5: the token never in the URL or the settings file | no | partly | `plugin-setup.ts:96` default helper confirmed; `--static-headers` writes it into user settings (`:95`, `:142`) |
| 22 | 4.5: `lstat` before writing; mirror only for chosen workspaces | no | confirmed | `apply.ts:62-64`; `feed-build.ts:39-42` |
| 23 | 4.6: pnpm protections | no | confirmed | `pnpm-workspace.yaml:8,10,12,19,26` |
| 24 | 4.6: audit, licenses, CodeQL, Trivy | no | confirmed | ci.yml, nightly.yml, release.yml; `codeql.yml`; `build-image/action.yml:74` |
| 25 | 4.6: images pinned by digest, nothing left | no | partly | Dockerfile and Caddy confirmed; `compose.yaml:90` `postgres:18` and `:105` `mysql:8.4` are tag-only |
| 26 | 4.6: npm provenance, image provenance and SBOM | no | confirmed | `release.yml:70,127,228-229` |
| 27 | Spec item 4 "Export and uploads" filters | no | partly | no row states only-previewed files, no `.env`, keys, `.git` |
| 28 | Every known gap names a feature or a traceable decision | no | confirmed | README `:270,308,320,282-284,295-296,245`; MVP `:772,962,705-706,732`; 009 SPEC:42; 007 SPEC:21 |
| 29 | Future work labelled as such | no | partly | revoke-access, rotate-secret and 099–101 labelled; the incident runbook (`:4,101,128`) and the release checklist step (§6) read as existing |

**Overall:** not met: claims 6, 10, 17, 21, 25, 27 and 29 need fixes.

### Re-check

Witnessed: 2026-10-11 22:29 EDT, by a fresh agent (blind). Commit: 149e14a9 (+ uncommitted `docs/security/threat-model.md`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root's override of its own submission: reason optional (054), always audited | no | confirmed | `threat-model.md:97`; `reviews.ts:102-107` `requires: null`; `audit-event.ts:49` |
| 2 | Personal workspaces' self-approval stated as an exception, with 115's guard and the decision | no | confirmed | `:98`; `submissions.ts:309-321` `self_approve`; `scope-moves.ts:332,352`; `kysely-scope-moves.ts:450`; `MVP.md:906` |
| 3 | A yanked pin installs with no warning, stated as a known gap against 022 | no | confirmed | `resolve.ts:50,391-414,244`; no warning in `packages/cli/src`; 022 SPEC:107; file `:102`, gap `:175` |
| 4a | Links refused when unpacking, in `pack/tar.ts:107` and `zip.ts:124` | no | confirmed | `tar.ts:103-108`; `zip.ts:122-124`; `package-checks.ts:29,31` |
| 4b | The 50-draft limit is the upload API's only | no | confirmed | `drafts.ts:564,627`; 037 SPEC:119-121 (wording nit applied after the pass) |
| 5 | Feed token out of the settings file by default; `--static-headers` writes it, and the file says so | no | confirmed | `plugin-setup.ts:95,96,140-142`; file `:141` |
| 6 | Base images pinned by digest; optional database images stated as tag-only | no | confirmed | `Dockerfile:9`; `compose.yaml:64,90,105`; file `:151`, gap `:176` |
| 7 | Export uploads only previewed files, never `.env`, keys, `.git`, links or env values | no | confirmed | row `:104`; `MVP.md:710`; `native-readers.md:60-66`; `export.ts:368,371,415`; `export-command.ts:511-536`; `mcp/src/export-tools.ts:31` |
| 8 | The incident runbook and release-checklist step labelled as coming (tasks 5 and 6) | no | confirmed | no `incident-response.md`; nothing in `release.md`; file `:4-5,12,102,130,183-184` |
| 9 | Every known gap names a feature, a decision, or the owner | no | confirmed | `:160-177`, 18 rows traced to `features/README.md`, feature folders, MVP §12, §14.2, §15 |
| 10 | No regression in the other rows | no | confirmed | spot checks of `risk-flags.ts:68`, `install.ts:141`, `session.ts:26`, `access-token.ts:8,14,18,40`, `user-admin.ts:195,259`, `login-rate-limiter.ts:19`, `apply.ts:62`, `env-file.ts:98`, guard tests; future items labelled |

**Overall:** met. Three wording nits (the draft limit, "will cover", `access-tokens.ts:134`) were applied after the pass; they change no claim.

## Task 2 — `revoke-access`

Witnessed: 2026-10-11 22:31 EDT, by a fresh agent (blind). Commit: 17a33fd9 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `--everyone` ends every session and revokes every live token in one transaction; accounts and passwords unchanged | no | confirmed | `services/instance-access.ts` inside `repo.transaction`; `instance-access.db.test.ts` → 8 passed on SQLite |
| 2 | `--user <email>` only that person's; email normalised | no | confirmed | db test; CLI `--user ROOT@example.com --yes` → "Ended 1 session and revoked 0 access tokens." |
| 3 | `--sessions-only` / `--tokens-only` each half; together refused (exit 2) | no | confirmed | db test; `cli.test.ts`; CLI `--everyone --sessions-only --yes` → "Ended 1 session." |
| 4 | One `instance.access_revoked` event, actor null, counts only, target user or instance | no | confirmed | `audit_log` rows `{"via":"cli","scope":"user","email":…,"sessionsEnded":0,"tokensRevoked":1}` and `{"via":"cli","scope":"everyone",…}` |
| 5 | Unknown email: says so, changes nothing, exit 1 | no | confirmed | CLI → "✗ That user doesn't exist.", exit 1; db test: no events |
| 6 | A disabled user has nothing left to revoke | no | confirmed | db test → 0/0; CLI prints "Nothing to revoke" |
| 7 | Two runs at once revoke each once, counts right | no | confirmed | `Promise.all` db test; `-t "two runs"` 3× on postgres, mysql, mariadb; mutation without `revoked_at is null` fails it |
| 8 | DB tests pass on the four databases | no | confirmed | SQLite 26 passed; `test:db:postgres/mysql/mariadb` → 11 passed each |
| 9 | A test shows a revoked session and token get 401 on the next request | no | partly | tests stop at `getCurrentUser` → null and `authenticateToken` → `token_revoked`; no test asserts 401 |
| 10 | Asks in a terminal; no → nothing; no terminal without `--yes` → exit 2 | no | confirmed | under `expect`: question, `y` → done, `n` → "Cancelled. Nothing was revoked."; scripts test: exit 2 |
| 11 | `pnpm run revoke-access` at the root and in apps/web | no | confirmed | `package.json`, `apps/web/package.json`; CLI runs above |
| 12 | tsdown builds `dist-scripts/revoke-access.mjs` | no | confirmed | `tsdown --out-dir <scratchpad>` → among 7 files |
| 13 | Docker routes `pnpm run revoke-access` | no | confirmed | `docker/pnpm:13`; `sh -n` OK |
| 14 | `rmk-server` SCRIPTS and the service path | no | confirmed | `cli.ts:8`; `run.ts:103` → `scriptForService`; `SCRIPT_VERBS`; `cli.test.ts` 6 passed |
| 15 | `rmk-server revoke-access --help` lists it | no | partly | `rmk-server --help` lists it; `revoke-access --help` → "✗ Unknown option '--help'", exit 2 |
| 16 | The action in `AUDIT_ACTIONS`, the `instance` group, a summary | no | confirmed | `audit-event.ts:10`; `summary.test.ts` passes; typecheck and lint clean |

**Overall:** not met: no test asserts the 401 (9), and `revoke-access --help` is an error (15). Minor: a half with nothing to do still revokes "0" and records an event; `HELP` leaves out `[--yes]`.

Witnessed: 2026-10-11 22:38 EDT, by a fresh agent (adversarial). Commit: 17a33fd9 (+ uncommitted diff, tree fingerprint 2346482b). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `--everyone` ends every session and revokes every not-yet-revoked token, root's included | no | confirmed | seeded 3 users; built script → "Ended 9 sessions and revoked 6 access tokens."; already-revoked left alone; 8/8 on four databases |
| 2 | `--user` only that person; trimmed and lower-cased | no | confirmed | `--user " ADA@EXAMPLE.COM " --tokens-only` → only ada; a hand-written mixed-case row isn't found (errs to nothing) |
| 3 | One transaction: an audit failure leaves nothing changed | no | confirmed | probe making `recordAudit` throw → 9/6/4 before and after |
| 4 | One event, actor null, counts only, no secrets | no | confirmed | `audit_log` row; `grep -c SEKRET` on a failing-URL trace → 0 |
| 5 | Each half exactly | no | confirmed | `--sessions-only` → tokens untouched; `--tokens-only` → sessions untouched |
| 6 | Bad combinations and unknown flags → exit 2 | no | confirmed | both halves, `--yes` alone, both targets, `--all`, `--no-yes`, positional, `--user` without value → 2 |
| 7 | Never disables or changes a password | no | confirmed | service calls only delete/revoke/audit; db test |
| 8 | Unknown email: nothing changes, exit 1, no event | no | confirmed | exit 1; event count 2 → 2 |
| 9 | Refused on the very next request, no cache | no | confirmed | db test; `require-token.ts:31,69`; no `cookieCache`/`secondaryStorage` |
| 10 | Never waits without a terminal | no | confirmed | `</dev/null` → exit 2; pty: Enter → cancelled, `y` → done |
| 11 | Two runs at once | no | confirmed | 6 concurrent processes on PG, MySQL, MariaDB and SQLite WAL: all exit 0, counts add up, no deadlock |
| 12 | Wired in pnpm, tsdown, docker/pnpm | no | confirmed | `package.json:27`, `apps/web/package.json:17`; built and ran; `Dockerfile:59` copies `dist-scripts` |
| 13 | `rmk-server revoke-access --help` lists it | no | partly | `HELP` lists it; the script answers `--help` with "Unknown option", exit 2 |
| 14 | Runs as the service account with a service installed | no | confirmed | `run.ts:103-110`, `control.ts:198`; marketplace tests 117/117 (no real service run) |
| 15 | No regressions | no | confirmed | 40 files, 285 passed; typechecks and biome clean |

**Overall:** not met: `revoke-access --help` (13). Also found: a half with nothing to do says "Revoked 0" and records an event; a run that loses a race prints zeros; a malformed `--user` exits 1, not 2; a bad `DATABASE_URL` prints a stack trace (as `reset-root-password` does; no password in it).

### Re-check

Witnessed: 2026-10-11 22:42 EDT, by a fresh agent (blind). Commit: 17a33fd9 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | After revoke-access a revoked token gets 401 from the token guard and an ended session redirects to sign-in, on four databases | no | confirmed | `instance-access.db.test.ts` "the next request after revoke-access": `requireToken` ok before, 401 `token_revoked` after; `requireUser` resolves before, `NEXT_REDIRECT` after; 15 passed on SQLite, postgres, mysql, mariadb |
| 2 | `revoke-access --help` prints the usage, exit 0; `rmk-server --help` lists it with `[--yes]` | no | confirmed | built `dist/bin.js revoke-access --help` and `pnpm run revoke-access --help` → usage, exit 0; `rmk-server --help` → the line with `[--yes]` |
| 3a | A half already empty says "Nothing to revoke" and writes no event | no | confirmed | probe: `--tokens-only` with only a session → "Nothing to revoke … no access tokens."; one event in `audit_log`, from the real run |
| 3b | A run that finds nothing left after a race says so | no | confirmed | probe `race.mts` → "Nothing left to revoke … another run revoked it first." |
| 4 | A malformed `--user` exits 2 | no | confirmed | `not-an-email`, `a@b`, `''`, `x@@example.com`, `--user=bad` → "Invalid --user", exit 2; test covers it |
| 5 | The other test files and typecheck pass | no | confirmed | `cli.test.ts`, `summary.test.ts` 16 passed; server `cli.test.ts` 6 passed; typecheck 7/7 |

**Overall:** met.

Witnessed: 2026-10-11 22:52 EDT, by a fresh agent (adversarial). Commit: 17a33fd9 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `--help` / `-h` prints the usage and exits 0 whatever else is given, without the database | no | confirmed | `--help`, `-h`, `-hy`, `--help --everyone --yes`, `--everyone --help`, … → usage, exit 0; compiled script the same |
| 2 | Invalid input next to `--help` is still exit 2, with the usage | no | confirmed | `--help --bogus`, `--help --user`, `--help=1`, positional, ambiguous → 2; usage after the error |
| 3 | "Nothing to revoke" counts only the halves asked for, and never skips a needed revoke | no | confirmed | seven combinations of sessions/tokens per target, each revoking exactly what was asked |
| 4 | Nothing found before the question → no event | no | confirmed | event delta +0 for the four "Nothing to revoke" cases, +1 for each real one |
| 5 | Two runs at once: the loser says so; counts right | no | confirmed | 4 processes × 3 rounds, 50 sessions and 30 tokens: one did all, the rest "Nothing to revoke" or "another run revoked it first"; the loser writes a zero event (allowed by the spec) |
| 6 | Malformed `--user` → 2; unknown → 1; neither changes anything | no | confirmed | edge inputs (empty, spaces, 5000 characters, SQL-like) → 2; `nobody@…`, `ädä@exämple.com` → 1; state and events unchanged |
| 7 | The test drives `requireToken` (401) and `requireUser` (redirect) | no | confirmed | `instance-access.db.test.ts:157-181` |
| 8 | That test fails if revoke does nothing or the guard answers another status | no | confirmed | mutations in a scratch copy: tokens half 0, sessions half 0, `errorResponse(403…)` → each fails |
| 9 | db tests pass on four databases | no | confirmed | SQLite 31 passed; postgres, mysql, mariadb 9 passed each |
| 10 | One transaction with the audit; no secrets | no | confirmed | `recordAudit` throwing → nothing changed on all four; metadata counts only |
| 11 | The question; no changes nothing | no | confirmed | pty: `n` → "Cancelled. Nothing was revoked."; `y` → done |
| 12 | HELP shows `[--yes]`; wiring | no | confirmed | `packages/server/src/cli.ts:8,83`; marketplace 117/117; `tsdown.config.ts:18`; `docker/pnpm:13`; `package.json:27` |
| 13 | Typecheck and lint clean | no | confirmed | `tsc --noEmit`; `biome check` on changed paths |

**Overall:** met. After both passes, "Everyone, you included, signs in again" prints only when sessions actually ended (`setup/revoke-access.ts`), as both passes suggested; the zero-count event of a run that loses a race is kept: it records what that run did.

## Task 3 — `rotate-secret`

Witnessed: 2026-10-11 22:59 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Replaces only the `AUTH_SECRET` line; comments, blank lines and other keys kept | no | partly | probe: comments, keys, `export` lines kept; a CRLF file's replaced line loses its `\r`; a multi-line value leaves a stray line |
| 2 | The secret the server reads afterwards is a new one | no | not met | a second `AUTH_SECRET=` line appended after setup → `rotate-secret --yes` exits 0, but `parseEnv` (last wins) still gives the duplicate's value |
| 3 | A file without a trailing newline is kept as it was apart from the one line | no | not met | `"# c\nAUTH_SECRET=old\nX=1"` → a newline added; the test asserts it |
| 4 | Atomic, with setup's writer, mode 0600 | no | confirmed | `writeEnvFile`; `stat` → 600; no `.tmp-*` left |
| 5 | 32 random bytes, base64 | no | confirmed | `generateAuthSecret`; 44 characters |
| 6 | Deletes every session | no | confirmed | db test and script test; 16/16 on four databases |
| 7 | Unwritable file → sessions and audit unchanged | no | confirmed | `writeSecret` inside the transaction; test on four databases |
| 8 | `instance.secret_rotated`, actor null, no secret | no | confirmed | metadata keys exactly `sessionsEnded`, `via`; script test scans the events |
| 9 | Refuses when `AUTH_SECRET` comes from the environment | no | confirmed | exit 1, file byte-identical, session kept, value not echoed |
| 10 | Refuses before setup | no | confirmed | exit 1, "isn't set up yet" |
| 11 | No secret printed | no | confirmed | script test scans stdout and stderr |
| 12 | Restart command per runtime | no | confirmed | `runtime.test.ts`; `control.ts:254,293` set `RONNE_SERVICE`; `Dockerfile:50` |
| 13 | After a restart with a new secret an old cookie is refused | no | confirmed | test; probe: same secret → user, new secret → null |
| 14 | Asks unless `--yes`; exit codes | no | confirmed | `cli.test.ts`; script test; `--help` → 0 |
| 15 | Wired like task 2 | no | confirmed | `package.json` ×2, `tsdown.config.ts`, `docker/pnpm`, `cli.ts`, `args.ts`, `control.ts`; marketplace 109 passed |
| 16 | Works inside the Docker container | no | can't check here | no image built; routing read in `docker/pnpm`, `Dockerfile:59-61` |
| 17 | The threat-model rows for revoke-access and rotate-secret | no | confirmed | `instance-access.ts:50,100`; `setup/rotate-secret.ts`; `session.ts:26`; no `cookieCache` |
| 18 | Lint and types | no | confirmed | biome on changed paths; `tsc --noEmit` |

**Overall:** not met: a duplicate `AUTH_SECRET` line keeps the old secret while the command reports success (2); a newline is added to a file without one (3). Docker not run.

Witnessed: 2026-10-11 23:01 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The run leaves a new AUTH_SECRET in effect | no | not met | two `AUTH_SECRET=` lines → exit 0, old secret still read; inside a multi-line quoted value the inner line was rewritten instead |
| 2 | Only the AUTH_SECRET line replaced; quotes and `#` kept | no | confirmed | probe and CLI `diff`: only that line, plus a final newline; an inline comment on it dropped; CRLF gets an LF line |
| 3 | `export`, quoted values, no final newline, CRLF, a commented `# AUTH_SECRET=` | no | confirmed | each → the new value; the comment kept |
| 4 | Atomic, 0600 | no | confirmed | a 0644 file → 600 |
| 5 | A folder it can't write, a file it can | no | confirmed | folder 555, file 0600 → exit 0, secret changed, no temporary file |
| 6 | Windows' in-place path | no | can't check here | `writeEnvFile(…, "win32")` on macOS: same inode; no Windows |
| 7 | Every session deleted, counts-only event | no | confirmed | CLI 1 → 0 sessions; 16/16 on four databases |
| 8 | Unwritable → nothing changes | no | confirmed | folder 555, file 400 → exit 1, session kept, no event; throwing write rolled back on four databases |
| 9 | Secret, sessions and event change together | no | partly | `writeSecret()` runs before the commit: if the commit fails after the rename, the secret changed with no event and the sessions kept, ending in a stack trace |
| 10 | Refuses with `AUTH_SECRET` from the environment | no | confirmed | test; an empty variable counts as unset, as `loadConfig` |
| 11 | Refuses before setup | no | confirmed | exit 1; `DATABASE_URL` only in the environment works, as `loadConfig` |
| 12 | Never prints a secret or the settings path | no | partly | no secret anywhere; but an `EACCES` write error is rethrown raw, printing the path twice |
| 13 | Never waits without a terminal; `--help`; exit codes | no | confirmed | `</dev/null` → 2; `--bogus` → 2; `--help` → 0; pty No → 1, file unchanged |
| 14 | An old cookie refused after a restart, even with its row | no | confirmed | probe on four databases: same secret accepts, new secret → null |
| 15 | Restart command per runtime | no | confirmed | `restartHint`, `runtime.test.ts`; the service hint lacks `sudo` |
| 16 | Wired like revoke-access | no | confirmed | `git grep -l revoke-access` files all name rotate-secret; marketplace 109 passed |
| 17 | Setup's KEEP_IF_SET unchanged | no | confirmed | `mergeEnv("AUTH_SECRET=old\n", {AUTH_SECRET:"NEW"})` → old; `env-file.test.ts` passes |

**Overall:** not met: a duplicate line keeps the old secret (1); a failed write prints the settings path (12); a commit failure after the write leaves an unaudited rotation (9).

### Re-check

Witnessed: 2026-10-11 23:06 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Two `AUTH_SECRET` lines: the server reads the new secret, one line left | no | confirmed | scratch instance + duplicate line; `loadConfig` before → duplicate, after the real script → new; `grep -c` → 1 |
| 2 | No final newline kept, CRLF kept, only that line, 0600 | no | confirmed | CRLF file without final newline, 0644 → ends `\r\nOTHER=keep`, no LF-only breaks, only AUTH_SECRET lines differ, 600 |
| 3 | AUTH_SECRET inside a multi-line value: refused, nothing changed | no | partly | refused when the value comes first; when it comes after the real line: exit 0, and `M` silently loses its `AUTH_SECRET=inside` line |
| 4 | Unwritable: exit 1, the code without the path, nothing changed | no | confirmed | 0400 file in a 0555 folder → "(EACCES). Nothing was changed"; no path; `cmp` unchanged |
| 5 | Commit failing after the write: a clear message | no | confirmed | `rotate-secret.test.ts` mock; exact message asserted |
| 6 | Service restart hint with sudo / as an administrator | no | confirmed | `runtime.test.ts`; real script with `RONNE_RUNTIME=npm RONNE_SERVICE=1` → "sudo rmk-server service restart" |
| 7 | The SPEC's edge cases match | no | partly | the multi-line case (row 3); "cached per process" is wrong with `RONNE_ENV_FILE` (Docker, rmk-server): `loadConfig` rereads the file and `getAppAuth` re-keys on the secret |
| 8 | Sessions, event, output, old cookie, tokens | no | confirmed | 6 files, 68 passed; postgres, mysql, mariadb 12/12 each |
| 9 | Refusals | no | confirmed | `rotate-secret.db.test.ts` |
| 10 | Wiring, typecheck | no | confirmed | diffs; marketplace `cli.test.ts` 6 passed; `pnpm typecheck --force` 7/7 |

**Overall:** not met: a multi-line value after the real line is changed silently (3); the spec's "cached per process" is wrong for Docker and rmk-server (7). Also: the commit-failure message mixes container and host commands under Docker.

Witnessed: 2026-10-11 23:09 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Duplicates (plain, `export`, spaces, `KEY = v`, CRLF, no final newline) can't keep the old secret | no | confirmed | `probe.ts` read back with `parseEnv` and `@next/env`'s `loadEnvConfig`: all new |
| 2 | `AUTH_SECRET=` partway through a line left alone | no | confirmed | `LINE` anchored (`env-file.ts:19`) |
| 3 | A file where the old secret stays makes it refuse | no | partly | multi-line before → refused; `AUTH_SECRET: legacy-old` (dotenv-only syntax) or `apps/web/.env.local` → exit 0 with the old secret still read by Next.js in a clone |
| 4 | Every other line kept | no | not met | `CERT="…\nAUTH_SECRET=part-of-the-cert\n…"` after the real line → exit 0, CERT loses a line; also single quotes, backticks, and setup's `DATABASE_URL` merge |
| 5 | Setup's merge didn't regress | no | confirmed | `p3.ts`: KEEP_IF_SET, duplicates, appending, CRLF; mutants each fail a test |
| 6 | Setup and rotate tests on SQLite | no | confirmed | 94 + 57 passed |
| 7 | db tests on PostgreSQL, MySQL, MariaDB | no | confirmed | 4 files, 33 passed each |
| 8 | A write error shows the code only, nothing changes | no | partly | EACCES confirmed; EPERM on the rename (`chflags uchg`) → right message, but `.env.tmp-<pid>` with the new secret left behind; in-place fallback could leave a partial file on ENOSPC (inferred) |
| 9 | An unreachable database leaks nothing | no | confirmed | `127.0.0.1:1` with a password → raw stack, no password, secret or path; file unchanged |
| 10 | Commit failure message and file | no | confirmed | `rotate-secret.test.ts` |
| 11 | That message can be followed as written | no | partly | Docker: `pnpm run revoke-access` (in-container) beside `docker compose restart web` (host) |
| 12 | `restartHint` per runtime | no | confirmed | `runtime.ts:52-63`; test passes |
| 13 | Two runs at once leave a valid file | no | confirmed | both exit 0; one line, 600, no temporary file |

**Overall:** not met: multi-line values corrupted (4); in a clone, `.env.local` or `AUTH_SECRET:` keeps the old secret (3); a failed rename leaves the new secret in a temporary file (8); the Docker hint mixes vantage points (11).

### Re-check

Witnessed: 2026-10-11 23:16 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | AUTH_SECRET inside another key's multi-line value, before or after, any quotes: refused, byte-identical | no | confirmed | real script, 27 variants (3 quote styles × 3 line forms × before/after/CRLF) → exit 1 "can't replace safely", shasum identical, no `.tmp-` |
| 2 | In a clone, AUTH_SECRET in `.env.local` etc., or a colon line: refused | no | partly | 15 file variants refused; colon refused in every runtime; but the app folder's `.env` isn't checked when `RONNE_ENV_FILE` points elsewhere |
| 3 | A failed rename removes the temporary file | no | confirmed | `env-file.ts:144-148`; mutation without `rmSync` fails `env-file.test.ts:179` |
| 4 | Commit-failure message: host-side commands, restart only for a clone | no | confirmed | `rotate-secret.test.ts:60-74` |
| 5 | Output: next request for Docker and rmk-server, restart for a clone; and true | no | confirmed | real runs; `config.ts:30-40` rereads; `auth-instance.ts:31` keys on the secret; `.dockerignore` excludes `**/.env*` |
| 6 | Setup's merge works for normal files and refuses rather than corrupt | no | partly | normal files fine, multi-line file unchanged, but the refusal is an uncaught `EnvMergeError` stack trace |
| 7 | SPEC and threat model match | no | partly | they match; but `--help` still says to restart in every runtime; `threat-model.md:130` cites a stale line |
| 8 | Tests cover the rewrite, refusals, sessions, the secret scan | no | confirmed | `rotate-secret.db.test.ts:85-124,135,149,174,188`; `rotate-secret.test.ts:76-97` |
| 9 | An old cookie refused after a restart | no | confirmed | `instance-access.db.test.ts` |
| 10 | One transaction with the file write, four databases | no | confirmed | 12 passed on each |
| 11 | Suites and typecheck | no | confirmed | 100 + 24 passed; typecheck 7/7 |

**Overall:** not met: the app's own `.env` (2); setup's raw crash (6); `--help` and a stale reference (7).

Witnessed: 2026-10-11 23:20 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS (Darwin 27.0.0, arm64), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `mergeEnv` reads back and throws unless every key reads as intended | no | confirmed | `env-file.ts:101-105`; 42 shapes in `probe.mts`; every multi-line case threw |
| 2 | Docker and rmk-server: never exit 0 without the new secret or with another key changed | no | confirmed | 42 shapes compared with `parseEnv` (CRLF, `export`, `#`, duplicates, BOM, NUL, U+2028, unterminated quotes) |
| 3 | A clone: exit 0 means Next.js reads the new secret | no | not met | a lone `\r` before an `AUTH_SECRET=` line, and an app-folder `.env` with `RONNE_ENV_FILE` elsewhere → exit 0, old secret for `@next/env` |
| 4 | Another key unchanged for Next.js's reader | no | partly | `\"` and `\'` inside quotes pass the `parseEnv` read-back but read differently in `@next/env` |
| 5 | Clone checks of `.env.local` etc.; not for Docker or npm | no | confirmed | all 5 files and their forms refused |
| 6 | Colon line refused anywhere | no | confirmed | four colon forms refused |
| 7 | `writeEnvFile` removes the temporary file on every failure | no | partly | rename failure confirmed; a failing first write (`ulimit -f 4` → EFBIG) leaves `.env.tmp-<pid>` with the new secret |
| 8 | Commit-failure message | no | partly | Docker and service right; Windows reads `rmk-server revoke-access (as an administrator) --everyone …` |
| 9 | Success output per runtime | no | confirmed | clone and Docker runs |
| 10 | Docker and rmk-server use the new secret from the next request | no | confirmed | `config.ts:35-38`; `lc.mts`; `auth-instance.ts:31`; no other reader |
| 11 | Setup not regressed | no | partly | 128 passed; CRLF and `export` reruns fine; `EnvMergeError` uncaught in the CLI and `install.ts:173` |
| 12 | DB tests on the servers | no | confirmed | 19 passed on each |
| 13 | Lint and typecheck | no | confirmed | biome, `tsc --noEmit` |

**Overall:** not met: clone gaps (3), the temporary file on a failed first write (7), setup's uncaught error (11), the Windows wording (8).

### Re-check

Witnessed: 2026-10-11 23:21 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Clone with the settings elsewhere: the app's `.env` AUTH_SECRET refused | no | confirmed | probe with 4 line forms → refused, both files byte-identical; npm doesn't refuse |
| 2 | A lone carriage return refused | no | confirmed | 4 placements → refused; pure CRLF accepted |
| 3 | Temporary file removed on every failure; removal never hides the error | no | confirmed | mocked `node:fs`: ENOSPC first write, EPERM chmod, EXDEV rename, with `rmSync` also throwing → original error, no temporary file |
| 4 | Setup: ✗ message / `settings_unwritable`, file unchanged | no | confirmed | CLI → "✗ … can't be updated safely around CERT", exit 1, `cmp` unchanged; `installSettingsWith` probe → `settings_unwritable` |
| 5 | Windows follow-up wording | no | confirmed | mocked win32 → "… `rmk-server revoke-access --everyone --sessions-only` as an administrator." |
| 6 | `--help`, header, threat-model reference | no | confirmed | `--help` output; `scripts/rotate-secret.ts:1-3`; no `env-file.ts:N` |
| 7 | SPEC edge cases match | no | partly | the Windows wording and the temporary-file removal on a failed first write or chmod aren't in the SPEC; the prompt's wording differs |
| 8 | Rewrite keeps the ending, comments, 0600 | no | confirmed | `rotate-secret.db.test.ts:88` |
| 9 | Refusals tested, nothing changed | no | confirmed | both test files pass |
| 10 | Sessions deleted in the same run | no | confirmed | 26/26 on each server |
| 11 | No secret in output or event | no | confirmed | `rotate-secret.db.test.ts:113-125`; `instance-access.db.test.ts:257` |
| 12 | Old cookie refused after a restart | no | confirmed | `instance-access.db.test.ts:275`, four databases |
| 13 | Suites | no | confirmed | 121 + 25 passed; servers 26/26 |
| 14 | Typecheck | no | confirmed | `pnpm typecheck --force` 7/7 |

**Overall:** not met: the SPEC's wording (7). Also: the "also set in .env, which Next.js reads over .env" message reads oddly.

Witnessed: 2026-10-11 23:34 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1 (arm64), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Docker and rmk-server: exit 0 means the new secret and nothing else changed | no | confirmed | 49k fuzzed files: none passed the checks without the new secret under `parseEnv` |
| 2 | A lone carriage return refused | no | confirmed | real `runRotateSecret` |
| 3 | The app's `.env` checked in a clone | no | confirmed | `app3.mts` |
| 4 | A clone: no exit 0 with the old secret, beyond the stated limit | no | not met | `AUTH_SECRET\n=old`, `export AUTH_SECRET\n=old`, and U+2028/U+2029 before an `AUTH_SECRET=` line → exit 0, `@next/env` reads the old secret |
| 5 | A clone: no other value changes | no | not met | `NOTE:\nAUTH_SECRET=old` and `X=\n"\nAUTH_SECRET=old\n"` → exit 0, Next.js's values change |
| 6 | Temporary file removed on a failed first write | no | confirmed | `ulimit -f 1` → EFBIG, no temporary file |
| 7 | No failure path leaves a file with the new secret while saying nothing changed | no | not met | folder 555, file 600, `ulimit -f 2000`, 1.1 MB file → "Nothing was changed", but the in-place rewrite cut the file to 1,024,000 bytes with a new secret |
| 8 | Removal never throws | no | confirmed | `env-file.ts:126-131` |
| 9 | CLI setup: ✗ message | no | confirmed | `setup.db.test.ts` |
| 10 | Web setup: `settings_unwritable` | no | confirmed | `web.mts`; no repository test |
| 11 | Windows wording | no | confirmed | `rotate-secret.ts:33` |
| 12 | `--help` and header | no | confirmed | `cli.ts:189-194` |
| 13 | Setup suites | no | confirmed | 121 + 25 passed |
| 14 | Servers | no | confirmed | 19 passed each |
| 15 | Lint and typecheck | no | confirmed | biome; `tsc --noEmit` |

**Overall:** not met: parser differences in a clone (4, 5); a partial in-place write reported as "Nothing was changed" (7).

### Re-check

Witnessed: 2026-10-11 23:58 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the AUTH_SECRET line, comments, ending, 0600 | no | confirmed | `rotate-secret.db.test.ts`; own run: `diff` only line 2, 600 |
| 2 | CRLF kept; duplicates removed | no | confirmed | `env-file.test.ts`, `rotate-secret.db.test.ts` |
| 3 | Non-plain lines refused, naming the line | no | confirmed | `firstUnplainLine` probe of 10 shapes; CLI with U+2029 → "Line 5 … isn't a plain KEY=value line", `cmp` unchanged |
| 4 | Files setup writes are plain | no | partly | `#`, quotes, spaces → rotate exit 0; but a U+2028 in DATABASE_URL is written by setup and refused by rotate-secret |
| 5 | A plain file reads the same in both readers | no | not met | `A='x\'` passes the rule, dotenv reads `\'` as an escape and swallows later lines; `X=a\v` read differently |
| 6 | In place in a folder it can't write, mode 0600 | no | confirmed | Postgres probe instance, folder 555 → exit 0, 600, no temporary file |
| 7 | An open failure: plain error, nothing changed | no | confirmed | `env-file.ts:153-156`; tests |
| 8 | A failure after opening: "may be incomplete" | no | confirmed | `ulimit -f 1` → the message, file truncated, no event; no rotate-level test |
| 9 | Temporary file removed on every failure | no | confirmed | `env-file.ts:186-200`; tests |
| 10 | Refusals print no secret and change nothing | no | confirmed | `rotate-secret.db.test.ts` |
| 11 | Sessions, event, tokens, secret scan, old cookie | no | confirmed | 61 passed on each server |
| 12 | SPEC wording matches | no | partly | two quoted refusals differ from the code |
| 13 | Clone checks with the new message | no | partly | a settings file that is `.env.local` is refused as its own override |
| 14 | Suites and typecheck | no | confirmed | 129 + 25 + 40 passed; typecheck 7/7 |

**Overall:** not met: rows 4, 5, 12, 13.

Witnessed: 2026-10-11 23:46 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A plain file reads the same in `parseEnv` and `@next/env` | no | not met | fuzz: `\'` and `` \` `` escapes, `$` expansion, `export\t`, trailing `\f`/`\v`/NBSP, `KEY= ` before a line |
| 2 | After exit 0 both readers have the new AUTH_SECRET | no | confirmed | 10,533 fuzzed rotations, 0 stale; end-to-end run |
| 3 | After exit 0 no other value changes for either reader | no | partly | Node guaranteed by the read-back; Next.js: `X=${AUTH_SECRET}` and 19 of 10,533 fuzzed rotations |
| 4 | Setup's files pass the plain rule | no | confirmed | 50,000 runs: only U+2028/2029 values refused |
| 5 | An open failure: plain error, nothing changed | no | confirmed | folder 555, file 400 → EACCES, sha1 unchanged, sessions and events unchanged |
| 6 | A failure after opening: "may be incomplete" | no | partly | a real full disk → the message; but a failing `closeSync` in `finally` replaces the error with a plain one |
| 7 | In place in a folder it can't write: 0600, ended, audited | no | confirmed | folder 555, file 600 → exit 0 |
| 8 | No secret in output or event | no | confirmed | every run |
| 9 | Regressions on SQLite | no | confirmed | 147 passed |
| 10 | The servers | no | confirmed | 68 passed each |

**Overall:** not met: the plain rule over-claims (1, 3); a close failure (6). Also: mixed LF/CRLF files were rewritten all CRLF.

### Re-check

Witnessed: 2026-10-11 23:52 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the AUTH_SECRET line changes; comments, missing final newline, mixed endings kept | no | confirmed | real script; `diff` of `od -c` → only the secret's bytes |
| 2 | 0600, no temporary file | no | confirmed | `ls -l`; in place with folder 0555 → `-rw-------` |
| 3 | Sessions deleted, event without secret | no | confirmed | 2 sessions → 0; `{"via":"cli","sessionsEnded":2}` |
| 4 | No secret in output or event | no | confirmed | `grep -cF` → 0 |
| 5 | Refusals change nothing; wording matches SPEC | no | confirmed | script tests; messages word for word |
| 6 | Asks unless `--yes` | no | confirmed | pty: Enter → "Cancelled. The secret wasn't changed." |
| 7 | Duplicates | no | confirmed | test |
| 8 | Non-plain refused, line named | no | confirmed | real script; unit tests |
| 9 | A plain file splits the same in both readers | no | partly | 58,162 fuzzed files (no `$`) → 0 differences, except `export KEY=` with an empty value: `{"export KEY":""}` in Node 22.23+/24/25, `KEY` in Next.js |
| 10 | Only `$` expansion differs in a clone | no | partly | the `export KEY=` case (row 9) |
| 11 | Read-back before writing | no | confirmed | `export AUTH_SECRET=` → refused, `cmp` unchanged |
| 12 | Open failure: nothing changed, no path | no | confirmed | folder 0555, file 0444 |
| 13 | Failure after opening, close included: may be incomplete | no | confirmed | `env-file-in-place.test.ts`; `rotate-secret.test.ts` |
| 14 | Clone files; the settings file excluded | no | confirmed | real script; unit tests |
| 15 | How the server picks up the secret; follow-ups | no | confirmed | npm run; tests |
| 16 | One transaction, three servers | no | confirmed | 12/12 each |
| 17 | Old cookie refused | no | confirmed | `instance-access.db.test.ts` |
| 18 | Tests and typecheck | no | confirmed | 155 passed; typecheck 7/7 |

**Overall:** not met: `export KEY=` with an empty value (9, 10).

Witnessed: 2026-10-11 23:57 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0 (fuzz also on v24.21.0 and v22.23.2).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both readers split a plain file the same way | no | not met | 1.9M fuzzed files: 239 differences, all `export FOO=` with an empty value; 0 otherwise on three Node versions |
| 2 | After exit 0: the new secret in both, nothing else changed (but `$`) | no | confirmed | 123,224 fuzzed rotations, 0 failures; end-to-end on npm and Docker runtimes |
| 3 | Setup writes plain files | no | not met | values ending in a backslash (`'C:\data\'`) are refused by the plain rule; end to end with `STORAGE_PATH=…\` |
| 4 | `formatEnvValue` refuses U+2028/2029 | no | confirmed | `env-file.ts:39`; fuzz |
| 5 | Open failure: nothing changed | no | confirmed | folder 0555, file 0400 |
| 6 | In place, writable file: 0600, ended, audited | no | confirmed | folder 0555, file 0600 |
| 7 | Failure once open → `InPlaceWriteError` | no | confirmed | `ulimit -f 1` → EFBIG; tests |
| 8 | Every in-place failure reported correctly | no | partly | `/dev/null`: written in full, then `fchmod` EPERM → "may be incomplete" though the new secret is in place |
| 9 | Clone check excludes the settings file | no | confirmed | `clone.mts` |
| 10 | No secret in output or event | no | confirmed | `grep -c` → 0 |
| 11 | No regressions | no | confirmed | 149 + 917 passed; servers 68 each |

**Overall:** not met: `export FOO=` (1), setup's trailing-backslash values (3), a complete write reported as incomplete (8).

### Re-check

Witnessed: 2026-10-12 00:04 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0 (fuzz also on v22.23.2 and v24.21.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `--yes` writes a new 32-byte secret, only that line changes; comments, endings, missing newline, 0600 kept; duplicate removed | no | confirmed | real script on a scratch instance; `diff`; 44-character secret; 600 |
| 2 | Tests cover the rewrite | no | confirmed | 74 passed; mutations (duplicates kept, 0600 removed, `export A=` accepted) each fail a test |
| 3 | Sessions deleted in the transaction; file written last inside it | no | confirmed | `instance-access.ts:99-111`; 26 passed on each server, 25 on SQLite |
| 4 | Audited, no secret anywhere | no | confirmed | `{"via":"cli","sessionsEnded":3}`; `grep -c` → 0 |
| 5 | Old cookie refused after a restart | no | confirmed | `instance-access.db.test.ts:275-281`, four databases |
| 6 | Refusals from the environment and before setup | no | confirmed | real script; `cmp` unchanged |
| 7 | Asks first; needs `--yes` without a terminal | no | confirmed | pty; exit 2 |
| 8 | Docker and rmk-server next request; a clone restarts | no | confirmed | `config.ts:30-48`; `auth-instance.ts:31`; real runs |
| 9 | Plain rule, `export KEY=` refused | no | confirmed | real script on 7 non-plain shapes → refused; 3 plain shapes rotated |
| 10 | Both readers split a plain file the same; read-back | no | confirmed | fuzz on three Node versions: 0 mismatches, 0 bad merges |
| 11 | Setup writes plain files but for a trailing backslash | no | confirmed | 20,000 values per Node version: every non-plain one ends in `\` |
| 12 | Only `$NAME` expansion differs in a clone | no | confirmed | `X=${AUTH_SECRET}` rotates; no other difference |
| 13 | Setup's read-back and U+2028 refusal | no | confirmed | setup → "✗ … can't be updated safely around M", unchanged |
| 14 | Clone files refused, naming the file | no | confirmed | real script; repository `.env` md5 unchanged |
| 15 | Unwritable: the code, no path, nothing changed | no | confirmed | folder 555, file 400 |
| 16 | In place, 0600 | no | confirmed | folder 555, file 644 → 600 |
| 17 | In-place outcomes | no | confirmed | `env-file.ts:159-177`; tests |
| 18 | Commit failure follow-ups | no | confirmed | `rotate-secret.test.ts:76-90` |
| 19 | Typecheck and lint | no | confirmed | 7/7; 43 warnings, no errors |

**Overall:** met.

Witnessed: 2026-10-12 00:08 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0 (probes also on v22.23.2 and v24.21.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both readers split every plain file the same | no | confirmed | 700k+ fuzzed plain files on three Node versions → 0 differences; 40 hand-picked cases |
| 2 | `export KEY=` refused | no | confirmed | `targ.cjs`; `env-file.test.ts:279-281` |
| 3 | After exit 0, the new secret in both and nothing else changed (but `$`) | no | partly | holds for a file that doesn't change during the run; an edit appended while the question waits is merged without the plain check (`rotate-secret.ts:88` reads, `:95` asks, `:108` reads again) |
| 4 | Setup's values plain but a trailing backslash | no | confirmed | 500k values: all 16,241 refusals end in `\` |
| 5 | Open failure: nothing changed | no | confirmed | folder 555, file 400; shasum unchanged |
| 6 | Failure once open: may be incomplete | no | confirmed | real full disk image → ENOSPC, file 0 bytes, sessions and events unchanged |
| 7 | Temporary-file write fails in a writable folder | no | confirmed | full image, folder 755 → nothing changed, no temporary file; the advice about the owner doesn't fit ENOSPC |
| 8 | `complete` → "written" | no | partly | a failed `close` sets `complete`, but close(2) can report an unfinished write (NFS, quotas) |
| 9 | No regressions | no | confirmed | 127 + 65 passed; 68 per server |
| 10 | SPEC states the exception and the remaining difference | no | confirmed | `SPEC.md:178-191,202-207` |

**Overall:** not met: an edit during the question (3); a failed close counted as complete (8).

### Re-check

Witnessed: 2026-10-12 00:12 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | New 32-byte secret, only that line changes | no | confirmed | real script; `diff`; `base64 -d` → 32 bytes |
| 2 | Comments, each line's ending, missing final newline kept | no | confirmed | `cat -v` diff; `tail -c 8 \| od -c` |
| 3 | 0600 through both paths, no temporary file | no | confirmed | 0644 → `-rw-------`; folder 0555 in place → 600 |
| 4 | Duplicate removed | no | confirmed | real run; test |
| 5 | Environment refusal | no | confirmed | exit 1, the SPEC's message, `cmp` same |
| 6 | Before setup | no | confirmed | exit 1, the message |
| 7 | Non-plain refused, line named | no | confirmed | `AUTH_SECRET: legacy`, `'C:\data\'` → refused, `cmp` same |
| 8 | Read once after the question; that text checked and merged | no | confirmed | `rotate-secret.ts:110`; mutation without `plain()` fails a test |
| 9 | Asks first; declining changes nothing | no | confirmed | pty |
| 10 | Clone override files | no | confirmed | real script; three unit tests |
| 11 | Sessions ended in the transaction, audited | no | confirmed | 2 → 0; `{"via":"cli","sessionsEnded":2}` |
| 12 | No secret in output or event | no | confirmed | `grep -cF`, SQL `like` → 0 |
| 13 | Unwritable: code, no path, nothing changed | no | confirmed | folder 0555, file 0400 |
| 14 | Advice depends on the code | no | partly | right when run (ENAMETOOLONG → "fix the cause", EACCES → owner), but no test asserts either text |
| 15 | In-place `complete` only for a failed chmod | no | confirmed | `env-file.ts:162-181`; mutation of `complete = false` fails a test |
| 16 | Complete → like a failed commit; incomplete → check the file | no | confirmed | tests |
| 17 | Commit-failure follow-ups | no | confirmed | unit test |
| 18 | Next request vs restart; tokens unaffected | no | confirmed | real npm run; tests |
| 19 | Old cookie refused | no | confirmed | 26/26 on each server |
| 20 | `pnpm run` and `rmk-server` | no | confirmed | `package.json`; `cli.ts`; `control.ts`; 6 passed |
| 21 | Tests, typecheck, lint | no | confirmed | 133 + 25 passed; `tsc` 0; biome 0 |

**Overall:** not met: no test of the advice (14). Also: a test title still says "closed or chmodded".

Witnessed: 2026-10-12 00:16 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The text checked after the question is the text merged; a plain edit kept | no | confirmed | probe; but merging the earlier text would pass every test |
| 2 | No edit escapes but the read-to-rename window | no | partly | `DATABASE_URL` read before the question: switched meanwhile, sessions and event go to the old database |
| 3 | A clone override file blocks the run | no | partly | checked only before the question: `.env.local` written meanwhile → exit 0 |
| 4 | Non-plain refused before the question | no | confirmed | lone CR, U+2028, `'C:\data\'` → refused, nothing changed |
| 5 | Open failure: owner advice | no | confirmed | folder 555, file 400 |
| 6 | Failure once open: may be incomplete | no | confirmed | full disk image → ENOSPC, file 0 bytes |
| 7 | Temporary write fails: "fix the cause" | no | confirmed | full image, folder 755 |
| 8 | Complete chmod failure → secret in place | no | confirmed | `fchmodSync` EPERM → the message; file has the new secret |
| 9 | Failed close → possibly incomplete | no | confirmed | EIO on close; mutations fail tests |
| 10 | Advice depends on the code | no | confirmed | EACCES and ENOSPC; no test covers it |
| 11 | Both readers agree on plain files | no | confirmed | 5,629 plain fuzzed files → 0 differences |
| 12 | After exit 0: new secret, nothing else, 0600 | no | confirmed | in-place run |
| 13 | Refusals change nothing | no | confirmed | five refusal kinds |
| 14 | No secret in output or event | no | confirmed | event rows; `LIKE` → 0 |
| 15 | Refused with the code, never the path | no | partly | an unreadable settings file (mode 000) → uncaught stack trace with its path |
| 16 | Suites on four databases | no | confirmed | 135 SQLite; 61 per server |

**Overall:** not met: `DATABASE_URL` and the clone files read before the question (2, 3); an unreadable file's path (15); test gaps.

### Re-check

Witnessed: 2026-10-12 00:22 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | New 32-byte secret, only that line; comments, endings, missing newline, 0600 | no | confirmed | real script; `diff`; `tail -c`; `stat` 600 |
| 2 | Tests cover the rewrite | no | confirmed | `rotate-secret.db.test.ts:88-127`; `env-file.test.ts:94-102` |
| 3 | Duplicates removed | no | confirmed | real run; test `:129` |
| 4 | Asks first; no changes nothing; exit 2 without a terminal | no | confirmed | pty `n` → cancelled, `cmp` same; `y` → done |
| 5 | Environment refusal | no | confirmed | exit 1; `cmp` unchanged |
| 6 | Before setup: "isn't set up yet" | no | partly | a file without AUTH_SECRET → right; no settings file at all → "couldn't be read (ENOENT) … run it as the account that owns" |
| 7 | Unreadable: code, no path | no | confirmed | chmod 000 → "(EACCES)"; unit test |
| 8 | Plain rule | no | confirmed | five real refusals; mutation → 8 of 21 tests fail |
| 9 | Clone override files | no | confirmed | real clone run; repository `.env` md5 unchanged |
| 10 | Checks again after the question; only that read used | no | confirmed | pty edit kept; mutations fail tests |
| 11 | Sessions ended in the transaction, audited, tokens unaffected | no | confirmed | 2 → 0; event row; test |
| 12 | No secret in output or event | no | confirmed | `grep -cF` → 0 |
| 13 | Write failure: code, nothing changed, advice by code | no | confirmed | EACCES real run; `it.each` EACCES/EROFS/ENOSPC |
| 14 | In place, 0600; partial and chmod-only messages | no | confirmed | folder 555, file 644; unit tests |
| 15 | Commit-failure follow-ups | no | confirmed | `rotate-secret.ts:164-167`; test |
| 16 | Next request vs restart | no | confirmed | real npm run; tests |
| 17 | Old cookie refused | no | confirmed | test |
| 18 | Three servers | no | confirmed | 19/19 each |
| 19 | Wiring, typecheck, lint | no | confirmed | diff; 7/7; biome clean; 148 passed |

**Overall:** not met: a missing settings file (6).

Witnessed: 2026-10-12 00:23 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Nothing read before the question used after it | no | confirmed | pty: `DATABASE_URL` a → b meanwhile → b's sessions ended and audited, a untouched; edit kept |
| 2 | A clone override written meanwhile blocks the run | no | confirmed | `.env.local`, ` export AUTH_SECRET : v` in `.env.production` → refused |
| 3 | Plain rule and set-up checked again | no | confirmed | multi-line appended → refused; AUTH_SECRET removed → "isn't set up yet" |
| 4 | Unreadable files: code, no path | no | confirmed | 000 settings, 000 `.env.local`, deleted file; `grep` → 0 |
| 5 | Before setup: "isn't set up yet" | no | partly | no settings file at all → "(ENOENT) … run it as the account that owns" |
| 6 | No secret or settings path printed | no | confirmed | every path tried; database failures print stacks without passwords |
| 7 | The new tests catch the regressions named | no | partly | most mutations fail tests; survive: the set-up check only once, no first check, `env.DATABASE_URL` ignored |
| 8 | Both readers agree; nothing else changes | no | confirmed | 6,000 fuzzed plain files → 0 differences |
| 9 | New secret in effect, 0600, endings kept | no | confirmed | in-place real run; 32 bytes |
| 10 | Refusals and "no" change nothing | no | confirmed | pty `n`; environment refusal |
| 11 | In-place outcomes | no | confirmed | 0400 in 555 → EACCES; tests |
| 12 | Four databases, typecheck, lint | no | confirmed | 61 per server; 148 SQLite; `tsc` 0; biome clean |

**Overall:** not met: a missing settings file (5); three checks without a test (7).

### Re-check

Witnessed: 2026-10-12 00:30 EDT, by a fresh agent (blind). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only `AUTH_SECRET` changes; comments, CRLF, mixed endings, no final newline kept | no | confirmed | real script after `setup.ts --yes`; `diff` → line 2 only; `od -c` same elsewhere; 44 characters; no `.tmp-*` |
| 2 | Mode stays 0600 | no | confirmed | `ls -l` → `-rw-------`; a 0o644 mutation fails 3 tests |
| 3 | Every session deleted | no | confirmed | 1 → 0; mutation fails 2 tests |
| 4 | `instance.secret_rotated`, actor null, no secret | no | confirmed | sqlite3 row; `.dump \| grep -cF` both secrets → 0; extra key mutation fails a test |
| 5 | Neither secret printed | no | confirmed | `grep -cF` → 0; printing the file in a mutation fails a test |
| 6 | Environment refusal | no | confirmed | real run, `cmp` unchanged; mutation fails a test |
| 7 | No settings file: not set up yet | no | confirmed | missing `RONNE_ENV_FILE` → the message, exit 1, folder not created; mutation fails a test |
| 8 | Unreadable: code, no path, advice by code | no | confirmed | `chmod 000` → EACCES with owner advice; a folder → EISDIR |
| 9 | Non-plain refused, line named | no | confirmed | `X="a\"b"` → "Line 7 …", `cmp` unchanged |
| 10 | Clone override files | no | confirmed | real run → "also set in the app folder's .env" |
| 11 | Asks first, cancels by default | no | confirmed | `script` pty: Enter → cancelled; `y` → done |
| 12 | Checks before and after the question; only the second used | no | confirmed | `rotate-secret.ts:86-127`; three mutations each fail a test |
| 13 | Duplicates | no | confirmed | test |
| 14 | A write failure rolls back sessions and event | no | confirmed | `instance-access.db.test.ts`; unit tests for EACCES, EROFS, ENOSPC, in place, chmod |
| 15 | Old cookie refused after a restart | no | confirmed | test; old-secret mutation fails it |
| 16 | Tokens unaffected | no | confirmed | `tokenWorks` true; output says so |
| 17 | Tests pass, three servers too | no | confirmed | 152 passed; 26/26 on each server |
| 18 | Typecheck | no | confirmed | `pnpm typecheck --force` 7/7; biome clean |

**Overall:** met.

Witnessed: 2026-10-12 00:30 EDT, by a fresh agent (adversarial). Commit: 728d2f48 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No settings file: not set up yet, nothing created | no | confirmed | real CLI → the message, exit 1, folder empty; also with `DATABASE_URL` from the environment and in a clone |
| 2 | A file deleted during the question: not set up, nothing changed | no | confirmed | probe on SQLite: refused, no file recreated, sessions 1, no event; a folder put in its place → EISDIR |
| 3 | Missing clone override files skipped; unreadable ones refused with the code | no | confirmed | missing, dangling link, deleted meanwhile → rotated; mode 000 → EACCES; a folder → EISDIR; no path printed |
| 4 | Read advice by code | no | confirmed | EACCES → owner; EISDIR, ENOTDIR → "fix the cause" |
| 5 | Set-up check only before the question is caught | no | confirmed | mutation → 4 tests fail |
| 6 | No check before the question is caught | no | confirmed | mutation → 1 test fails |
| 7 | `env.DATABASE_URL` ignored is caught | no | confirmed | mutation → 1 test fails; ENOENT throwing → 1 fails |
| 8 | Only what's read after the question is used | no | confirmed | `DATABASE_URL` switched meanwhile → the new database's sessions ended |
| 9 | Only AUTH_SECRET changes; in effect for both readers; 0600 | no | confirmed | `loadConfig` and `@next/env` agree; CRLF, comment, unicode quoted, no final newline kept |
| 10 | Sessions deleted, event without secret | no | confirmed | `{"via":"cli","sessionsEnded":1}`, actor null |
| 11 | Refusals change nothing | no | confirmed | environment, escaped quote (before asking), default answer in a pty |
| 12 | No secret or path printed | no | confirmed | outputs checked for both secrets and the path marker |
| 13 | In-place and write-failure outcomes | no | confirmed | 94 unit tests |
| 14 | Four databases | no | confirmed | SQLite 58 passed; 61 per server |
| 15 | Lint and typecheck | no | confirmed | biome; `tsc --noEmit` 0 |

**Overall:** met. Remarks, not failures: no test pins the read error's advice text; for EISDIR and ENOTDIR the "a full disk?" hint doesn't fit, though the message is right and nothing changes.

## Task 4 — Both commands everywhere

Witnessed: 2026-10-12 00:39 EDT, by a fresh agent (blind). Commit: 26475321 (+ uncommitted working tree). Machine: macOS 27.0.1 (arm64), Node v24.0.0, Docker 29.7.2.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `server-probe.js` runs `revoke-access --everyone --yes`; the probe's token then gets 401 | no | confirmed | packed, npm-installed `@ronneai/marketplace` → "✓ revoke-access --everyone --yes: the token now gets 401"; `server-probe.js:126-138` checks `/api/v1/me` 200 before, 401 after |
| 2 | That check catches a revoke that does nothing | no | confirmed | a fake `revoke-access` that prints the message → "✗ after revoke-access the token got 200, not 401" |
| 3 | The probe runs `rotate-secret --yes` | no | confirmed | step passed (checked by its output and `/api/health` 200 only: since strengthened to compare AUTH_SECRET before and after) |
| 4 | The image's smoke test runs both commands as documented | no | confirmed | `docker build -t ronne-web:w4 .`; `scripts-probe.sh ronne-web:w4` → setup, revoke (401), rotate all OK |
| 5 | The image job runs the probe in CI | no | confirmed | `action.yml:66-72`; executable; `image.yml:76` |
| 6 | The workflows run when these files change | no | confirmed | `ci-scope.js` on the changed paths → `image=true`, `server=true` |
| 7 | As the service account via `scriptForService` | no | confirmed | `run.ts:103-113`; `cli.ts:8-14`; `control.ts:198-199`; `control.test.ts` 17 passed |
| 8 | The three service tests run both commands; Linux and Windows check the file's owner and mode / ACL | no | confirmed | by reading `test-linux-service.sh:79-87`, `test-macos-service.sh:63-69`, `test-windows-service.ps1:123-130`; `bash -n` passes (macOS since gained the same owner and mode check) |
| 9 | From a clone | no | confirmed | `package.json:27-28`, `apps/web/package.json:17-18`; `pnpm run revoke-access` ran; `rotate-secret` refused by its guard (this clone's own `apps/web/.env`); 13 script tests passed |
| 10 | Server checks pass on Ubuntu, macOS and Windows in CI | no | can't check here | needs GitHub Actions runners; wiring at `server-checks.yml:46,83,120,153` |

**Overall:** not met: the CI runs (10) wait for a pull request. After the pass, both probes and the macOS service test also check that AUTH_SECRET changed (and the macOS file's owner and mode); both probes were run again here and pass.
