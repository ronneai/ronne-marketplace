# 166 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 23:29 EST, by a fresh agent (blind). Commit: 4e11d0b6 + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §10's `audit_log` row lists the five new columns | no | confirmed | `MVP.md:686` names all five, matching SPEC Scope's table |
| 2 | The row gives the spec's values for `via` and `outcome` | no | confirmed | `MVP.md:686`: web, api, scim, cli, system; success, failed, denied |
| 3 | Older rows: `via` null and `outcome` `success` | no | confirmed | `MVP.md:686`; SPEC Scope |
| 4 | `workspace_id` has no foreign key, with the spec's reason | no | confirmed | `MVP.md:686`; SPEC table note and Decision 2 |
| 5 | The user agent is cut to 256 and treated as personal data | no | confirmed | `MVP.md:686`; the code-point cut and control characters are left out, not contradicted |
| 6 | The row says where each field is filled, as the spec does | no | partly | "filled by `recordAudit` from the request: request_id, via, user_agent, workspace_id and outcome"; the spec has workspace_id passed by callers (Decision 1) and outcome from the catalogue |
| 7 | MVP §15 "Personal data": retention and erasure clear an audit event's user agent with its address | no | confirmed | `MVP.md:1010` |
| 8 | Nothing else in MVP.md contradicts the spec | no | confirmed | `grep -n -i "audit\|user_agent\|recordAudit\|request.id"`: `:663`, `:750`, `:767`, `:857`, `:860` fit |
| 9 | Nothing is presented as more settled than the spec | no | not met | "(owner, 2026-11-01)" covers "no foreign key" (Decision 2, Claude's); `:1010` carries Decision 3 unmarked; "since [166]" though only task 1 is done (162 kept "Planned in" until built) |
| 10 | `docs/features/README.md` lists 166 in M28 with the spec's dependencies | no | confirmed | `README.md:452`, row `:463`, deps "007, 060, 100, 102, 103, 104" |
| 11 | The README row's description says what the spec says | no | confirmed | `README.md:463` matches SPEC Scope |
| 12 | The README status is valid and current | no | confirmed | `in progress` (`README.md:35-36`) |
| 13 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: columns, values, defaults, the no-foreign-key rule and the privacy clearing match, but the row says all five fields come from the request (row 6) and presents Claude's Decisions 2 and 3, and the unbuilt feature, as settled (row 9).

### Re-check (rows 6 and 9)

Witnessed: 2026-11-01 23:31 EST, by a fresh agent (blind). Commit: 4e11d0b6 + working tree (only docs/MVP/MVP.md and docs/features/README.md count; task 2's files ignored). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The row says where each field is filled, as the spec does | no | confirmed | `MVP.md:686`: request_id, via and user_agent from the request context; workspace_id passed by the services; outcome from the action catalogue. Matches SPEC Scope and Decision 1 |
| 9 | Nothing is presented as more settled than the spec | no | confirmed | `MVP.md:686` back to "planned in [166]"; "(owner, 2026-11-01)" covers only Decision 1; "Claude's, to confirm (166's Decisions 2 and 3)", as `MVP.md:993` does; `MVP.md:1010` "planned in 166 … Claude's, to confirm: 166's Decision 3". Rows 1–5 and 7 still hold; `pnpm witness:check` → 0 |

**Overall:** met: with the first pass's rows 1–5, 7, 8 and 10–13, every claim of task 1 is confirmed.

## Task 2 — Migration

Witnessed: 2026-11-01 23:39 EST, by a fresh agent (blind). Commit: 8362aa21 + working tree (`0043_audit_context.ts` and its db test untracked; `migrations/index.ts` and `schema.ts` modified). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration's db test passes on PostgreSQL, MySQL and MariaDB (and SQLite) | no | confirmed | `pnpm test:db:postgres -- src/server/db/migrations/0043_audit_context.db.test.ts`, `:mysql`, `:mariadb` → 5 passed each; SQLite too |
| 2 | `migrations.guard.test.ts` and `audit-log.guard.test.ts` pass | no | confirmed | 3 files, 53 passed; no `.references(` in 0043 |
| 3 | The five columns have the spec's types and nullability | no | confirmed | Probe on 4 dialects: PG `character varying` 128/16/256/26/16, only `outcome` NOT NULL default `'success'`; MySQL 8.4 and MariaDB `varchar(…)` the same; SQLite pragma the same. The servers refuse one character too long |
| 4 | Two indexes: (`workspace_id`, `id`) and (`request_id`) | no | confirmed | The index case passes on 4 dialects; mutation (columns swapped) fails it |
| 5 | No foreign key on `workspace_id` | no | confirmed | Probe: only `audit_log_actor_id_fk` on PG, MySQL, SQLite |
| 6 | Rows written before the migration read `via` null and `outcome` `success` | no | confirmed | Probe "upgrade path" (undo 0043, insert, migrate) → nulls and `success` on 4 dialects. Remark: the test's "reads older rows" case inserts after the migration. Mutation `defaultTo("ok")` → fails |
| 7 | 256 two-byte characters fit in `user_agent` | no | confirmed | `"é".repeat(256)` on 3 servers; mutation `t.string(64)` → fails |
| 8 | MySQL can run it again after a half-done run | no | confirmed | Probe on MySQL and MariaDB: drop `outcome`, `workspace_id`, both indexes; `up` twice → no error, indexes back. Mutation (no column guard) → the rerun case fails |
| 9 | It is in the shared migration set, in order | no | confirmed | `index.ts` adds it after 0042; `migrateToLatest` → `[]`; a 0042 archive's restore reports `newer: ["0043_audit_context"]` |
| 10 | `schema.ts` `AuditLogTable` matches | no | confirmed | Four `string \| null`, `outcome: Generated<string>`; `tsc --noEmit` clean; `biome check` clean |
| 11 | No new column ends in `_at` | no | confirmed | `restore.db.test.ts` "keeps the naming restore relies on…" passes on pg, mysql, mariadb |
| 12 | A backup made before restores after, and one made after keeps the new fields | no | confirmed | Probes in a scratch `restore.db.test.ts` on 4 dialects: a 0042 SQLite archive restores everywhere with the new fields null and `success`; a post-0043 archive keeps every field. `restore`, `dump`, `run-backup`, `verify` → 49 passed, 1 skipped on the servers |

**Overall:** met: columns, indexes, no foreign key, older rows' defaults, the MySQL rerun and backup/restore hold on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11, and both guards pass.

Remarks: `request_id` uses MySQL/MariaDB's default collation, which ignores case and accents, so an "exact" request ID filter would match more there (`docs/knowledge/collations.md`); the "older rows" test doesn't insert before the migration.

### Adversarial pass

Witnessed: 2026-11-01 23:41 EST, by a fresh agent (adversarial). Commit: 8362aa21 + working tree (0043_audit_context.ts, its db test, index.ts, schema.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration is registered and applied by migrateToLatest | no | confirmed | `index.ts:43,93`; removing the entry → the 0043 test fails 4 of 5; a probe at 0042 → `['0043_audit_context']` on all four |
| 2 | The five columns have the stated types, nullability and default | no | confirmed | `zz_probe_0043.db.test.ts` reads the column list on each database; null into outcome refused on all four |
| 3 | workspace_id has no foreign key | no | confirmed | Only `audit_log_actor_id_fk` on all four; adding an FK in a scratch copy → 2 db tests fail on PostgreSQL |
| 4 | The two indexes exist | no | confirmed | The test passes on all four; mutations (swapped order, no request index) → each fails 1 |
| 5 | Additive on a big table: no rewrite, no long lock | no | confirmed | 200,000 rows: PostgreSQL 218 ms, same `pg_relation_filenode` (no rewrite); MySQL 791 ms, MariaDB 425 ms, `algorithm=instant` columns and `inplace lock=none` indexes accepted |
| 6 | Older rows read null, with outcome 'success' | no | confirmed | The 200k probe → 0 rows otherwise on all four; a 0042 backup restored into each → null/null/null/null/`success` |
| 7 | MySQL/MariaDB: a half-done run can be run again | no | confirmed | Every partial state on both servers, then `migrateToLatest` again → all columns and indexes. Removing either skip → the repo test fails on both. Remark: the repo test only reran a complete migration |
| 8 | utf8mb4 lengths, and the request_id index fits MySQL's key limit | no | confirmed | 256 four-byte characters in user_agent and 128 in request_id stored and looked up on all four; over-length refused on the servers (SQLite ignores lengths: cutting is task 3's) |
| 9 | schema.ts types the columns; outcome may be omitted | no | confirmed | `schema.ts:140-149`; a type probe through `tsc` holds; the repo's `tsc --noEmit` clean |
| 10 | Backup and restore across 0043 | no | confirmed | Pre-0043 backups restore and get 0043; post-0043 backups round-trip on all four; restoring into an older Ronne refused by design (`backup-format.md:95`); no new `_at` column |
| 11 | Done when: the db test passes on the three servers (and SQLite) | no | confirmed | 5 passed on SQLite, PostgreSQL 15, MySQL 8.4, MariaDB 10.11 |
| 12 | Done when: both guards pass, and catch what they claim | no | confirmed | 48 passed; `.references(` in 0043 → the migrations guard fails; `db.updateTable("audit_log")` in the audit repository → the audit-log guard fails |
| 13 | Two servers migrating at once apply 0043 exactly once | no | confirmed | `zz_probe_concurrent.db.test.ts`: one returns [0043], the other []; one ronne_migration row on PostgreSQL, MySQL, MariaDB |
| 14 | request_id matches exactly in every dialect | no | partly | Rows `Proxy-abc.1` and `proxy-ABC.1`, `where request_id = 'PROXY-ABC.1'` → both on MySQL (`utf8mb4_0900_ai_ci`) and MariaDB (`utf8mb4_general_ci`), none on SQLite and PostgreSQL; the migration used `t.string(128)`, not `t.exactString(128)` |

**Overall:** not met: everything holds on all four databases except row 14: on MySQL and MariaDB request_id compares case-insensitively, so the exact Request ID filter would match IDs that differ only in case.

### Re-check (row 14)

Witnessed: 2026-11-01 23:46 EST, by a fresh agent (adversarial). Commit: 8362aa21 + working tree (request_id `t.exactString(128)`, the updated db test, index.ts, schema.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | request_id matches exactly in every dialect | no | confirmed | Collation probe: `where request_id = 'PROXY-ABC.1'` → `[]` on SQLite, PostgreSQL, MySQL 8.4, MariaDB 10.11; the column is `utf8mb4_bin` on MySQL/MariaDB. Mutation back to `t.string(128)` → "matches a request ID exactly…" fails on MySQL and MariaDB. The repo test → 6 passed on all four. Remark: `utf8mb4_bin` pads spaces (`'abc '` matches `'abc'`); stored IDs can't hold spaces |
| 14a | request_id under utf8mb4_bin: 4-byte characters and the index's key length | no | confirmed | 128 four-byte characters stored and found through the index on MySQL and MariaDB (`explain` uses `audit_log_request_idx`, no prefix); 129 refused on the servers |
| 7 | MySQL/MariaDB rerun after a half-done run | no | confirmed | Every partial state reapplies on both. Gap: removing the outcome skip passed on MariaDB, since the new case drops outcome first |

**Overall:** met: request_id compares case-sensitively everywhere, fits the index under utf8mb4_bin, and its test fails without the fix.

After this re-check the implementer ended the MySQL rerun case with a full rerun (every column and index skipped, outcome included), and noted in PLAN.md that task 6's filter trims its input and checks it against 100's pattern.

## Task 3 — Context and recordAudit

Witnessed: 2026-11-01 23:53 EST, by a fresh agent (blind). Commit: bd6ac657 + working tree (24 modified files, untracked `audit-context.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `RequestContext` gains `via` and `userAgent` | no | confirmed | `src/server/log/context.ts:12-21` |
| 2 | `apiRoute` sets `api`, and `scim` under `/api/v1/scim` | no | confirmed | `api-route.ts:22,54-55` `channelOf(route)`; the only SCIM route is `"/api/v1/scim/v2/[...path]"`. Mutation (no `via`) → 2 tests fail |
| 3 | `serverAction` and the web-session route handlers set `web` | no | confirmed | `server-action.ts:33-37`; every non-`/api/v1` apiRoute maps to `web`; the 2 unwrapped routes record nothing. Mutation → the server-action test fails |
| 4 | `withChannel` exists and keeps the surrounding request | no | confirmed | `context.ts:37-38`; test "withChannel keeps the request…" |
| 5 | Every event a terminal command records says `cli`, `rmk-server` included | no | confirmed | All 11 `SCRIPTS` in `packages/server/src/cli.ts:8-20` set it but `setup-code` (records nothing). Real runs in a scratch copy (`tsx scripts/setup.ts --yes`, `reset-root-password --yes`) and the tsdown bundle → `via:"cli"`, no request ID or client. Remark: PLAN says `withChannel`; the code uses `setProcessChannel`, same effect |
| 6 | Every scheduled job's events say `system`; `purge` from a terminal says `cli` | no | confirmed | `run-job.ts:70-73`; the scheduler starts from `instrumentation.ts` outside a request; test passes; mutation (no `withChannel("system")`) fails it |
| 7 | `recordAudit` writes the request ID the logs and `X-Request-Id` carry | no | confirmed | `audit.ts:39`; test compares with the response header. Probe: an untrusted `X-Request-Id` isn't stored; two interleaved concurrent requests each keep their own |
| 8 | Outside any request and channel, the fields are null | no | confirmed | Test "nothing known: no channel" |
| 9 | User agent cut to 256 at a code point, control characters removed, empty → null; tested | no | confirmed | `audit-event.ts:199-206`; tests for 412 characters, emoji, BEL/RLO/NUL, ZWSP-only. Mutations (no stripping; UTF-16 slicing) fail. Remark: U+2028 (Zl) kept |
| 10 | Outcome from the catalogue | no | confirmed | `audit-event.ts:179-188` matches the spec; mutation (always success) fails |
| 11 | db tests pass on every dialect | no | confirmed | `audit-context.db.test.ts` and `audit.db.test.ts` → 17 passed on SQLite, PostgreSQL, MySQL, MariaDB |
| 12 | An event recorded in `after()` keeps the request ID | no | confirmed | Next 16.4.3 `after-context.js:103` uses `bindSnapshot`; an ALS probe keeps `req-after`/`api` (inferred, not run in a live server) |
| 13 | Shared code not broken | no | confirmed | log, http, jobs, admin-audit → 560 passed, 4 skipped; `logger.ts:219-220` omits `requestId` when none |

**Overall:** met: every channel records the right `via`, request ID and client, the user agent is cut and cleaned, and outcomes follow the catalogue, on all four databases; every new test fails under its mutation.

### Adversarial pass

Witnessed: 2026-11-02 00:01 EST, by a fresh agent (adversarial). Commit: bd6ac657 + working tree (24 modified files, plus the untracked `audit-context.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `via` = `api` for `/api/v1` routes | no | confirmed | Route names come from the code; every `/api/v1` route passes its name to `apiRoute`; only `language` and `current-workspace` don't use it, and they record nothing |
| 2 | `via` = `scim` for `/api/v1/scim` | no | confirmed | M1 (no scim branch) → fails; 40 concurrent requests, half SCIM, half `/api/auth` → right channel on all 80 rows |
| 3 | `via` = `web` for server actions and the browser's own routes | no | confirmed | Every export of each `"use server"` file goes through `serverAction`; `/api/auth/**`, `/account/data`, `/notifications/*`, `/admin/users/[id]/data` → `web` |
| 4 | `via` = `cli` for the listed terminal commands | no | confirmed | Real `setup --yes` and `reset-root-password --yes` through tsx → `via:"cli"`, no request. Caveat: no repository test runs a script and reads `via` |
| 5 | `system` for jobs; `purge` from a terminal stays `cli` | no | confirmed | `run-job.ts:70-73`; M4, M5 each fail the job test |
| 6 | Null when nothing is known | no | confirmed | The web server never calls `setProcessChannel` (nothing in `src/` imports `scripts/`) |
| 7 | The recorded request ID equals the one in the log lines and `X-Request-Id` | no | not met | `next start` (TRUST_PROXY=false): `/notifications/count` and `/account/data` → the response header's ID differs from the route's log line; `/api/v1/me` matches. `proxy.ts` puts its ID on the response, and `apiRoute` makes a new one |
| 8 | A spoofed `X-Request-Id` without TRUST_PROXY isn't recorded; with it, only a well-formed one | no | confirmed | Probe: `attacker-chosen` → a ULID; with TRUST_PROXY `lb-123.abc_Z` kept, odd ones → ULID |
| 9 | No request ID for terminal commands and jobs | no | confirmed | `requestId: null` for `cli` and `system` |
| 10 | Events in `after()` keep the request ID | no | confirmed | `after-context.js:103` `bindSnapshot`; an ALS snapshot probe keeps it |
| 11 | User agent cut and cleaned | no | confirmed | Lone surrogates, NEL, BOM, ZWSP removed; 1M characters → 256 in 12 ms; U+2028 kept. M2, M3b, M7 each fail |
| 12 | Outcome as the catalogue says | no | confirmed | All of `AUDIT_ACTIONS`: exactly the six are not `success`; M6 fails |
| 13 | Callers of `recordAudit` don't change | no | confirmed | Signature unchanged; one insert, only from `recordAudit` |
| 14 | A channel-only context writes no `requestId` | no | partly | Behaviour holds (probe), but reverting `logger.ts` (M8, `"requestId":"undefined"`) passes every test |
| 15 | No context leaks between concurrent requests | no | confirmed | 40 concurrent calls, 80 rows, each with its own request's agent and channel |
| 16 | Done when: db tests through each channel | no | confirmed | 17 passed on SQLite, PostgreSQL, MySQL, MariaDB |
| 17 | Done when: a long and a control-character user agent | no | confirmed | "cuts and cleans the client"; fails under M2, M3b, M7 |
| 18 | Done when: `audit.db.test.ts` passes | no | confirmed | All four databases |

**Overall:** not met: on `/account/data`, `/admin/users/[id]/data` and `/notifications/*` the recorded request ID differs from `X-Request-Id` without TRUST_PROXY (row 7), and the logger change has no test (row 14).

### Re-check (rows 4, 7 and 14)

Witnessed: 2026-11-02 00:20 EST, by a fresh agent (adversarial). Commit: bd6ac657 + working tree (27 modified files, plus the untracked `audit-context.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | `via` = `cli` for terminal commands, and a test runs a real command and reads it | yes | confirmed | `scripts/reset-two-factor.db.test.ts` → 3 passed; M10 (no `setProcessChannel("cli")` in `scripts/reset-two-factor.ts`) → fails 1 of 3 |
| 7 | The recorded request ID equals the log lines' and `X-Request-Id` | yes | confirmed | Rebuilt and `next start` (TRUST_PROXY=false): `/notifications/count` and `/account/data` → the header and the log line match; a client's `X-Request-Id` is replaced there and on `/api/v1/me`; attempts through `x-middleware-subrequest` and `x-middleware-override-headers` are replaced too. M9 → the new test fails. `audit-context.db.test.ts` → 10 passed on all four databases |
| 14 | A channel-only context writes no `requestId` | yes | confirmed | `logger.test.ts` → 65 passed; M8 → the new test fails |
| 11 | The user agent also loses U+2028/U+2029 | yes | confirmed | `audit-event.ts:200`; M11 → "cuts and cleans the client…" fails |

**Overall:** met: browser routes outside `/api` record, log and return the proxy's ID; a sent ID isn't taken there or under `/api` without TRUST_PROXY; the logger and terminal-command behaviours each have a test that fails without them.

## Task 4 — The workspace on events

Witnessed: 2026-11-02 00:24 EST, by a fresh agent (blind). Commit: fb4d314b + working tree (21 files modified, uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `NewAuditEvent` has an optional `workspaceId`, stored in `audit_log.workspace_id` | no | confirmed | `audit-event.ts:174`; `audit.ts:51`; "stores it and reads it back" passes on SQLite, PG, MySQL, MariaDB |
| 2 | The catalogue marks `workspace.*`, `scope.*`, `item.*`, `submission.*`, `version.*`, `dist_tag.*`, `scan.*`, and `pin.*` only on a workspace | no | confirmed | `audit-event.ts:182-194`; the guard test compares the marked list with `AUDIT_ACTIONS`; `pin.added` on an instance → false |
| 3 | Under test, an `inWorkspace` event without a workspace throws | no | confirmed | `audit.ts:33`. M1 (no `workspaceId` in `reviews.ts`) → 141 submission db tests fail with the guard's message; M2 (guard off) → the guard test fails. An explicit `null` passes on purpose |
| 4 | The guard test passes; no `inWorkspace` action in the db suite lacks its workspace | no | confirmed | `vitest run --project db` → 198 files, 2035 passed, 0 failed; the guard's message 0 times in the log |
| 5 | Each call site records the right workspace | no | confirmed | Probe P1 over the whole db suite: 3437 events, 45 actions, each compared with the target's workspace in the database; all match but the expected cases (a deleted submission's row gone, the guard test's fake id, a personal workspace's request recorded null as its row is) and `scope.move_*` (finding). `pin.reordered` on a workspace shelf never runs; read `pins.ts:68,129` |
| 6 | `scope.moved` records the target workspace | no | confirmed | P1: all 33 equal the scope's workspace after the move; M3 (`source.id`) → `scope-move-requests.db.test.ts:194` fails |
| 7 | The domains' db tests pass on the three servers | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- …/{audit,submissions,items,scans,shelves,workspaces} …` → 65 files, 757 passed each |
| 8 | No foreign key on `workspace_id` | no | confirmed | `0043_audit_context.ts:39`, index only; a non-existent workspace id stored and read back on PG, MySQL, MariaDB |

**Overall:** met: every `inWorkspace` event in the suite carries its workspace and the probe shows it's the right one; the guard fails when one is left out; the domains' db tests pass on all four databases. Findings: `scope.move_requested`/`_declined`/`_cancelled` record the target while the scope is still in the source (a design question); no test records `pin.reordered` on a workspace shelf; only `item.moved` and `scope.moved` test the workspace's value.

### Re-check (rows 5 and 6, and the findings)

Witnessed: 2026-11-02 00:36 EST, by a fresh agent (blind). Commit: fb4d314b + working tree (22 files modified, plus SPEC.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Each call site records the right workspace; a scope move records where the scope is at the time | no | confirmed | P1 rerun over the db suite: 3440 events, 46 actions; only the expected mismatches of the first pass are left; no `scope.move_*` mismatch (46 before) |
| 6 | `scope.moved` records the target; `scope.move_requested`, `_declined`, `_cancelled` the source (SPEC edge case) | no | confirmed | `scope-moves.ts:536,648,750,799`; SPEC.md:106-109. M4 (`move_requested` → target) and M6 (`move_declined` → target) each fail `scope-move-requests.db.test.ts` |
| F1 | A workspace shelf's `pin.reordered` is now recorded in the suite | no | confirmed | New test in `pins.db.test.ts`; M5 (reorder with null) → fails |
| F2 | Tests check the workspace value for scope moves, item moves and pins | no | confirmed | Assertions for requested, declined, cancelled (×3 and asker_lost_role), moved, item.moved, each pin row; M4–M6 each fail one |
| 7 | The changed test files pass on all four databases | no | confirmed | SQLite → 86 passed, 1 skipped; `pnpm test:db:{postgres,mysql,mariadb}` → 87 passed each |

**Overall:** met: every `scope.move_*` event records where the scope is at the time, and every scope-move and pin action has a test that checks the workspace value and fails when it's wrong; the changed tests pass on all four databases.
