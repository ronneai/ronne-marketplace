# 109 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 00:21 EST, by a fresh agent (blind). Commit: 6c863032 + working-tree diff (new `docs/features/109-shared-rate-limits/`, edits to `docs/MVP/MVP.md` and `docs/features/README.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The MVP §15 "Login rate limit" row says where the count lives | no | partly | `git diff docs/MVP/MVP.md` → MVP.md:987 now says "Counted in the database since 109 (M17, "Rate limits" below), so replicas share the count and a restart doesn't empty it". It names the right place, but in the present tense while the code still counts in memory (`auth-instance.ts:19-23` `__ronneLoginLimiter`, `login-rate-limiter.ts:6` "in memory"). Other unbuilt decisions (MVP.md:1023-1024) say "planned"; this row does not |
| 2 | A new §15 "Rate limits" row records the database, fixed windows, keyed hashes, failing closed, and the two limiters left in memory, as the spec does | no | partly | MVP.md:1026 has all five, matching SPEC "Decisions" 1-5 and "Behaviour". Same present-tense issue as row 1, and it repeats the spec's incomplete list (row 6) |
| 3 | The index links 109 in M17 and matches the spec | no | confirmed | `docs/features/README.md:328` is under "### M17 — More than one replica" (line 321), links `[109](./109-shared-rate-limits/SPEC.md)`, the same limiters, keyed hashes, locking transaction, purge and the two in-memory exceptions. Status `in progress` |
| 4 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → 0 |
| 5 | `pnpm docs:check` passes | no | confirmed | `pnpm docs:check; echo $?` → 0 |
| 6 | The spec's Scope table, with its Out list, covers every in-memory limiter the set-up app uses | no | partly | `grep -rln LoginRateLimiter apps/web/src` → session, two-factor, token-exchange, sso, device-grants, scim, upload-rate-limit, usage-rate-limit, feedback-limiter, setup-code-limit: all in Scope or Out. **Missed:** the backup-code regeneration gap, `two-factor.ts:56-57` (`REGENERATE_GAP_MS = 30_000`, a module `Map`, checked at :249-251, answering `just_made`): per user, per process, loosened by replicas and emptied by a restart, in neither Scope nor Out |
| 7 | The Scope rows' limits, windows and keys match the code | no | partly | SSO, device, `/device` page, SCIM, uploads, submits, usage and feedback all match (sso.ts:57,62,77-78; device-grants.ts:37-40,51-53,111-112,137-139; scim.ts:36-38,72-80; upload-rate-limit.ts:7-8,21,37,47; usage-rate-limit.ts:10-11,21; feedback models/feedback.ts:14-15). **Misstated:** the sign-in row says "the email, and the client IP with `TRUST_PROXY`" for every path, but changing a password (`session.ts:207`) and two-factor (`two-factor.ts:95`) call `loginRateLimitKeys(email, null)`: email only. The key strings (`email:…`, `ip:…`) aren't listed as in the other rows |
| 8 | What stays in memory matches the code: the setup code limiter, and Better Auth's `rateLimit` on `HTTP_ENDPOINTS` only | no | confirmed | `setup-code-limit.ts:6-28` (10 per address, 30 in all, 10 min, `globalThis` at :54). `better-auth.ts:78` `rateLimit: { enabled: true }`, :32 `HTTP_ENDPOINTS = new Set(["/get-session", "/ok"])`, `auth-http.ts:16` 404 for any other path. Side note: `setup-code-limit.ts:12` still says "109 moves them to the database" |
| 9 | The helpers the spec names exist | no | confirmed | `db/locks.ts:9` `forUpdate` (no-op on SQLite, :12), :20 `readCommittedTransaction`, :42 `retryOnDeadlock`; `crypto/sealed.ts:26-27` HKDF-SHA256; `jobs/retention-purge.ts:18` `PURGE_BATCH = 1000`; `jobs/scheduler.ts:17` every 6 h; `retention-job.ts:8,34` under a lease |
| 10 | Migration number 0044 is free | no | confirmed | The last migration is `0043_audit_context.ts`; `grep -rn 0044 docs/features/*/PLAN.md` → only 109's PLAN |

**Overall:** not met. Bugs: (1) the backup-code gap missing from Scope; (2) the sign-in row's keys misstated for two paths; (3) MVP.md's two rows in the present tense for unbuilt work. For later tasks: MVP.md's Feedback row ("the in-memory limiter, 037") and `setup-code-limit.ts:12`.

### Re-check 1

Witnessed: 2026-11-21 00:23 EST, by a fresh agent (blind). Commit: 6c863032 + working-tree diff (untracked `docs/features/109-shared-rate-limits/`, edits to `docs/MVP/MVP.md` and `docs/features/README.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The MVP §15 "Login rate limit" row says where the count lives, and doesn't describe the database count as already built | no | confirmed | MVP.md:987 reads "Ronne's own limiter … Planned to be counted in the database (109, M17, "Rate limits" below)". The code still counts in memory (`login-rate-limiter.ts`), so the row is accurate |
| 2 | The new §15 "Rate limits" row records the database, fixed windows, keyed hashes, failing closed and the two limiters left in memory, matches the spec, and is marked as not built | no | confirmed | MVP.md:1026 starts "Planned (109)", lists all ten Scope limiters including "the gap between new backup codes", and names fixed windows, the HMAC under a key derived from `AUTH_SECRET`, "failing rather than passing", the purge, and the setup code and Better Auth staying in memory, as SPEC Decisions 1–5 and Out say |
| 3 | The index row follows the spec, backup-code gap included | no | confirmed | `docs/features/README.md:328` lists "the gap between new backup codes" and the two limiters left in memory. Status `in progress` |
| 4 | `pnpm witness:check` passes | no | confirmed | → exit 0 |
| 5 | `pnpm docs:check` passes | no | confirmed | → exit 0 |
| 6 | The Scope table now covers the backup-code regeneration gap, and matches the code | no | confirmed | SPEC Scope row "New backup codes (105) … 1 in 30 seconds … the user … (a module `Map` today)". `two-factor.ts:56-57` (`REGENERATE_GAP_MS = 30_000`, `regenerated` Map), :249-251 checked before (`just_made`), :262 set after a success, :315 deleted on disable |
| 7 | The sign-in rows give the right keys per path, as key strings | no | confirmed | Sign-in and `POST /api/v1/auth/token`: "`email:…`, and `ip:…` with `TRUST_PROXY`" = `session.ts:111`, `token-exchange.ts:122` (`loginRateLimitKeys(email, context.ip)`). Changing a password and two-factor changes: "`email:…` only" = `session.ts:207`, `two-factor.ts:95` (`…, null`). Strings match `login-rate-limiter.ts:85` |
| 8 | PLAN.md's tasks cover the backup-code gap and the stale statements noted for later | no | confirmed | Task 3 moves the backup-code gap; task 5 owns `setup-code-limit.ts:12` and MVP.md:1010's "in-memory limiter, 037", and drops "Planned" from the two §15 rows |

**Overall:** met. One wording point, not a failure: SPEC Goal's first sentence put every limit in `LoginRateLimiter`, but the backup-code gap is a plain `Map`; reworded to "nearly all of them by `LoginRateLimiter`".

## Task 2 — The table and the store

Witnessed: 2026-11-21 00:31 EST, by a fresh agent (blind). Commit: 110cf456 + working-tree diff (0044_rate_limits.ts, rate-limit/, migrations/index.ts, schema.ts). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0044_rate_limits` creates `rate_limits` (`key_hash` varchar(64) PK, `window_started_at`, `hits`, `expires_at` with an index, no foreign keys) on all three dialects, and it is registered and typed | no | confirmed | `0044_rate_limits.ts:24-38`: `t.string(64)`, the PK, three NOT NULL columns, `rate_limits_expires_idx` on `expires_at`, no FKs; `migrations/index.ts` and `schema.ts` updated. The rerun test passed on SQLite, PG, MySQL and MariaDB |
| 2 | The port has async `consume`/`check`/`record`/`release`, plus `consumeAll` (all or none, one store) | no | confirmed | `rate-limiter.ts:13-24,32-46,95-98`; the consumeAll test passes on all 4 dialects; two stores throw "share one store" |
| 3 | 20 concurrent attempts over two pools allow exactly 5, on SQLite and on the servers | no | partly | `pnpm test:db:{postgres,mysql,mariadb}` → 16/16 each. On SQLite the test uses **one** pool (`database-store.db.test.ts:31`). With two pools on a file, `TEST_DATABASE_URL=file:x.db … -t "20 attempts"` → `SqliteError: database is locked`, 3 of 3 runs. Mutation: without `forUpdate`, PG allowed 20 instead of 5 |
| 4 | Rows are locked in key order, and missing rows are made while ignoring conflicts | no | partly | `database-store.ts:36-39` sorts, `:83-94` locks `forUpdate … orderBy key_hash`, `:52-62` ignores conflicts. But SPEC "Atomic across replicas" puts making the rows **inside** the one transaction; the code makes them **outside** it, then retries (`:117-121`). Safe, but spec and code disagree |
| 5 | `READ COMMITTED` and `retryOnDeadlock` wrap the locked transaction | no | confirmed | `database-store.ts:80-81`. Mutation: a plain `db.transaction()` on MySQL still passed (a locking read sees the latest commit anyway), so no test pins the isolation level |
| 6 | A refused attempt counts nothing | no | confirmed | storeRules passes on 4 dialects plus memory. Mutation (`consume` always counts) → 3 tests fail |
| 7 | A window ending starts the count over, at that attempt, with a count of 1 | no | confirmed | storeRules "starts a window over" (`retryAfterSeconds: 1` 59 s after the restart) passes everywhere. Mutation (keep the old window) → 8 tests fail |
| 8 | `release` works, and `check` with `record` | no | confirmed | The (105) and (107) tests pass on 4 dialects plus memory. Mutations: `record` a no-op → (105) fails; `release` a no-op → (107) and consumeAll fail |
| 9 | A count is seen by a new connection pool | no | confirmed | Passes on PG, MySQL and MariaDB with a second `createDb(t.url)`, and on file SQLite. In-memory SQLite reuses the pool |
| 10 | No email, IP or ID in the table; two limiter names give two rows | no | confirmed | The test passes on 4 dialects (6 rows, 64-hex keys). Mutation (hash without the name) → it and "keeps two limits apart" fail |
| 11 | The keyed hash is HMAC-SHA256 of name and key under HKDF-SHA256(AUTH_SECRET, `ronne rate-limit keys v1`), and a rotated secret gives new counts | no | confirmed | Probe `109-t2-blind/hash-probe.test.ts` (independent `hkdfSync` + `createHmac` over `name\0key`) equals `rateLimitKeyHash`; another secret differs. The rotate-secret test passes on 4 dialects |
| 12 | The application's clock: `now` injected and read once, before any lock wait | no | confirmed | `rate-limiter.ts:71-74`; the store uses only that value (`database-store.ts:97-100`) |
| 13 | When the database fails, the attempt fails | no | confirmed | The unmigrated-database test (consume, check and record reject) passes on 4 dialects; no catch in `database-store.ts` |
| 14 | The memory store passes the same rules in a unit test | no | confirmed | `memory-store.test.ts` runs `storeRules` → 25 passed. Same rules as `login-rate-limiter.ts`; one difference: a key named twice counts once (`distinct`) |

**Overall:** not met. (1) Two pools on one SQLite file throw "database is locked" under concurrent attempts, and the SQLite test hides it by using one pool. (2) The spec makes the rows inside the transaction, the code outside it. (3) Test gap only: no test pins READ COMMITTED.

### Adversarial pass

Witnessed: 2026-11-21 00:33 EST, by a fresh agent (adversarial). Commit: 110cf456 + working-tree diff (new `rate-limit/`, `0044_rate_limits.ts`, `migrations/index.ts`, `schema.ts`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite and on the servers | no | partly | Scratch copy: in-memory SQLite → 25 passed; PostgreSQL, MySQL, MariaDB → 16 each. File SQLite (`TEST_DATABASE_URL=file:x`) → 1 failed, `SqliteError: database is locked`, 3 of 3 runs |
| 2 | 20 concurrent attempts over two pools allow exactly 5, on SQLite and the servers | no | not met | Holds on the servers (5 allowed, hits `[5,5]`); a probe with 80 attempts over 4 pools, 8 overlapping key sets in mixed order and duplicate keys never went over 5, with no deadlocks. On SQLite the test never uses two pools (`secondPool()` returns `t.db`); with two pools on a file it throws `database is locked` (20 errors in 80 attempts): a deferred transaction upgrading to a write. Fails closed, but real attempts fail |
| 3 | Missing rows are made while ignoring conflicts | no | confirmed | `database-store.ts:51-62`. Mutation removing both → two tests fail on PostgreSQL and MySQL |
| 4 | Rows are locked in key order with `forUpdate` | no | confirmed | `:35-38`, `:81-92`. Mutation dropping `forUpdate` → "20 at once" fails on PostgreSQL and MySQL. Mixed-order key sets over 4 pools: no deadlock |
| 5 | The transaction runs at READ COMMITTED, with `retryOnDeadlock` | no | partly | The code does both (`:79-80`). Mutation to `db.transaction()` → every test and probe still passes on MySQL and MariaDB (InnoDB's `FOR UPDATE` reads the latest committed row at any level). Nothing exercises `retryOnDeadlock` |
| 6 | A refused attempt counts nothing | no | confirmed | Mutation counting refused attempts → 3 db tests and 2 memory tests fail |
| 7 | A window that has ended starts the count over | no | confirmed | `retryAfterSeconds: 1` from the new start; database `expires_at > now` and memory `now - start < windowMs` agree |
| 8 | `release`, and `check` with `record` | no | confirmed | Rules (105) and (107) pass in both stores everywhere. Mutation (hits never go up) → 4 rule tests fail |
| 9 | `consumeAll` counts all or none | no | confirmed | Under concurrency (30 mixed calls, 2 pools, ip max 7, person max 4) all-or-none held and the hits matched on every dialect |
| 10 | A count is seen by a new connection pool | no | partly | Passes on the servers and file SQLite; in the default in-memory run the "new pool" is the same pool |
| 11 | No email, IP or ID in the table, and two limiter names give two rows | no | confirmed | 6 hex rows, no raw parts. Mutation removing the name from the HMAC → 2 tests fail. A name containing NUL could collide (`key-hash.ts:28`); names are constants |
| 12 | Migration 0044 on all three dialects, reruns on MySQL and MariaDB | no | confirmed | Probe: `up()` twice, drop the index, `up()` twice more → passes on all four |
| 13 | Type in `db/schema.ts` | no | confirmed | `RateLimitTable` and `rate_limits` in `Database` |
| 14 | The memory store passes the same rules in a unit test | no | confirmed | 9 passed; mutations make it fail (rows 6, 8). `record(["k","k"])` now counts 1, not 2, in both stores; no caller passes a key twice |
| 15 | A purge-like delete racing consumes doesn't lose a live count | no | confirmed | 30 deletes of expired rows from a third pool raced 20 consumes (max 3) → at most 3 allowed on every dialect; missing rows re-made through the retry |

**Overall:** not met. (1) SQLite with two pools throws `database is locked`, and the SQLite tests never use two pools. (2) READ COMMITTED is untested. (3) A NUL in a limit name could collide.

### Re-check 1

Witnessed: 2026-11-21 00:38 EST, by a fresh agent (blind). Commit: 110cf456 + working-tree diff (`db/locks.ts` with `writeTransaction`, new `db/locks.db.test.ts`, `rate-limit/` including `database-store.ts`, `database-store.db.test.ts`, `rate-limiter.ts` and `testing/store-rules.ts`, SPEC "Behaviour"). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Concurrent attempts over several pools or processes allow exactly `max`, on SQLite and on the servers; on SQLite another process writing the file makes an attempt wait, not fail | no | confirmed | In-memory SQLite 29/29, file SQLite 29/29, `pnpm test:db:{postgres,mysql,mariadb}` 19/19 each. Probe `two-proc.sh 4` (4 vitest processes, 15 consumes each, one SQLite file, max 5) → 5 `ok` in total, no errors, hits `[5,5]`, 3 runs, interleaved. Mutation (deferred `db.transaction()` on SQLite) → `SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT` in every process, and `locks.db.test.ts` "holds the write lock from its start" fails. The repo's 20-attempt test still uses one pool on SQLite, as its comment explains |
| 4 | Rows locked in key order in one transaction; a missing row ends it without writing, the rows are made in their own statement ignoring conflicts, and it runs again (new SPEC text) | no | confirmed | `targets()` sorts; `locked()` runs `forUpdate(… orderBy("key_hash"))` in `writeTransaction`, returns `MISSING` before writing, then `makeRows` outside and loops (at most 5). Matches SPEC "Atomic across replicas". The "makes a row again" test passes on all 4 dialects |
| 5 | READ COMMITTED on the servers, `BEGIN IMMEDIATE` on SQLite, wrapped in `retryOnDeadlock` | no | confirmed | `locks.ts` `writeTransaction`; `database-store.ts` wraps it in `retryOnDeadlock`. Probe `isolation.probe.db.test.ts` → PG `read committed`; MySQL and MariaDB `innodb_trx.trx_isolation_level` = `READ COMMITTED`. The SQLite lock is pinned by `locks.db.test.ts`. No repo test pins READ COMMITTED or exercises `retryOnDeadlock` (test gap only, recorded in Notes) |
| 9 | A count is seen by a new connection pool, SQLite included | no | confirmed | `database-store.db.test.ts:83-102`: on SQLite a migrated temp file with a second `createDb` pool, asserting `nextDb !== firstDb`; passes in-memory, on a file and on the 3 servers |
| 15 | Limit names are lower-case letters, digits and hyphens, checked when a limiter is made | no | confirmed | `rate-limiter.ts:69` throws `Not a rate limit name`; the rule test refuses `""`, `"a\u0000b"`, `"Sign In"`, `"-x"`. Mutation (check removed) → that test fails |

**Overall:** met. Remarks (not blocking): no repo test runs two processes on SQLite (the lock-held check stands for it); two pools in one process can't overlap transactions on SQLite, which is fine while one process serves a file.

### Adversarial re-check 1

Witnessed: 2026-11-21 00:47 EST, by a fresh agent (adversarial). Commit: 110cf456 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | When another process holds the SQLite file's write lock, `consume` waits for it and doesn't fail | no | confirmed | Probe `xproc.db.test.ts`: a child process held `BEGIN IMMEDIATE` 1.5 s → `consume` `{ allowed: true }` after 1540 ms; a new key meanwhile (the `makeRows` insert) → allowed; hits `[2, 1]` |
| 2 | The other direction: another process waits while `writeTransaction` holds the lock | no | confirmed | A child with `busy_timeout 5000` and `BEGIN IMMEDIATE` → "child committed after 793ms", after the transaction committed |
| 3 | `BEGIN IMMEDIATE` is what makes row 1 hold, and the repo's test catches its loss | no | confirmed | Mutation `begin immediate` → `begin`: `locks.db.test.ts` "holds the write lock from its start" fails, and the probe's consume fails at once with `database is locked`. Restored (`diff -q` clean) |
| 4 | `writeTransaction` rolls back when the work throws or the commit fails, and the connection is usable after | no | confirmed | Work inserted then threw → rejects, 0 rows. A deferred FK violation failed the commit → `FOREIGN KEY constraint failed`, 0 rows; the next call works. A busy `BEGIN` (timeout 50 ms) → `database is locked`, the next call works. Commit/rollback test passes on all four databases |
| 5 | Other code using the same pool at the same time doesn't break it | no | confirmed | A sleeping `writeTransaction`, a `db.transaction()` and a select at once on one SQLite pool → all resolved. Remark: `writeTransaction(db)` nested on the same SQLite `db` hangs for good, as `db.transaction()` already does there; the store never nests |
| 6 | Earlier probes on all four databases (4 pools, 80 mixed key sets; a purge racing consumes; `consumeAll`; migration reruns) | no | confirmed | In-memory SQLite 23 passed; PostgreSQL, MySQL, MariaDB 23 passed, 3 skipped (SQLite-only probes) each |
| 7 | The task's own tests pass with SQLite on a file | no | confirmed | `TEST_DATABASE_URL=file:./x.db` → 19 passed |
| 8 | SPEC criterion 2 as worded ("over two connection pools … on SQLite") and the "Many attempts at once" edge case | no | not met | Probe `twopool-file.db.test.ts`: two `createDb` pools on one SQLite file, 20 attempts, limit 5 → 3 allowed, 17 `database is locked`, 90 s. The repo test passes only because `secondPool()` returns `t.db` on SQLite. The code can't do this with better-sqlite3; the spec's wording must change |
| 9 | The new "Atomic across replicas" text is true of the code | no | confirmed | `locked()` returns `MISSING`, `makeRows` runs outside, retries (5); sorted hashes, `forUpdate` + `orderBy`; `retryOnDeadlock` around `writeTransaction`; `locks.ts:35-49` |
| 10 | A count survives a restart: a real new pool on a SQLite file sees it | no | confirmed | `database-store.db.test.ts:83-95` with `expect(nextDb).not.toBe(firstDb)`, passing everywhere |
| 11 | Limit names must match `/^[a-z0-9][a-z0-9-]*$/`, enforced by a test | no | confirmed | `rate-limiter.ts:69`; `"a\n"`, `"a\0b"`, `"A"`, `"-a"`, `"é"`, `"a_b"`, `""` refused, `"sign-in"` accepted; `store-rules.ts:131-136` |
| 12 | The PLAN note on the isolation level is accurate | no | confirmed | No isolation assertion in the task's tests; `FOR UPDATE` reads the latest committed row at both levels |

**Overall:** not met, on wording only: SPEC criterion 2 and the "Many attempts at once" edge case promised two pools on SQLite. Remarks: a nested `writeTransaction` on the same SQLite `db` hangs (worth a line in its doc comment); "waits" means better-sqlite3 blocks the process up to the 5 s busy timeout.

### Adversarial re-check 2

Witnessed: 2026-11-21 00:45 EST, by a fresh agent (adversarial). Commit: 110cf456 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1. Scope: wording only (row 8 of re-check 1).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | SPEC criterion 2 and "Many attempts at once" are true: two pools on the servers, one on SQLite, another process waiting for the file's lock up to the busy timeout (5 s) | no | confirmed | `create-db.ts:103` `busy_timeout = 5000`; `database-store.ts:82` → `writeTransaction` → `begin immediate` (`locks.ts:39`). `xproc.db.test.ts`, `locks.db.test.ts`, `database-store.db.test.ts` → 22 passed; a child holding the lock 1.5 s made `consume` wait 1519 ms then allow; the other way the child committed after 819 ms; with a zero busy timeout BEGIN fails and the connection still works |
| 2 | PLAN task 2's *Done when* bullet says the same | no | confirmed | `PLAN.md:31-32`, and the Notes at `:90-95` |
| 3 | `writeTransaction`'s doc comment is true: nesting on the same SQLite db waits for ever; side-by-side transactions take turns | no | confirmed | `locks.ts:23-32`; probe: nested → `TIMEOUT (nested call hangs)` after 3 s; side by side → `[[{"a":1}],[{"b":2}],0]` |
| 4 | No other line in SPEC.md, PLAN.md or the code's comments still promises two pools on SQLite | no | partly | All right except the test title `database-store.db.test.ts:66` "… over two pools", which runs on one pool on SQLite (the comment above it explains) |
| 5 | `pnpm witness:check` and `pnpm docs:check` pass | no | confirmed | both exit 0 |

**Overall:** not met, on one test title (wording).

### Adversarial re-check 3

Witnessed: 2026-11-21 00:46 EST, by a fresh agent (adversarial). Commit: 110cf456 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1. Scope: wording only (row 4 of re-check 2).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | The 20-at-once test's title matches what runs on each dialect | no | confirmed | `database-store.db.test.ts:66` "(over two pools, one on SQLite)"; `:36-41` `secondPool()` returns `t.db` on SQLite and a new `createDb(t.url)` pool on the servers |
| 4a | The test still passes on in-memory SQLite | no | confirmed | `pnpm exec vitest run src/server/rate-limit` → 27 passed |
| 4b | The test still passes on PostgreSQL | no | confirmed | `pnpm test:db:postgres src/server/rate-limit` → 17 passed |
| 4c | No other line promises two pools on SQLite | no | confirmed | `grep -niE "two pools\|pools\|second pool"` over SPEC.md, PLAN.md, `rate-limit/`, `db/locks*`: SPEC.md:107-111 and :159-161, PLAN.md:31 and :90-95, the test's comments, all say two pools on the servers and one on SQLite |
| 4d | `pnpm witness:check` and `pnpm docs:check` pass | no | confirmed | both exit 0 |

**Overall:** met.
