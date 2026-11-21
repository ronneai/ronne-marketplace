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

## Task 3 — Sign-in

Witnessed: 2026-11-21 00:53 EST, by a fresh agent (blind). Commit: 243193e3 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Sign-in, changing a password, wrong two-factor codes and passwords on two-factor changes, and `POST /api/v1/auth/token` each await the login limiter | no | confirmed | `session.ts:112`, `:208`, `token-exchange.ts:123` `await deps.limiter.consume(…)`; `two-factor.ts:99` `await …check`, `:106` `await …record`, through `await blocked(…)` at `:148/:204/:254/:298`. The sign-in second step never used this limiter before either (Better Auth counts it) |
| 2 | Same limits and keys as before | no | confirmed | `LOGIN_LIMIT = {name:"login", max:5, windowMs:60_000}` = the old class defaults (`git show 243193e3:…/login-rate-limiter.ts:19-21`); `loginRateLimitKeys` unchanged; password and two-factor changes pass `ip = null` |
| 3 | The answers don't change | no | confirmed | The diff only adds `await` on these lines; "answers 429 once the sign-in limit is used up" runs on the database store and passes on all 4 databases |
| 4 | The backup-code gap is a database limiter: consumed before the work, released when no set was made and on turn-off; the `Map` is gone | no | confirmed | `two-factor.ts:250-279` (`finally` releases when `!made`; `made = true` before the audit write), `:322` releases on turn-off; no `regenerated`/`REGENERATE_GAP` left. Mutations removing either release fail their tests. Probe loading the module twice: one `ok` on SQLite, PostgreSQL, MySQL; with check-then-record-after-success `["ok","ok"]` |
| 5 | The repository's tests show that "two clicks on two replicas make one set" | no | partly | "a second set within 30 seconds is refused on another server too" (`two-factor.db.test.ts:551`) passes with the check-then-record mutation (36/36): both calls share one module's `oneAtATime` queue (`two-factor.ts:46-57`) |
| 6 | `getAppAuth` builds both limiters from the instance's database and `AUTH_SECRET`; the `globalThis` copy and its half of `dropStale` are gone | no | confirmed | `auth-instance.ts:65-74`; no `__ronneLoginLimiter` left. Probe with `DATABASE_URL`/`AUTH_SECRET` (PostgreSQL, MariaDB): two `getAppAuth()` limiters share the count; another `AUTH_SECRET` reads `allowed:true` |
| 7 | Tests that only need the limiter out of the way keep the memory store; one test per path runs the database store | no | confirmed | `test-auth.ts:64-65` defaults to memory; database store in `session.db.test.ts:83,371`, `two-factor.db.test.ts:120,415,432,593,654`, `api-v1.db.test.ts:235`, and the gap's tests (`:542-549`) |
| 8 | The identity db tests pass on SQLite and on the servers | no | confirmed | SQLite → 58 files, 693 passed, 2 skipped; `pnpm test:db:{postgres,mysql,mariadb}` → 35 files, 475 passed each; typecheck clean |
| 9 | A sign-in refused on one app instance is refused on a second on the same database | no | confirmed | `session.db.test.ts:83`; mutation (`testLoginLimiter` on memory) → it fails |
| 10 | The threat model's "Guessing passwords" row names where the count lives | no | confirmed | `threat-model.md:138` names `LOGIN_LIMIT` (`login-rate-limiter.ts:87`), the `rate_limits` table and `rate-limit/database-store.ts` |

**Overall:** not met (row 5). Also noted: `threat-model.md:228` still lists sign-in among the limits in memory (task 6 rewrites that row); `threat-model.md:138` cited `session.ts:80` for the same answer, which isn't that line (from before this task).

### Adversarial pass

Witnessed: 2026-11-21 00:53 EST, by a fresh agent (adversarial). Commit: 243193e3 + working-tree diff (20 files). Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Identity db tests and `api-v1.db.test.ts` pass on SQLite | no | confirmed | 58 files, 693 passed, 2 skipped |
| 2 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `src/server/domains/identity/actions` + `api-v1.db.test.ts` → 24 files, 354 passed each |
| 3 | Every path awaits the limiter | no | confirmed | No unawaited `limiter.*`/`backupCodes.*` call in non-test code. Mutation: `.check` without `await` → tsc TS2339. A floating `record` passes tsc and the tests (no lint rule for floating promises); today's code awaits it |
| 4 | Keys and the limit name are unchanged, so sign-in, password change, two-factor and the token exchange share one count | no | confirmed | All four use `app.limiter` = `LOGIN_LIMIT`. Probe (one wrong attempt on each path, each on a fresh app instance): the right password is then refused everywhere (`rate_limited` 60, 429 `Retry-After: 60`), on all 4 databases. Mutation (token's own key) → only the probe fails; that sharing had no test before 109 either |
| 5 | Refusals keep their old answers and `retryAfterSeconds` | no | confirmed | `{"ok":false,"error":"rate_limited","retryAfterSeconds":60}`; token 429 `details.retryAfterSeconds: 60`; backup codes still `{ok:false,error:"just_made"}` |
| 6 | `getAppAuth` builds both limiters on the database store; the globalThis limiter and its `dropStale` half are gone | no | confirmed | `auth-instance.ts:65-74`. Probe (temp SQLite file, migrated): two `getAppAuth()`s share the count; `login` and `backup-codes` count apart; keys hashed; another AUTH_SECRET resets |
| 7 | A test fails if `getAppAuth` goes back to a memory limiter | no | not met | Mutation (both limiters `memoryRateLimiter`) → identity and api-v1 suites 730 passed; only the probe fails |
| 8 | Sign-in refused on one app instance is refused on a second | no | confirmed | `session.db.test.ts:83`, and the probe through `getAppAuth` |
| 9 | The backup-code gap is taken before the work; two replicas make one set; the `Map` is gone | no | confirmed | `two-factor.ts:250-251`. Probe with two module copies (`vi.resetModules`) → `["ok","just_made"]` on all 4 databases |
| 10 | The repo's two-replica test would catch the old order | no | partly | Mutation (check before, record after success, no release) → 36/36 pass: both "servers" share `oneAtATime` (`two-factor.ts:45`). The probe fails with it (`["ok","ok"]`) |
| 11 | The gap is released when no set was made and kept when one was | no | confirmed | Probe: a throwing regenerate and `signed_out` each release; an audit that throws after a set was made keeps the gap. Mutations: no `made = true` → 3 fail; no release → 2 fail |
| 12 | Turning two-factor off releases only the caller's gap | no | confirmed | `two-factor.ts:322` releases the signed-in user's key; release never goes below 0. Mutation (no release) → its test fails |
| 13 | Memory store where a limiter is only in the way; the database store once per path | no | confirmed | As blind row 7 |
| 14 | The threat model's "Guessing passwords" row names where the count lives | no | confirmed | `threat-model.md:138` |

**Overall:** not met (rows 7 and 10). Remark: nothing checks that a `record` is awaited.

### Re-check 1

Witnessed: 2026-11-21 01:03 EST, by a fresh agent (blind, re-check of row 5 plus the new `getAppAuth` test and the citation). Commit: 243193e3 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The repository's tests show that "two clicks on two replicas make one set" | no | confirmed | `two-factor.db.test.ts:551-580` loads the service twice with `vi.resetModules()` (`expect(one).not.toBe(two)`) and races both. Clean: SQLite 36/36, PostgreSQL 36/36, 5 more SQLite runs pass. Check-then-record mutation (`mut-check-then-record.py`) → this test fails on SQLite and PostgreSQL (1 failed, 35 passed) |
| 6a | A test fails if `getAppAuth` goes back to a memory limiter | no | confirmed | New `repositories/auth-instance.db.test.ts` passes. Mutation (both limiters `memoryRateLimiter`, `mut-memory-getappauth.py`) → `expected { allowed: true } to deeply equal { allowed: false, …}`. It always runs on SQLite (its own `DATABASE_URL`); the store is the same code on every database |
| 10 | The threat model's "Guessing passwords" row cites where the same answer is given | no | confirmed | `threat-model.md:138` cites `session.ts:149`, the `if (!result)` block returning `invalid_credentials` for a wrong password, an unknown email and a disabled user (`:149-154`) |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-11-21 01:04 EST, by a fresh agent (adversarial). Commit: 243193e3 + working-tree diff (new `repositories/auth-instance.db.test.ts`, reworked "another server too" test, `threat-model.md:138`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | A test fails if `getAppAuth` goes back to a memory limiter | no | confirmed | M5 (both `memoryRateLimiter`) → 1 failed / 36 passed. Variants fail the same test: only `limiter` on memory, only `backupCodesLimiter` on memory, one memory store shared through `globalThis` (caught by the `rate_limits` row count) |
| 10 | The repo's two-replica test would catch check-then-record | no | partly | M6 → "another server too" fails. "Consume but release even when a set was made" → 2 fail. But M6-consume-after (`check` first, `consume` only after the set is made, no release) → 36/36 pass: the test checks the answers and the one audit event, not how many sets were stored. Probe `two-factor-sets.probe.db.test.ts` counting stored sets → `expected 2 to be 1` with it, 3 of 3 runs |
| 16 | The new tests pass on SQLite and on one server | no | confirmed | SQLite 37 passed; PostgreSQL 37, MySQL 37. `auth-instance.db.test.ts` always uses its own SQLite file |
| 17 | `threat-model.md:138` cites the right lines | no | confirmed | `session.ts:149` is the same-answer branch; `login-rate-limiter.ts:87` is `LOGIN_LIMIT` |

**Overall:** not met (row 10). Remark: `auth-instance.db.test.ts` checks `getAppAuth`'s store on SQLite only.

### Adversarial re-check 2

Witnessed: 2026-11-21 01:08 EST, by a fresh agent (adversarial, re-check of row 10 and the reworked "another server too" test). Commit: 243193e3 + working-tree diff (`two-factor.db.test.ts:551-599` counts stored sets and turns two-factor off with the shown set's first code). Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The repo's two-replica test would catch check-then-record | no | confirmed | M6 → "another server too" fails (1/36). M6-consume-after → fails at `two-factor.db.test.ts:589`, `expected 2 to be 1` (`stored`), on SQLite and PostgreSQL. Release even when a set was made → "a double click makes one set…" and "a wrong password gives the 30 seconds back" fail. A gap key differing per replica → "another server too" and "turning two-factor off ends the gap" fail. Set first, `consume` after → "another server too" and "a double click" fail |
| 16 | The reworked test passes clean on SQLite and on the servers | no | confirmed | SQLite 36/36 three times; PostgreSQL 36/36; MySQL 8.4 36/36 |

**Overall:** met.

## Task 4 — Provider sign-in, rmk login --web and SCIM

Witnessed: 2026-11-21 01:15 EST, by a fresh agent (blind). Commit: 1bde85cc + working-tree diff. Machine: macOS 27 (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Provider sign-in counts in the database store with the same limits and keys (30/min per IP, 300/min for the instance) | no | confirmed | `sso.ts:55-80` (`SSO_LIMIT`, `SSO_SHARED_LIMIT` on `app.rateLimits`); keys unchanged against `git show 1bde85cc:…/sso.ts`. Probe across two instances: 31st start from one IP `rate_limited`, another IP allowed; without a trusted proxy the 301st refused. SQLite, PostgreSQL, MySQL |
| 2 | `rmk login --web` asking and polling count in the database: 10/60 per IP, 60/600 for the instance | no | confirmed | `device-grants.ts:40-56`, defaults `createDeviceLimiters(app.rateLimits)` (`:73`, `:94`). Probe: 61st poll `429` with `Retry-After` 1–60; 61st start without IP `429`; 601st poll without IP `429` |
| 3 | Codes typed on `/device`: 5/min per IP, 10/hour per person, counted together through `consumeAll` | no | confirmed | `device-grants.ts:115-127`, `:141-163`: `consumeAll`, `releaseAll` on a right code, `user_disabled` and a throw. Probe: the 11th for one person `rate_limited` (`retryAfterSeconds > 60`); with the IP bucket full, 20 refused, then exactly 5 more from other IPs. A mutation consuming each bucket separately fails the probe (bug 2) |
| 4 | SCIM counts in the database: 600/min per token, 20/min per IP refused, 100 for the instance | no | confirmed | `scim.ts:38-42`, `:61-80`, default `createScimLimiters(app.rateLimits)`. Probe: 601st token request `429`; 101st bad token without IP `429` |
| 5 | The `globalThis` copies of these limiters are gone | no | confirmed | No `__ronneDevice`, `__ronneScim`, `__ronneSsoLimiter`, `__ronneSsoShared` left; only `__ronneSsoPrunedAt` (pruning) |
| 6 | Production uses the database store for these limits | no | confirmed | `auth-instance.ts:71-80`: `rateLimits: store`, the same database store |
| 7 | The answers don't change | no | confirmed | Only `await`s added; messages and SCIM's skipped audit after 429 untouched. `/device` now reports the latest reset of the full buckets, which changes `retryAfterSeconds` only when both are full |
| 8 | Their db tests pass on SQLite and the three servers | no | confirmed | 12 files: SQLite 168 passed, 4 skipped; PostgreSQL, MySQL, MariaDB 172 each |
| 9 | Each limit is shown holding across two app instances | no | partly | `shared-limits.db.test.ts` shows 4 of the 10 (SSO callback, device start, `/device` per IP, SCIM refused per IP); not SSO start, SSO shared, device poll, start-shared, poll-shared, `/device` per person, SCIM per token, SCIM refused-shared. The probe shows they all hold. Mutation (defaults on a per-call memory store) → all 5 shared-limits tests fail |
| 10 | The threat model's `/device` row is updated | no | confirmed | `threat-model.md:146`; the SCIM row (`:204`) too |

**Overall:** not met (row 9). Also: no repository test checks `/device`'s "both or none" at the action level (a separate `consume` per bucket passes `device-page.db.test.ts` and `shared-limits.db.test.ts`).

### Adversarial pass

Witnessed: 2026-11-21 01:15 EST, by a fresh agent (adversarial). Commit: 1bde85cc + working-tree diff (18 modified files, plus the untracked `shared-limits.db.test.ts`). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The limits and windows are the same as before 109 | no | confirmed | `git show 1bde85cc:…/{sso,device-grants,scim}.ts` against the diff: SSO 30/300 per 60 s, device 10/60 and 60/600, page 5/min and 10/h, SCIM 600 and 20/100; all match the SPEC Scope table |
| 2 | The keys are the same as before | no | confirmed | The key strings are unchanged in the diff |
| 3 | No two limiters share counts (name collision) | no | confirmed | 13 distinct names; the hash covers name and key, and every key starts with its stage. Deliberate collisions (M7, M9) still don't merge rows |
| 4 | SSO start and callback, device start and poll, are counted apart | no | confirmed | P5: 31st start from one IP `rate_limited`, a callback from it isn't. P7: 11th code 429; 70 concurrent polls from that IP give exactly 10 refusals. All four dialects |
| 5 | The per-IP and shared buckets stay apart, and the shared ones hold across instances | no | confirmed | P6: no trusted proxy, 301st SSO start refused while a callback passes. P8: 70 concurrent starts without a proxy across two instances → exactly 10 refusals |
| 6 | Every limit call is awaited | no | confirmed | Every `.consume(`, `consumeAll`, `releaseAll` awaited. M3 (no `await` in `startSsoSignIn`) → 2 `sso.db.test.ts` tests fail; `tsc` exits 0 |
| 7 | Production counts in the database, no memory fallback, no `globalThis` copies | no | confirmed | Every default builds on `app.rateLimits`; `getAppAuth` sets a `createDatabaseRateLimitStore`; only `__ronneSsoPrunedAt` left; production callers pass no `limiters` |
| 8 | `/device` counts both limits together or not at all | no | confirmed | P3: with the IP limit used up, 10 more refused from it, and the person still has 5 entries. M6 (IP bucket dropped) → tests fail |
| 9 | `/device` gives the count back when the code was right or the work threw, keeps it otherwise, never twice | no | confirmed | P4: 6 right codes across instances, each released once (hits 5 and 5). P10: a thrown `ForbiddenError` releases both |
| 10 | `/device` gives the count back on `user_disabled` | no | partly | The code does (`device-grants.ts:161`), but no test reaches it. M1 (no `user_disabled` release) and M2 (no release in `catch`) leave all 26 tests green (a gap from before 109) |
| 11 | A concurrent burst of `/device` entries across two instances passes at most 5 per address and 10 per person | no | confirmed | P1: 40 concurrent from one IP → exactly 35 `rate_limited`. P2: 30 from 30 IPs, one person → exactly 20. All four dialects |
| 12 | Refused SCIM requests aren't audited past the limit | no | confirmed | P9: 30 concurrent bad tokens from one IP across two instances → exactly 10 × 429, 20 `audit_log` rows. M10 (audit before the check) → "…stops auditing them" fails |
| 13 | The task's db tests pass on SQLite and the servers | no | confirmed | SQLite 12 files, 168 passed, 4 skipped; PostgreSQL, MySQL, MariaDB 172 each |
| 14 | Each limit is shown holding across two app instances | no | partly | `shared-limits.db.test.ts` covers 4 limits. M8 (device poll on a fresh memory store) and M11b (SSO shared on one) survive; M4b, M5b, M12 are caught |
| 15 | The threat model's `/device` row is updated | no | confirmed | `threat-model.md:146`; the SCIM row (204) too. The remaining "in memory" rows (137, 143, 149) are for task 5 |
| 16 | The answers don't change | no | partly | Shapes, 429 and audit events unchanged. With both `/device` limits full, `retryAfterSeconds` is now the later window end (before: the person's); recorded in PLAN.md's notes but not SPEC.md |
| 17 | Lint and typecheck are clean | no | confirmed | `tsc` exits 0; Biome on identity and http: 0 errors |

**Overall:** not met (rows 10, 14, 16).

### Re-check 1

Witnessed: 2026-11-21 01:26 EST, by a fresh agent (blind). Commit: 1bde85cc + working-tree diff. Machine: macOS 27 (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Each limit is shown holding across two app instances | no | confirmed | `shared-limits.db.test.ts` (16 tests) covers all 10 limits. Mutations (`mutate-r1.py`: each default on a fresh memory store, or a random person key) each fail their test: sso-start, sso-shared, device-poll, device-start-shared, device-poll-shared, scim-token, scim-refused-shared 1 each; page-person-key 3 |
| 9a | `/device` counts both limits together or neither, at the action level | no | confirmed | "codes typed on /device count against both limits or neither" (`:182-194`); a separate `consume` per bucket → it fails |
| 9b | `limitedEntry` keeps a refused entry, releases on a right code, a disabled account and a throw, and refuses mixed stores | no | confirmed | describe block `:252-289`; `mutate-r1b.py`: dropping the `user_disabled` release or the one in `catch` → their tests fail |
| 7 | The answers don't change (`/device`'s wait written down) | no | confirmed | SPEC.md adds the line on the later window end (before 109: the person's) |
| 8 | The new tests pass on SQLite and a server | no | confirmed | SQLite 26 passed (2 files); PostgreSQL and MySQL 16 each |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-11-21 01:28 EST, by a fresh agent (adversarial). Commit: 1bde85cc + working-tree diff (`device-grants.ts` exporting `limitedEntry`, the untracked `shared-limits.db.test.ts`, SPEC "The answers don't change"). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | `/device` gives the count back on `user_disabled` and when the work throws, and a test shows it | no | confirmed | `limitedEntry`: `releaseAll` in `catch` and on `result.ok \|\| result.error === "user_disabled"` (the service returns it at `services/device-grants.ts:203`). M1 and M2 each fail their test (1 failed, 178 passed) |
| 14 | Each limit is shown holding across two app instances | no | confirmed | Each limiter's default swapped in turn for a fresh `memoryRateLimiter` across the 12 db files: every swap caught (M8 → "polling … 60 a minute per address"; M11b → "… 300"; the others 1 to 7 tests each). A separate `consume` per `/device` bucket → "both limits or neither" fails. `mut2.py` restored every file |
| 16 | SPEC.md states the `/device` wait change accurately | no | confirmed | SPEC.md:104-106 against `git show 1bde85cc:…/device-grants.ts` (person first) and `refusal()`'s `Math.max` (`rate-limiter.ts:115-118`); with one limit full the answer is unchanged |
| 18 | The new tests pass on SQLite and the servers | no | confirmed | 12 task files on SQLite → 179 passed, 4 skipped; `device-page` + `shared-limits` on PostgreSQL, MySQL, MariaDB → 26 each |
| 19 | Lint and typecheck are clean | no | confirmed | `tsc --noEmit` exit 0; Biome on the two files → no errors |

**Overall:** met.

## Task 5 — Uploads, submits, usage and feedback

Witnessed: 2026-11-21 01:34 EST, by a fresh agent (blind). Commit: 08e01af3 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The upload, submit, usage and feedback limiters count in the database store, keyed by user as before | no | confirmed | Each `createRateLimiter({ store, name })` gets `(deps.app ?? getAppAuth()).rateLimits` (`drafts-api.ts`, `usage-api.ts`) or `app.rateLimits` (feedback action); keys unchanged; names distinct |
| 2 | Limits and windows unchanged | no | confirmed | Constants unchanged against `git show 08e01af3:…`; the "refuses the 31st / 11th / 61st …" tests pass |
| 3 | The `globalThis` copies of the four limiters are gone | no | confirmed | Only `__ronneSetupCodeLimiter` (`setup-code-limit.ts:58-63`) left, as intended |
| 4 | The setup code's limiter uses the memory store, still 10 per address and 30 in all per 10 min | no | confirmed | One `createMemoryRateLimitStore()` shared by `setup-code` and `setup-code-all`; `install.ts` awaits `check` and `recordWrong`; `install.db.test.ts` (`setup_code_rate_limited` cases at :411-452) passes |
| 5 | `LoginRateLimiter` is gone; `loginRateLimitKeys` stays | no | confirmed | `login-rate-limiter.ts` keeps only `LOGIN_LIMIT`, `BACKUP_CODES_LIMIT`, `backupCodesKey`, `loginRateLimitKeys`; no `LoginRateLimiter` anywhere |
| 6 | The answers don't change | no | not met | **Before setup, submit changed:** `submitDrafts` builds `createSubmitLimiter((deps.app ?? getAppAuth()).rateLimits)` before `requireToken`, so `getAppAuth()` throws `NotConfiguredError` and the route answers 500. Probe `probe-109-preset.test.ts` → `{"submit":"threw NotConfiguredError","upload":503,"usage":503}`; at 08e01af3 all 503 |
| 7 | The drafts, usage and feedback tests pass on SQLite | no | confirmed | 32 files, 315 passed, 2 skipped |
| 8 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | drafts-api 33/33, usage-api 7/7, feedback 10/10, no-secrets 1/1 on each |
| 9 | Each limit holds across two app instances | no | confirmed | The four new tests pass; mutation (each limiter on a fresh memory store) → exactly those 4 fail |
| 10 | The threat model's upload and feedback rows are updated | no | confirmed | `threat-model.md:143` and `:149`. Remark: §5's row at `:228` is out of date (task 6 rewrites it) |
| 11 | `setup-code-limit.ts` and MVP.md's Feedback row say where each count lives | no | confirmed | `setup-code-limit.ts:9-15`; `MVP.md:1010` |
| 12 | MVP.md §15's two rows lose "Planned" | no | confirmed | `MVP.md:987` "Counted in the database since 109"; `:1026` "Every limit … is counted", the purge marked as task 6 |

**Overall:** not met (row 6).

### Re-check 1

Witnessed: 2026-11-21 01:40 EST, by a fresh agent (blind). Commit: 08e01af3 + working-tree diff (drafts-api.ts, new before-setup.test.ts). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Before setup, submit, upload and usage answer 503 (not a 500) | no | confirmed | The probe and `before-setup.test.ts` pass: `{submit:503, upload:503, usage:503}`. `submitDrafts` passes `() => deps.submitLimiter ?? createSubmitLimiter(...)`, called by `readSelection` only after `requireToken` passes |
| 6a | `before-setup.test.ts` fails when the submit limiter is built eagerly again | no | confirmed | Mutation (limiter built before `readSelection`) → the test fails with `NotConfiguredError`; restored, `cmp` clean |
| 7 | drafts-api tests still pass on SQLite and one server | no | confirmed | SQLite 33/33; PostgreSQL 33/33 (a control run on port 1 got `ECONNREFUSED`) |

**Overall:** met.

## Task 6 — The purge

Witnessed: 2026-11-21 01:47 EST, by a fresh agent (blind). Commit: 54a0fc6a + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge deletes `rate_limits` rows whose `expires_at` has passed and keeps the live ones | no | confirmed | `deleteExpiredRateLimits`: `expires_at < now` in the select and the delete. SQLite 84/84 (with the UI and command tests); `pnpm test:db:{postgres,mysql,mariadb}` 28/28 each. Mutations (both filters dropped; `<` → `<=`) fail "deletes counters whose window has ended…" |
| 2 | It deletes in batches of `PURGE_BATCH`, and the result counts them | no | confirmed | `inBatches`, `.limit(PURGE_BATCH)`, by `key_hash`. Probe `probe-109t6.db.test.ts` (2,005 expired, one ending 1 ms ago, one live) → 2,004 deleted on all four dialects |
| 3 | It runs under the job's lease | no | confirmed | `retention-job.ts:40-45`: inside `runJob`, `onBatch` renews the lease |
| 4 | A dry run counts without deleting | no | confirmed | "counts without deleting on a dry run" → 2 counted, 2 left; removing the dry-run branch fails it |
| 5 | The count appears in the Privacy tab's last run, in all three languages | no | confirmed | `LastRun.tsx` `rateLimits: n(c.rateLimitsDeleted ?? 0)`; the `done` message in en, pt, fr has `{rateLimits, plural…}`; `admin-settings.test.tsx` and `translations.test.tsx` pass; mutation `rateLimits: n(0)` fails |
| 6 | The count appears in `rmk-server purge`'s output | no | confirmed | `setup/purge.ts:24`; `purge.test.ts`; removing the line fails it |
| 7 | The count appears in the job's log event | no | confirmed | `flattenCounts` adds it, `run-job.ts:77` logs `...counts`, `events.ts` lists it; the probe sees `job.finished.rateLimitsDeleted` = 2004 and `last_result.counts.rateLimitsDeleted` = 2004 on 4 dialects |
| 8 | Tests show the counts in the tab, the command and the log | no | partly | No test for the log: with `rateLimitsDeleted` removed from `flattenCounts`, jobs/, log/, setup/purge and admin-settings → 387/387 pass |
| 9 | "A key used by no one again" stays until its window ends and the purge runs | no | confirmed | The row with `expires_at` = now is kept, strictly older ones go; a second run deletes 0 |
| 10 | Threat model: the setup code row | no | confirmed | `threat-model.md:137` |
| 11 | Threat model §5: the in-memory row covers only the setup code and Better Auth, and says why | no | confirmed | `threat-model.md:228` |
| 12 | MVP.md "Rate limits" row drops "(109's task 6, not yet built)" | no | confirmed | `git diff docs/MVP/MVP.md`; no "not yet built" left |

**Overall:** not met (row 8).

### Adversarial pass

Witnessed: 2026-11-21 01:55 EST, by a fresh agent (adversarial). Commit: 54a0fc6a + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge deletes counters whose window ended before `now`, keeps running ones, strictly, on all four dialects | no | confirmed | SQLite 84 passed; servers 22/22 each. Mutation `<` → `<=` fails. SQLite's `at` always comes from `toISOString()` |
| 2 | A consume restarting a window on a row the batch already selected keeps its row, on the servers | no | confirmed | `probe-adv.db.test.ts` 4/4 on each server: a consume committed between the select and the delete, a consume holding `FOR UPDATE` while the delete waits, a purge deleting a row a consume waits on (re-made, hits 1), and 2,500 rows purged next to 3 concurrent consumers (lost 0), 3 runs each |
| 3 | The repo's tests fail without the delete's recheck | no | not met | Dropping the delete's `expires_at` condition → 22/22 still pass; probe (d) catches it |
| 4 | The purge's delete and concurrent consumes can't deadlock | no | partly | On PostgreSQL the batch's delete is a Bitmap Heap Scan, locking in heap order, not key order: a consume holding A then asking for B, with B before A on the heap → `purge: 40P01`. MySQL and MariaDB: no deadlock. `retryOnDeadlock` absorbed it in probe (d); the comment is wrong |
| 5 | When the purge is the deadlock victim, the batch runs again, and a test shows it | no | partly | `retryOnDeadlock` wraps each batch; replacing it with a plain call → 22/22 pass |
| 6 | Batches end and don't loop forever | no | confirmed | PURGE_BATCH+5 test on 4 dialects; a batch shrunk by the recheck ends the run, the rest waits for the next |
| 7 | A dry run counts without deleting | no | confirmed | Removing the dry-run line fails its test |
| 8 | The Privacy tab shows the count in three languages, the same ICU placeholders | no | confirmed | admin-settings and translations tests; `messages.parity` and `english-fragments` 57 passed; mutation fails 3 tests |
| 9 | A `last_result` from before 109 doesn't break the tab | no | confirmed | `probe-lastrun.test.tsx` 3/3 (en, pt, fr show 0) |
| 10 | `rmk-server purge` prints the count | no | confirmed | `purge.test.ts`; a real run gives `Rate limit counters deleted: 2` |
| 11 | `job.finished` and `last_result` carry `rateLimitsDeleted` | no | partly | They do (`probe-joblog.db.test.ts`), but dropping it from `flattenCounts` → 78/78 pass |
| 12 | On SQLite, `rmk-server purge` from cron next to a running server doesn't fail when the server writes | no | partly | `sqlite-busy.cjs` (WAL, busy_timeout 5000, deferred `begin`, select, another connection writes, delete) → `SQLITE_BUSY_SNAPSHOT after 0 ms`; no live row lost, but the run fails. Every purge rule uses this pattern (predates 109) |
| 13 | Threat model: the setup code row and §5 name only the setup code and Better Auth | no | confirmed | `threat-model.md:137`, `:228` |
| 14 | MVP.md's "Rate limits" row no longer marks the purge as not built | no | confirmed | MVP.md:1026 |

**Overall:** not met (rows 3, 4, 5, 11, 12).

### Re-check 1

Witnessed: 2026-11-21 02:20 EST, by a fresh agent (blind). Commit: 54a0fc6a + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge deletes `rate_limits` rows whose `expires_at` has passed and keeps the live ones | no | confirmed | `deleteExpiredRateLimits` reads keys with `expires_at < now`; `deleteExpiredRateLimitKeys` locks them with `forUpdate`, filters and deletes with `expires_at < at` (`retention-purge.ts:385-436`). retention-purge, run-job and the probe → SQLite, PostgreSQL, MySQL 31/31 each; the row ending exactly now and the live row are kept |
| 2 | It deletes in batches of `PURGE_BATCH`, and the result counts them | no | confirmed | `inBatches` + `.limit(PURGE_BATCH)`; the probe expects 2,004 of 2,005 → passes on SQLite, PostgreSQL, MySQL |
| 4 | A dry run counts without deleting | no | confirmed | Removing the counters rule's dry-run line → its test fails |
| 8 | Tests show the counts in the tab, the command and the log | no | confirmed | Removing `rateLimitsDeleted` from `flattenCounts` → "runs the retention purge by root's policy, under its own name" fails; restored → 6/6 |

**Overall:** met (MariaDB not rerun in this pass).

### Adversarial re-check 1

Witnessed: 2026-11-21 01:59 EST, by a fresh agent (adversarial). Commit: 54a0fc6a + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge deletes counters whose window ended before `now` and keeps running ones, on all four dialects | no | confirmed | `retention-purge.db.test.ts` + `run-job.db.test.ts` + `probe-adv.db.test.ts` → 34/34 on SQLite, PostgreSQL, MySQL, MariaDB |
| 2 | A consume that restarts a window on a row the batch already read keeps its row | no | confirmed | `probe-deadlock2.db.test.ts` "B-only-then-restart" → `purge deleted 1`, `b:1` left, on the three servers; `probe-adv` (a)–(d) 4/4 each |
| 3 | The repo's tests fail without the recheck | no | confirmed | M-recheck (JS filter and the DELETE's `expires_at` condition removed) → "keeps a counter whose window an attempt restarted…" fails. Removing only the JS filter passes, as the DELETE still guards |
| 4 | The purge's batch and concurrent consumes don't deadlock | no | confirmed | PostgreSQL `EXPLAIN … order by key_hash for update` → `LockRows -> Sort (key_hash) -> Bitmap Heap Scan`: key order. The heap-order probe → `consume ok`, `purge deleted 1`, deadlocks +0; MySQL and MariaDB `Innodb_deadlocks` +0. `key_hash` is lowercase hex, so the JS sort and the database's agree |
| 5 | When the purge is the deadlock victim, the batch runs again, and a test shows it | no | confirmed | M-retry → "runs a batch again when the database ended a deadlock" fails; it passes on all four dialects |
| 6 | Batches end and don't loop forever | no | confirmed | `inBatches` (`retention-purge.ts:71`) |
| 11 | `job.finished` and `last_result` carry `rateLimitsDeleted` | no | confirmed | M-flatten → `run-job.db.test.ts:182-191` fails |
| 12 | On SQLite, the counters rule doesn't fail when another process holds the write lock and restarts a counter | no | confirmed | `probe-sqlite-cron.db.test.ts` with `sqlite-holder.cjs` (a child holds `begin immediate` 800 ms after restarting k2) → the purge waited 911 ms, `rateLimitsDeleted: 1`, `2:1` left. A deferred `db.transaction()` → `SQLITE_BUSY`. No repo test covers the purge's use of `writeTransaction` (the helper is tested in `locks.db.test.ts`); the older rules' deferred transactions predate 109 (PLAN.md Notes) |
| 15 | The new comments are true | no | confirmed | `retention-purge.ts:378-383`, `:418-423`; no "can't deadlock" claim left |

**Overall:** met. Rows 7–10, 13, 14 not re-checked: nothing they cover changed.
