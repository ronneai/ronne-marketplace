# #307 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — One more try for a live challenge

Witnessed: 2026-11-18 21:55 EST, by a fresh agent (blind). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0. Mutations ran in a scratch copy, never in the repository.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `verifyChallenge` calls the same endpoint (`verifyTOTP`/`verifyBackupCode`) once more only when the refusal is `INVALID_TWO_FACTOR_COOKIE` | no | confirmed | `better-auth-two-factor-store.ts:309-321`: one `verify` closure for both calls; `:318` rethrows any other refusal. Mutation "retry on any refusal" → the five pass, but the identity domain fails 1 ("five wrong codes void the challenge…": `too_many` instead of `wrong_code`) |
| 2 | The retry happens only when the signed cookie names a challenge row that is there and hasn't run out | no | confirmed | `:319-320` `if (!row \|\| expiresAt <= now) throw error`. Mutations "no expiry check" and "no row check" → "a challenge that ran out … never tried again" fails (`expected 2 to be 1`). See finding 2 for a gap |
| 3 | Never more than once | no | confirmed | `:321` returns `verify()` with no catch. Mutation "retry twice" → "is tried again once only" fails (`expected 3 to be 2`) and "five wrong codes still void" fails (`too_many`) |
| 4 | `challengeUser` and the check share one lookup | no | confirmed | `challengeRow` at `:128-132` (signed cookie → `findVerificationValue`), used by `challengeUser` `:302` and by the retry check `:319` |
| 5 | Five tests in "a challenge whose attempt counter fails to read" make the counter read fail with a spy | no | confirmed | `two-factor-sign-in.db.test.ts:297-399`: `vi.spyOn(ctx.internalAdapter, "consumeVerificationValue")` throws for `2fa-attempts-*` identifiers, `left` times; spies on `verifyTOTP`/`verifyBackupCode` count the tries; 5 `it`s at :325, :337, :348, :362, :377 |
| 6 | With the store's change reverted, the five tests fail on SQLite | no | partly | Scratch copy with `git show HEAD:<store>`, `vitest run --project db … -t "attempt counter fails"` → **4 failed, 1 passed**. "a challenge that ran out, or none at all, is expired at once, never tried again" passes without the change: it guards the retry's limits and fails only when they're removed (rows 2, 3) |
| 7 | With the change, the five pass on SQLite | no | confirmed | `pnpm exec vitest run two-factor-sign-in.db.test.ts -t "attempt counter fails" --reporter=verbose` → all 5 ✓; whole file 29 passed |
| 8 | …and on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres -- src/server/domains/identity/actions/two-factor-sign-in.db.test.ts` → 29 passed, the five listed ✓; the same for `test:db:mysql` and `test:db:mariadb` → 29 passed each |
| 9 | The identity domain's tests pass | no | confirmed | `cd apps/web && pnpm exec vitest run src/server/domains/identity/` → 57 files, 672 passed, 2 skipped (SQLite) |
| 10 | A retry never gives an extra guess at a code (judged from the code) | no | confirmed | Better Auth 1.7.25 `verify-two-factor.mjs` `beginAttempt`: every code check first consumes the `2fa-attempts-*` row (single winner), and a failure re-arms it at n+1. The retry is a full endpoint call, so it goes through `beginAttempt` again. An attempt that failed at `beginAttempt` checked no code and called no `recordTwoFactorFailure`. A lost counter makes the retry fail the same way → "expired". Test :362 fails under the "retry twice" mutation, so it does detect miscounting |
| 11 | A retry never gives a second session (judged from the code) | no | confirmed | The retry runs only when the first call threw. In `valid`, `INVALID_TWO_FACTOR_COOKIE` is thrown only before `createSession`, when the challenge row is already consumed or gone, so `challengeRow` is null and nothing is retried. The challenge consume is single-winner, a backup code is spent by a guarded `incrementOne` (409 for the loser), and TOTP replay is checked by the service once (`services/two-factor.ts:387-391`, outside the retry). Test :325 asserts `sessions() === before + 1` |

**Overall:** not met: the retry and its limits hold on all four databases and the identity domain passes, but only 4 of the 5 tests fail with the store's change reverted. Findings: (1) the *Done when* and acceptance criterion 1 can't be met as worded, since the fifth test guards the limits; (2) dropping the row check (`!row ||`) survives every test, though the spec says a challenge whose row is gone gets the first answer. Fixes: a sixth test, "a challenge that's gone, though it wouldn't have run out yet, is expired, never tried again", and the *Done when* and AC1 reworded (the first four fail without the change; the last two fail when the retry loses its expiry or row check).

### Re-check after the sixth test and the reworded *Done when*

Witnessed: 2026-11-18 21:59 EST, by the same agent (blind). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0. Mutations ran in the scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The retry happens only when the signed cookie names a challenge row that is there and hasn't run out | no | confirmed | `better-auth-two-factor-store.ts:319-320` unchanged (`cmp` with the first pass's saved copy). With the new test file: "no expiry check" (`if (!row) throw error;`) → "a challenge that ran out … never tried again" fails (`expected 2 to be 1`). "no row check" (`if (row && …expired) throw error;`) → "a challenge that's gone, though it wouldn't have run out yet …" fails (`expected 2 to be 1`). No guard at all → both fail. The first pass's gap is covered |
| 5 | Six tests in "a challenge whose attempt counter fails to read" make the counter read fail with a spy | no | confirmed | The same `failingCounter` spy. The sixth test deletes the challenge's own `2fa-%` row but not the `2fa-attempts-%` counter, calls `store.verifyChallenge` directly, and expects `expired` and `tries() === 1`. If the delete missed the challenge, the code would sign in and the test would fail; the no-row-check mutation shows it reaches the retry path |
| 6 | With the store's change reverted, the first four fail on SQLite; the last two fail when the retry loses its expiry check or its row check | no | confirmed | Scratch copy, `git show HEAD:<store>`, `vitest run --project db … -t "attempt counter fails"` → `4 failed \| 2 passed` (tests 1–4: `expected false to be true`, `expected {…'expired'} to deeply equal {…'wrong_code'}`, `expected 1 to be 2`, the same `expired`/`wrong_code` mismatch). No expiry check → test 5 fails; no row check → test 6 fails (row 2) |
| 7 | With the change, the six pass on SQLite | no | confirmed | Scratch copy with the current store → whole file 30 passed, all six ✓. Repository: `pnpm exec vitest run src/server/domains/identity/` → 57 files, 673 passed, 2 skipped |
| 8 | …and on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres -- src/server/domains/identity/actions/two-factor-sign-in.db.test.ts --reporter=verbose` → 30 passed, the six listed ✓; the same for `test:db:mysql` and `test:db:mariadb` → 30 passed each |
| 12 | PLAN task 1's *Done when* and SPEC acceptance criterion 1 say what the tests do | no | confirmed | `PLAN.md:13-16` and `SPEC.md:81-83` describe six tests: the first four fail without the change, and the last two guard the expiry and row checks, matching rows 6–8. `SPEC.md:41` lists the gone-row test in Scope |

**Overall:** met: all six tests pass on SQLite, PostgreSQL, MySQL and MariaDB. The first four fail with HEAD's store, and each of the last two fails when its own guard is removed. The identity domain passes.

### Adversarial pass

Witnessed: 2026-11-18 22:00 EST, by a fresh agent (adversarial). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0. Mutations and probes ran in a scratch copy, never in the repository.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The retry runs only after `INVALID_TWO_FACTOR_COOKIE` with a live challenge row; `challengeUser` and the check share one lookup | no | confirmed | `better-auth-two-factor-store.ts:128-132`: `challengeRow` is used by `challengeUser` (`:302`) and by the check (`:319-320`). Better Auth 1.7.25 `verify-two-factor.mjs` can also give this refusal with a live row in two other ways, both tried. Probe P9 (user lookup returns null): `expired`, 2 tries, the same answer. Probe P10 (counter row deleted, challenge row live): `expired`, 2 tries, no session |
| 2 | The retry gives no extra guess and doesn't get round the 5-attempt limit, even with parallel requests and no queue | no | confirmed | Probe P12: 12 parallel wrong guesses on one challenge, straight to the store (no queue), 4 counter reads failing. PostgreSQL: 5 `wrong_code` + `too_many`, 5 failures counted; MariaDB the same; MySQL 4 counted; SQLite 1. Never more than 5 on any database. "five wrong codes still void the challenge" passes on all four |
| 3 | The retry doesn't get round the account lockout (10 in a row) | no | confirmed | Probe P1: two challenges × 5 wrong codes, each with one failed counter read (20 endpoint calls) → `failed_verification_count` = 10 (once per attempt, not per call); the next challenge with a right code gets `locked`. Same on SQLite, PostgreSQL, MySQL and MariaDB |
| 4 | The retry never creates a second session | no | confirmed | Probe P11: 3 parallel right TOTP codes on one challenge, straight to the store, 3 counter reads failing → `ok,expired,expired` with one new session on all four databases. In `valid()`, `INVALID_TWO_FACTOR_COOKIE` is thrown only after the challenge row is consumed, so the row is gone and there is no retry |
| 5 | A used backup code isn't accepted again through the retry | no | confirmed | Probe P2: a backup code signs in after one failed counter read; a new challenge with the same code and a failing counter → `wrong_code`, sessions unchanged (all four databases) |
| 6 | A replayed TOTP code isn't accepted through the retry | no | confirmed | Probe P3: the same code on a new challenge, with a failing counter → `used`, 0 Better Auth calls, no session (all four databases). Probe P3b: the store alone accepts a replay, as Better Auth has no replay check; the guard is the service's `codeUsed`/`spendCode` (`services/two-factor.ts:387-391`), outside the retry and unchanged |
| 7 | Cookie handling: no retry for a forged cookie or two cookies, and no way to point the retry at someone else's challenge | no | confirmed | Probe P5 (signature replaced, store called directly) → `expired`, 1 try. Probe P4 (two signed live `ronne.two_factor` cookies) → `challengeId` refuses more than one, `expired`, 1 try. The retry passes the same `headers`, and Better Auth reads the cookie again itself, so the check can't change which challenge Better Auth uses |
| 8 | The retry reuses nothing from the failed call: request headers unchanged, response headers come from the second call | no | confirmed | Probe P6: request headers byte-identical after a retried success; `Set-Cookie` is `[session_token, dont_remember, two_factor=(cleared)]`, exactly one `session_token`. The failed call's error and headers are dropped (`:313-321`); in the retry path the first call never reached `expireCookie` |
| 9 | If the challenge runs out between the two tries, the answer is `expired` with no session | no | confirmed | Probe P7: both `2fa-%` rows expired just before the second `verifyTOTP` call → `{ok:false,error:"expired"}`, 2 calls, no new session (all four databases) |
| 10 | Real database errors aren't hidden or retried | no | confirmed | Probe P14: the challenge's own consume in `valid()` throws → `verifyChallenge` throws `Deadlock found`, 1 try, not retried. Probe P8: a database error in the retry's row check is thrown (`ECONNRESET`), not turned into a refusal or a success |
| 11 | The audit sees one attempt per sign-in try, with the second try's answer | no | confirmed | Probe P13: a retried wrong code → one `auth.two_factor_failed` with reason `wrong_code`; a counter that keeps failing → one more, reason `expired` (2 in total) |
| 12 | The six tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | Scratch copy, `vitest run --project db …/two-factor-sign-in.db.test.ts` on SQLite and with `TEST_DATABASE_URL` for each server → 30 passed on each of the four |
| 13 | With the store's change reverted, the first four fail on SQLite; the last two fail without the expiry check or the row check | no | confirmed | Store from HEAD → `4 failed \| 26 passed`, tests 1–4 ✗ and 5–6 ✓. `if (!row) throw error;` → only "a challenge that ran out…" fails (`expected 2 to be 1`), also alone with `-t` and on MySQL. `if (row && …expired)` → only "a challenge that's gone…" fails |
| 14 | The identity domain's tests pass | no | confirmed | Scratch copy, `vitest run src/server/domains/identity` → 57 files, 673 passed, 2 skipped |

**Overall:** met: across all four databases the retry gave no extra guess, didn't get round the lockout, made no second session, accepted no used code and didn't hide a database error. It reuses nothing from the failed call, and the six tests catch the revert and both limit mutations. Remark P8 (a database error during the row check now shows as an error, not "expired") is added to SPEC's Edge cases.

## Task 2 — Race tests run five times per run

Witnessed: 2026-11-18 21:51 EST, by a fresh agent (blind). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The four tests that start requests at once take `RACE`, and `RACE` is `{ repeats: 4 }` | no | confirmed | `two-factor-sign-in.db.test.ts:97` `const RACE = { repeats: 4 };`. It is used at :176, :520, :536 and :552. `grep -n "Promise.all"` → 4 hits (:181, :526, :541, :554), one in each of those four tests, so no test that starts requests at once is left without it |
| 2 | Vitest reports those four tests `repeat x4` | no | confirmed | `pnpm exec vitest run src/server/domains/identity/actions/two-factor-sign-in.db.test.ts --reporter=verbose` on SQLite → 29 passed. `grep "repeat x"` → exactly 4 lines: "two sign-ins with one code at once", the two "same backup code in two challenges at once" tests, and "recording one code twice at once" |
| 3 | Each repetition starts from a freshly migrated database | no | confirmed | Probe (the test file plus a `RACE` test that counts `user` rows, records `t.db` and calls `enrolled()`) on SQLite → `WITNESS runs=5 handles=5 users=5`, one `user` row at the start of each run, and `enrolled()` succeeded in every run. `beforeEach` (`:30-31`) calls `createTestDb()`, which gives a new in-memory database on SQLite (`test-db.ts:328`) and puts the shared one back to just migrated on a server (`test-db.ts:310`). The server path was read, not run: the containers were shared with another pass, and the task changes no database code |
| 4 | A second `enrolled()` on the same database would fail, so the test would notice a database that isn't fresh | no | confirmed | Probe test calling `enrolled()` twice → the second call rejects. Mutation (scratch copy where `beforeEach` makes the database only once and `afterEach` doesn't clean up), `-t "at once"` → all 4 race tests fail. The 3 that call `enrolled()` fail with `Error: not signed in`; "recording one code twice" fails with `expected [] to have a length of 1`. Vitest lists the failing runs as "initial run, 1st repeat … 4th repeat" or "1st–4th repeat" |
| 5 | (Task title) The race tests run four times per run | no | partly | Vitest's `repeats: 4` means 4 *more* runs after the first, so each race test runs **5** times. The probe shows `runs=5`, and the mutation's failure list names "initial run, 1st repeat, 2nd repeat, 3rd repeat, 4th repeat". `repeat x4` (the *Done when*) is right; "run four times" (the PLAN title) is off by one |

**Overall:** not met: the four race tests have `RACE`, Vitest reports them `repeat x4`, and every run starts from a fresh database. But `repeats: 4` runs each test 5 times, not the 4 the task title said (wording only). Fix: PLAN's title and SPEC's Scope now say five runs, "the first run and four repeats".

### Re-check of claim 5

Witnessed: 2026-11-18 21:53 EST, by the same agent (blind). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0. The test file and `test-db.ts` are unchanged since the first pass, so claims 1–4 keep its evidence.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | (Task title and SPEC Scope) The race tests run five times per run: the first run and four repeats | no | confirmed | `PLAN.md:16-17` "Race tests run five times per run … (`{ repeats: 4 }`: the first run and four repeats)"; `SPEC.md:42-43` says the same. It matches the first pass's measurement: probe `runs=5`, and Vitest's failure list says "initial run, 1st repeat … 4th repeat". `grep -rn -i "four times\|x4\|repeats"` across the issue folder and `docs/issues/README.md` → no "four times" left; the *Done when* and acceptance criterion 2 ("`repeat x4`") still match what Vitest prints |

**Overall:** met: the four race tests have `RACE`, Vitest reports them `repeat x4`, each of their five runs starts from a fresh database, and PLAN and SPEC now describe that correctly.

## Task 3 — The hold ends

Witnessed: 2026-11-18 22:15 EST, by a fresh agent (blind). Commit: 99adfb1b + working-tree diff. Machine: macOS 27.2.0, Node v24.0.0. The runs without the store's change ran in a scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | better-auth is 1.7.25 in `apps/web/package.json` and in the lockfile, and no 1.7.21 is left | no | confirmed | `git diff apps/web/package.json` → `"better-auth": "1.7.21"` became `"1.7.25"`. In `pnpm-lock.yaml`: specifier 1.7.25, and `better-auth` plus all seven `@better-auth/*@1.7.25` have new integrity hashes; no other 1.7.x left. The installed `apps/web/node_modules/better-auth/package.json` is 1.7.25 |
| 2 | 1.7.25 meets `minimumReleaseAge`, and 1.7.26 doesn't yet | no | confirmed | `pnpm-workspace.yaml:8` `minimumReleaseAge: 4320` (3 days). `npm view better-auth time` → 1.7.25 published 2026-11-14T17:49Z, about 4.4 days before the check; 1.7.26 2026-11-18T17:56Z, about 9 hours before |
| 3 | `.github/dependabot.yml` has no `better-auth` ignore, and the file still parses | no | confirmed | `grep -c better-auth .github/dependabot.yml` → 0. The diff removes only the ignore entry and its comment. Parsed with `yaml`: the npm ecosystem's `ignore` holds only `@types/node` semver-major; the other ecosystems are unchanged |
| 4 | E-14 is closed | no | confirmed | `docs/policies/dependencies.md:170`: the review column reads "**Closed** 2026-11-18: #307 is fixed in Ronne … 6 of 10 runs without it and 0 of 20 with it. better-auth is 1.7.25 and the Dependabot ignore is removed", the same form as closed E-7 to E-10, which also keep their Decision text. `git grep "1\.7\.21\|E-14"` outside the lockfile and the issue folder → only this row |
| 5 | `pnpm install --frozen-lockfile` passes | no | confirmed | → "Lockfile passes supply-chain policies", "Lockfile is up to date", exit 0; `git status --short` and the diff hash unchanged |
| 6 | `pnpm licenses:check` passes | no | confirmed | → "✓ 350 packages checked. All licenses are allowed by the policy."; `pnpm licenses list --json` → `better-auth` and every `@better-auth/*` 1.7.25 is MIT |
| 7 | The new version brings no known high or critical vulnerability (dependency policy) | no | confirmed | `pnpm audit --audit-level high` → 13 found, 3 low, 10 moderate; `pnpm audit --json` lists only ip-address, fast-uri, @hono/node-server and hono, nothing for better-auth |
| 8 | With better-auth 1.7.25 on MySQL 8.4 and the store's change reverted, the race tests fail in some of 10 runs | no | confirmed | Scratch copy, store from `git show HEAD:`, test file from the working tree, 10 × `vitest run --project db two-factor-sign-in.db.test.ts -t "at once"` against the MySQL test server → 6 of 10 failed (runs 2, 3, 5, 6, 7, 8), each `expected 'expired' to be 'wrong_code'` in "the same backup code in two challenges at once, without any queue" |
| 9 | With the store's change, the race tests fail in none of 20 runs | no | confirmed | Same copy with the working-tree store restored (`cmp`: identical) → 20 of 20 passed, each "Tests 5 passed \| 25 skipped" |

**Overall:** met: better-auth is 1.7.25 in the manifest and the lockfile and old enough for `minimumReleaseAge`; the Dependabot ignore is gone; E-14 is closed; the frozen install and the licence check pass; and on MySQL 8.4 the race tests failed in 6 of 10 runs without the store's change and in 0 of 20 with it.
