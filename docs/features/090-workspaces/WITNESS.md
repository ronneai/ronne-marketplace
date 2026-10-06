# 090 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Migration

Witnessed: 2026-10-06 15:35 EDT, by a fresh agent (blind). Commit: c975510 + the working tree as of about 15:47, before the fixes below. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0019_workspaces` exists and is registered | no | confirmed | `migrations/index.ts:45` → `"0019_workspaces": workspaces`; `db:migrate` on a fresh file → "applied 0019_workspaces, ✓ Applied 19 migrations" |
| 2 | `workspaces` has id, name (unique, 64), description (300), visibility, is_global (boolean), created_by (FK user, SET NULL), created_at, updated_at | yes | confirmed | `0019_workspaces.ts` createTable; the db test asserts `workspaces → user SET NULL` on all 4 databases; "refuses a second workspace with the same name" passes on all 4 |
| 3 | The migration creates `global`: public, is_global true, "Everyone on this instance", the only row | yes | confirmed | Fresh SQLite through `scripts/migrate.ts` → `00000000000000000000000000\|global\|Everyone on this instance\|public\|1\|\|…`; the db test (`toHaveLength(1)`) passes on all 4 |
| 4 | `scopes.workspace_id` is not null, FK to workspaces, ON DELETE RESTRICT | yes | confirmed | SQLite `pragma foreign_key_list(scopes)` → `workspaces\|workspace_id\|id\|NO ACTION\|RESTRICT`; the DDL has `not null`; the db test refuses a null or unknown workspace and deleting global, on PG, MySQL and MariaDB |
| 5 | PG and MySQL add the column nullable, fill it, then make it NOT NULL; SQLite rebuilds the table | yes | confirmed | The migration's add, `update … set global`, `setNotNull`/`modifyColumn notNull`; the SQLite rebuild is checked with `foreign_key_check` before commit |
| 6 | The FK is table-level (MySQL guard) | yes | confirmed | `vitest run migrations.guard.test.ts --reporter=verbose` → "0019_workspaces.ts declares foreign keys as table-level constraints ✓" |
| 7 | Every existing scope moves into global, keeping its columns and items, from an instance with scopes | yes | confirmed | The db test migrates to 0018, inserts 2 scopes and items, then asserts `scopesAfter == scopesBefore + workspace_id`; a 0018 SQLite file with a submission upgraded by `scripts/migrate.ts` → scopes in global, `foreign_key_check` empty, indexes present |
| 8 | Migration tests pass on SQLite | yes | confirmed | `vitest run --project db` → 68 files, 524 passed, 8 skipped; the same with `TEST_DATABASE_URL=file:<scratch>/t.db` |
| 9 | Migration tests pass on PostgreSQL | yes | confirmed | `pnpm test:db:postgres` → 68 files, 532 passed |
| 10 | Migration tests pass on MySQL | yes | confirmed | `pnpm test:db:mysql` → 68 files, 532 passed |
| 11 | Migration tests pass on MariaDB | yes | confirmed | First full run: 3 non-migration files failed before any test ran, cause not captured; alone → 50 passed; second full run → 532 passed |
| 12 | Setup creates nothing extra; a new instance has `global` from the migration | yes | confirmed | `grep -i 'scope\|workspace' apps/web/src/server/setup/*.ts` (non-test) → none; `steps.ts:176-183` only runs `migrateToLatest`; a fresh database has `global` |
| 13 | Every code path inserting into `scopes` sets workspace_id | yes | confirmed | `git grep 'insertInto("scopes")'` → 12 sites, all set `workspace_id: GLOBAL_WORKSPACE_ID`; `pnpm --filter @ronneai/web typecheck` → clean |
| 14 | (tree after the fixes) SQLite: a failed run leaves the database as it was and runs again once the data is fixed; foreign keys back on | yes | confirmed | `scratchpad/fail.mts`: an item pointing at a missing scope → "1 rows of items point at rows that don't exist…"; afterwards no `workspaces`, no `scopes_new`, `foreign_keys` = 1; delete the row, rerun → applied |
| 15 | (tree after the fixes) MySQL/MariaDB: a run stopped at any step can be rerun | yes | confirmed | `scratchpad/stop.mts` stops `up` at query k = 1..10, then `migrateToLatest` → all rerun OK on MySQL 8.4 and MariaDB |
| 16 | (tree after the fixes) PostgreSQL runs 0019 in one transaction | yes | confirmed | `fail.mts` with a conflicting index → fails; no `workspaces`, no `scopes.workspace_id` after; drop the index, rerun → applied |
| 17 | (tree after the fixes) The 0019 db test passes on all four databases | yes | confirmed | `vitest run --project db …0019…` and `pnpm test:db:{postgres,mysql,mariadb} -- …0019…` → 9 passed on each |

**Overall:** met. Rows 1–13 checked the tree before the fixes, so a fresh blind pass follows. Remark taken: the MySQL foreign key lookup now also filters on `table_name = 'scopes'`.

Witnessed: 2026-10-06 15:49 EDT, by a fresh agent (adversarial). Commit: c975510 + uncommitted working tree, before the fixes. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration tests pass on SQLite in memory | yes | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db` → 68 files, 524 passed, 8 skipped |
| 2 | Migration tests pass on SQLite on a file (WAL) | yes | confirmed | `TEST_DATABASE_URL=file:<scratch>/x.db vitest run --project db` → 524 passed; `pragma journal_mode` → `wal`, `integrity_check` → ok |
| 3 | Migration tests pass on PostgreSQL | yes | confirmed | `pnpm test:db:postgres` → 68 files, 532 passed |
| 4 | Migration tests pass on MySQL | yes | confirmed | `pnpm test:db:mysql` → 68 files, 532 passed |
| 5 | Migration tests pass on MariaDB | yes | confirmed | `pnpm test:db:mariadb` → 68 files, 532 passed |
| 6 | The tests start from an instance with scopes (and items) | no | confirmed | `0019_workspaces.db.test.ts:24-68`; mutations in a scratch copy caught: cascade instead of restrict → 1 failure; `foreign_keys = on` removed → 2; no rows copied → 7 |
| 7 | `workspaces` columns as the spec says | no | confirmed | PG `information_schema`/`pg_constraint`: varchar 26/64/300/16, boolean, timestamptz, unique name, `created_by` SET NULL; MySQL/MariaDB `show create table`: the same with tinyint(1), utf8mb4 |
| 8 | The `global` row: `public`, `is_global` true, the only row | yes | confirmed | Probe on all 4 databases → one row `{id:'000…0', name:'global', visibility:'public', is_global:1/true, created_by:null}` |
| 9 | `scopes.workspace_id` NOT NULL, FK to workspaces, RESTRICT, on every dialect | no | confirmed | PG `ON DELETE RESTRICT`, not nullable; MySQL/MariaDB `referential_constraints` → RESTRICT; SQLite DDL `not null` and `on delete restrict` |
| 10 | PG/MySQL: added nullable, filled, then NOT NULL; table-level FK | yes | confirmed | `0019_workspaces.ts:107-138`; guard test → 20 passed. SQLite rebuilds instead; the plan should say so |
| 11 | Every scope moves to global with its data unchanged (Unicode, CRLF, emoji) | no | confirmed | `probe2.mts 2000` on PG, MySQL, MariaDB, SQLite memory and file → `rows 2000 equal: true all global: true` |
| 12 | Items and submissions keep their FKs to scopes on every dialect | no | confirmed | SQLite `pragma_foreign_key_list` → scopes RESTRICT, `foreign_key_check` → 0; PG and MySQL/MariaDB list both keys |
| 13 | Indexes and constraints on `scopes` are kept | no | confirmed | PG: pkey, name key, `scopes_workspace_id_idx`; MySQL/MariaDB: PK, unique name, `scopes_created_by_fk`, the new index; SQLite: PK and the unique autoindex |
| 14 | SQLite foreign keys are back on after the migration (success and failure) | no | confirmed | Probe → `pragma foreign_keys` = 1 after both |
| 15 | A failure halfway leaves a database the next start can migrate | yes | partly | SQLite: `scopes` rolls back, but `workspaces` stays (created outside the transaction), and every rerun fails `table "workspaces" already exists`. MySQL has the same non-transactional shape |
| 16 | A database restored from before the migration gets `global` on start | no | confirmed | `prepare-start.ts:48` and `steps.ts:180` call `migrateToLatest`; from a 0018 database → `applied: ['0019_workspaces']` |
| 17 | A new instance's setup has `global`; setup creates nothing extra | no | confirmed | `tsx setup.mts file:<scratch>/fresh.db` → one `global` row; `rg workspaces apps/web/src/server/setup` → none |
| 18 | No code path that inserts scopes fails now | yes | confirmed | `rg 'insertInto\("scopes"\)'` → the repository, `feed-benchmark.ts` and tests all set `workspace_id`; `tsc --noEmit` → 0 |

**Overall:** not met: on SQLite a failed rebuild leaves `workspaces` behind and every later start fails (row 15). Also flagged: `foreign_key_check` checked the whole database, and the plan's wording didn't mention the SQLite rebuild. All three fixed below.

### Re-check after fixes

Witnessed: 2026-10-06 16:08 EDT, by a fresh agent (adversarial). Commit: c975510 + uncommitted working tree (0019 and its test reworked, PLAN.md task 1 and Notes). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | All db tests pass on SQLite (memory and file), PostgreSQL, MySQL and MariaDB | yes | confirmed | `pnpm test:db:postgres` / `:mysql` / `:mariadb` → 68 files, 534 passed each; `vitest run --project db` → 526 passed, 8 skipped, in memory and on a file; guard → 20 passed; `tsc` → 0 |
| 2 | SQLite: a failed run leaves the database as it was | yes | confirmed | `probe.mts file:p3.db violation` → fails naming items; afterwards only `scopes`, `foreign_keys` = 1. Moving `createWorkspaces` back before `begin` in a scratch copy → the new test fails |
| 3 | SQLite: it runs again once the data is fixed | yes | confirmed | Delete the orphan, `rerun.mts` → `applied ['0019_workspaces']`, all scopes in global |
| 4 | SQLite: a process killed mid-run (file, WAL, 200,000 scopes) leaves a database the next start migrates | no | confirmed | `sqkill.mjs` SIGKILL at 500–1500 ms: `integrity_check` ok, 200,000 scopes, rerun → all in global, `foreign_key_check` empty |
| 5 | MySQL/MariaDB: a run stopped between any two steps can be rerun | yes | confirmed | `partial.mts` runs the first k of 7 steps, k = 0..7, then `migrateToLatest` → all 16 cases applied, 1 workspace, 1 RESTRICT FK, one index |
| 6 | MySQL/MariaDB: a real kill mid-run (50,000 scopes) can be rerun | yes | confirmed | `killer.mjs` SIGKILL at 600–1300 ms; every rerun → applied or `[]`, 50,000 in global, FKs `[user SET NULL, workspaces RESTRICT]` |
| 7 | The MySQL test catches a step that isn't rerun-safe | no | confirmed | Index guard replaced with `if (true)` → "every step is safe to run again" fails on MySQL 8.4 |
| 8 | PostgreSQL runs it in one transaction | yes | confirmed | `pgfail.mts` plants a conflicting index → fails; no `workspaces`, no `workspace_id` after; drop it, rerun → applied |
| 9 | The FK check covers only scopes, items and submissions, naming the table | yes | confirmed | An orphan `session` row → the migration applies; an orphan item → "1 rows of items point at…" |
| 10 | PLAN task 1 describes the SQLite rebuild | no | confirmed | `PLAN.md` task 1: "SQLite, which can't add NOT NULL or a foreign key to a table, rebuilds `scopes`" |
| 11 | `global` has the fixed id `00000000000000000000000000`, exported by the migration | yes | confirmed | `0019_workspaces.ts:11`; every probe → that id |
| 12 | Until task 3 the repository puts new scopes in `global`; every raw scope insert sets `workspace_id` | yes | confirmed | `kysely-scope-repository.ts:78`; `rg 'insertInto\("scopes"\)'` → all 13 sites set it (the 0019 test's pre-migration insert on purpose doesn't) |

**Overall:** met.

### Fresh blind pass on the current tree

Witnessed: 2026-10-06 16:04 EDT, by a fresh agent (blind). Commit: c975510 + uncommitted working tree after the fixes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0019_workspaces` is registered after 0018 | no | confirmed | `pnpm db:migrate` on a fresh SQLite file → "applied 0019_workspaces … Applied 19 migrations" |
| 2 | `workspaces` columns match the spec: name unique 64, description 300, visibility, is_global boolean, created_by FK to user SET NULL, timestamps | yes | confirmed | Probe of information_schema (pg, mysql, mariadb) and `sqlite_master` → types, lengths, NOT NULL, unique and FK as specified |
| 3 | `global` has fixed id `000…0`, `public`, is_global true, "Everyone on this instance", created_by null | yes | confirmed | Probe on all 4 databases → exactly one row with those values; `0019_workspaces.ts:38-51` |
| 4 | `scopes.workspace_id` is NOT NULL, FK to workspaces RESTRICT, indexed | yes | confirmed | `pragma foreign_key_list(scopes)` → `workspaces … RESTRICT`; pg/mysql/mariadb `workspace_id NO`; "enforces the keys" test passes on all 4 |
| 5 | Every existing scope moves into `global`, other columns and items kept | no | confirmed | Probe from 0018 with 50 scopes → `n:50` in global on all 4; Unicode+CRLF description kept |
| 6 | PG/MySQL add the column nullable, fill it, then set NOT NULL | no | confirmed | `0019_workspaces.ts:142-158`: addColumn, update where null, then setNotNull/modifyColumn |
| 7 | SQLite rebuild: FKs off, one transaction, foreign_key_check, FKs back on; a failed run changes nothing | yes | confirmed | `0019_workspaces.ts:66-115`; "a failed run changes nothing" test → no `workspaces` or `scopes_new` afterwards, foreign_keys=1, rerun applies |
| 8 | Table-level FKs for MySQL; guard test covers 0019 | no | confirmed | `vitest run migrations.guard.test.ts` → "0019_workspaces.ts declares foreign keys as table-level constraints ✓" |
| 9 | MySQL/MariaDB: a run stopped partway can be rerun | yes | confirmed | Probe with the column and index already added → migrates, 50 scopes in global, NOT NULL, on both |
| 10 | Setup creates nothing extra; a new instance gets `global` from the migration | yes | confirmed | `steps.ts:180` and `prepare-start.ts:48` only call `migrateToLatest`; fresh `db:migrate` → global row present |
| 11 | A database restored from before the migration gets `global` on start | no | confirmed | `migrateToLatest` from 0018 with data on all 4 → global created; `prepare-start.ts:48` runs it on start |
| 12 | The scope repository puts every new scope in `global` | yes | confirmed | `kysely-scope-repository.ts:78` → `workspace_id: GLOBAL_WORKSPACE_ID`; repository db tests pass on all 4 |
| 13 | Done when: migration tests pass on the four databases (SQLite in memory and on a file), starting from an instance with scopes | yes | confirmed | `--project db` → 526 passed, 8 skipped; `test:db:postgres`, `:mysql`, `:mariadb` → 534 passed each; SQLite file → 9/9 for 0019 |
| 14 | PostgreSQL runs 0019 in one transaction: a failed run leaves nothing behind | yes | confirmed | Probe: pre-made `scopes_workspace_id_idx` → "relation … already exists"; then `workspaces` doesn't exist and scopes has no `workspace_id` |
| 15 | Every raw `insertInto("scopes")` in tests and `feed-benchmark.ts` sets `workspace_id` | yes | confirmed | grep → all 12 sites set it, except the 0019 test's insert from before the migration (column not there yet) |

**Overall:** met. Remark: nothing in the schema keeps `is_global` to one row; task 2's services must never set it.
