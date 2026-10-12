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
