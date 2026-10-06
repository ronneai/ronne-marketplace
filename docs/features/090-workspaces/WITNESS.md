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

## Task 2 — Names and the domain

Witnessed: 2026-10-06 16:20 EDT, by a fresh agent (blind). Commit: d024d30 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Workspace names follow the scope rule (a-z, 0-9, inner hyphens, 1 to 64) without `@` | yes | confirmed | `names.ts:36-45` same checks for `"workspace"`; `@acme` → `characters`; `vitest run src/names.test.ts` → 7 passed |
| 2 | `global` plus the scopes' reserved names are reserved for workspaces only | yes | confirmed | `names.ts:29` `["global", ...RESERVED_SCOPES]`; names.test covers each and `global` stays valid for scopes; db test: `global`/`admin` → `InvalidWorkspaceNameError` |
| 3 | `@ronneai/core` exports the new name API | no | confirmed | `packages/core/src/index.ts` diff: `NameKind`, `normalizeWorkspaceName`, `RESERVED_WORKSPACES` |
| 4 | Domain folders exist; services use the repository interface, not Kysely; arrow functions only | no | confirmed | `workspaces/{actions,services,models,repositories,exceptions}`; grep for `function`/`kysely` in services and models → none; biome on touched files → clean |
| 5 | `workspaces.manage` is root only, in `permissions.ts` | no | confirmed | `permissions.ts:17` `["root"]`; permissions, summary and audit tests → 26 passed |
| 6 | Create works and is audited (`workspace.created`) | yes | confirmed | db test "creates a public workspace…" → 14/14 on SQLite, PostgreSQL, MySQL and MariaDB |
| 7 | Edit changes only the description and is audited with from/to; an unchanged save writes no event | yes | confirmed | db test passes; with the update's audit call removed (scratch copy) the test fails |
| 8 | Delete removes an empty workspace and is audited (`workspace.deleted`) | yes | confirmed | db test "deletes an empty workspace…" passes on all 4 databases |
| 9 | Delete refuses a workspace with scopes (`WorkspaceNotEmptyError`) | yes | confirmed | `scopes > 0` check; with it removed, "refuses a workspace that has scopes" fails |
| 10 | `global` can't be edited or deleted (`GlobalWorkspaceError`); the repository also filters `is_global = false` | yes | confirmed | `changeable()` plus repository `.where("is_global",…false)`; with the global check removed, 2 tests fail |
| 11 | Only root may create, edit, delete, page or open; moderator, user and signed-out are refused | yes | confirmed | db test "who may" → `ForbiddenError`; with delete's permission check dropped, or moderator granted, the test fails |
| 12 | `listWorkspaces` is open to everyone signed in, `global` first, then by name | yes | confirmed | db test → `["global","acme","zeta"]` for user, moderator and root; signed-out → Forbidden |
| 13 | `pageWorkspaces`: `global` first, sorted by name, paged, searches name and description | yes | confirmed | db tests "puts global first…" and "searches…" pass on all 4 databases |
| 14 | Same-name race: the unique index decides and the second create gets `WorkspaceNameTakenError` | yes | confirmed | `0019_workspaces.ts:19` unique; with the catch removed the race test fails on MySQL and MariaDB but passes on SQLite and PostgreSQL |
| 15 | Audit model has the 3 actions, group and target type; summaries read them | no | confirmed | `audit-event.ts` diff; summary.test → "Created workspace acme" etc. |
| 16 | Lint and typecheck clean | yes | confirmed | `pnpm lint` → 0 errors (no warnings in touched files); `pnpm typecheck` → 7/7 |
| 17 | Create accepts only `public` until 093 (`InvalidWorkspaceVisibilityError`) | yes | confirmed | `workspaceVisibilityFrom`; db test: `visibility: "private"` → `InvalidWorkspaceVisibilityError`, on all 4 databases |

**Overall:** met. Remarks taken: the total changed between pages (counted global only on page 1), and the race test only bit on MySQL; both fixed below.

### Re-check after fixes

Witnessed: 2026-10-06 16:28 EDT, by a fresh agent (blind). Commit: d024d30 + working tree (fingerprint 941d273e47f4, unchanged 16:27–16:28). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pageWorkspaces`' total is the same on every page (`global` counted whenever the search matches it) | yes | confirmed | db test `second.total` equals `first.total`; making the count page-dependent again → "puts global first…" fails |
| 2 | `global` is listed first only on a page with nothing before it, also through a previous cursor | yes | confirmed | db test "back" case; with `global` on every page that test fails |
| 3 | The name-race fallback is tested on every database, through a unit test with a fake repository | yes | confirmed | `vitest run src/server/domains/workspaces/services` → 3 passed; with the catch removed, "answers that the name is taken…" fails |
| 4 | Edit, delete and open trim, lowercase, check the name rule and compare byte for byte: `ACME` finds acme, `ａｃｍｅ` nothing | yes | confirmed | `byName`; db test "finds a workspace by its name as typed…" 15/15 on 4 databases; byte compare removed → fails on MySQL |
| 5 | A delete that loses a race with a new scope answers `WorkspaceNotEmptyError` after a recount | yes | confirmed | unit test "…scope lands after the count" passes; recount removed → fails; the FK refuses the delete on all 4 databases |
| 6 | The service db tests pass on SQLite, PostgreSQL, MySQL and MariaDB | yes | confirmed | `vitest --project db` plus `pnpm test:db:{postgres,mysql,mariadb} -- src/server/domains/workspaces` → 15/15 each |
| 7 | Lint and typecheck are clean | yes | confirmed | `pnpm lint` exit 0; `pnpm typecheck` exit 0 |

**Overall:** met. Remark taken: two stale comments above `byName` and `changeable`, fixed.

Witnessed: 2026-10-06 16:20 EDT, by a fresh agent (adversarial). Commit: d024d30 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Workspace names follow the scope rule (a–z, 0–9, `-`, 1–64), stored without `@` | yes | confirmed | `names.test.ts` 7 passed; probe on 4 dialects: `@acme`, `acme_x`, ZWSP, Cyrillic, fullwidth → InvalidWorkspaceNameError |
| 2 | Reserved: `global` plus the scopes' list, in any case or padding; workspaces only | yes | confirmed | `names.ts:29`; probe `GLOBAL`/`Global`/` global `/`Admin` → "That name is reserved." on 4 dialects |
| 3 | A workspace and a scope may share a name | no | confirmed | db test "allows a workspace and a scope to share a name" passes on 4 dialects |
| 4 | The domain has the five services and `GlobalWorkspaceError` | no | confirmed | `services/workspaces.ts` exports all five; `exceptions/errors.ts:43` |
| 5 | `workspaces.manage` is root only; moderator, user, signed out and a disabled root are refused | yes | confirmed | `permissions.ts:17`; "who may" passes; moderator mutant fails it; disabled root's cookie → ForbiddenError |
| 6 | Create, public only, audited with name, description and visibility | yes | confirmed | probe audit metadata `{"name":"acme","description":"Old","visibility":"public"}`; `private` → InvalidWorkspaceVisibilityError |
| 7 | Edit description audited from/to; unchanged not audited | no | confirmed | db test passes on 4 dialects; probe metadata `{"from":"Old","to":"New"}` |
| 8 | Delete empty, audited `workspace.deleted` | no | confirmed | db test passes on 4 dialects; mutant dropping the audit fails it |
| 9 | Delete with scopes refused (`WorkspaceNotEmptyError`), no audit | no | confirmed | `services/workspaces.ts:138`; mutant `if (false)` fails "refuses a workspace that has scopes" |
| 10 | A scope added during a delete is refused cleanly | yes | partly | stale-count probe: workspace kept, 0 orphans, but a raw FK error on all 4 dialects |
| 11 | `global` can't be edited or deleted by any spelling or through the repository | yes | confirmed | variants → NotFound (sqlite, pg) or GlobalWorkspaceError (mysql); repo update/delete on GLOBAL_ID no-op |
| 12 | Name race: one wins, others get WorkspaceNameTakenError, one audit | yes | confirmed | 8 concurrent creates → 1 fulfilled, rest NameTaken, on 4 dialects; the test catches a removed catch only on MySQL |
| 13 | Audit events registered and summarised | no | confirmed | `audit-event.ts:21-23,56,74`; `summary.ts:110-112`; 21 unit tests passed |
| 14 | `listWorkspaces`: signed in only, `global` first, then by name | yes | confirmed | probe → `global, alpha, bravo, charlie` on 4 dialects; signed out → ForbiddenError |
| 15 | `pageWorkspaces`: `global` first in any sort or direction, keyset, search, literal wildcards | yes | confirmed | desc `[global,charlie,bravo]`; back to page 1 shows global; `%`/`_` literal, on 4 dialects |
| 16 | `pageWorkspaces`' total is the same on every page | yes | not met | sqlite: page 1 total 5, page 2 total 4 |
| 17 | Update and delete look names up the same way on every dialect | yes | partly | `updateWorkspace({name:"ACME"})` edits `acme` on mysql and mariadb, NotFound on sqlite and pg |
| 18 | *Done when* tests exist and catch regressions | yes | confirmed | 14 passed on 4 dialects; mutants in rows 5, 8, 9, 11 each turn a test red |
| 19 | Lint and typecheck clean | yes | confirmed | `biome check` 35 files, no fixes; web and core `typecheck` clean |

**Overall:** not met: the total changes between pages, a delete racing a new scope gives a raw DB error, and name lookup depends on the dialect. (Rows 10, 16 and 17 say `yes` because the notes describe the fixed state; they were written after this pass.)

### Re-check after fixes

Witnessed: 2026-10-06 16:29 EDT, by a fresh agent (adversarial). Commit: d024d30 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Total is the same on every page, in any sort, direction or search | yes | confirmed | probe: every page `#7` for name, desc, created and search `e`, on all 4 dialects; page-1-only mutant fails the db test |
| 2 | `global` is first on any page with nothing before it, also reached by a previous cursor | yes | confirmed | page 1 starts `global` in 4 orders on 4 dialects; other pages show no `global` |
| 3 | A delete that loses a race with a new scope answers WorkspaceNotEmptyError | yes | confirmed | stale count → WorkspaceNotEmptyError, scope kept, 0 delete audits, on 4 dialects; mutant fails `services/workspaces.test.ts` |
| 4 | Lookup is normalised and the same on every dialect | yes | confirmed | `ACME`/` acme `/`Acme\t` find `acme`, `ａｃｍｅ`/Kelvin `Kcme` don't, identically on sqlite, pg, mysql, mariadb |
| 5 | `global` still refused by any spelling after the lookup change | yes | confirmed | `GLOBAL`/`Global`/` global ` → GlobalWorkspaceError; fullwidth/Cyrillic → NotFound; description unchanged |
| 6 | Byte-for-byte name comparison | yes | confirmed | `services/workspaces.ts:60`; belt and braces: `isValidName` already rejects lookalikes |
| 7 | Name race answers WorkspaceNameTakenError on every dialect, forced by a unit test | yes | confirmed | `racingRepo` test; removing the catch fails it on sqlite; real 8-way race → 1 win, rest NameTaken, on 4 dialects |
| 8 | No regressions: the domain's tests pass on all four databases | yes | confirmed | `TEST_DATABASE_URL=… vitest run src/server/domains/workspaces` → 18 passed on each |
| 9 | Lint and typecheck clean | yes | confirmed | `biome check` 9 files, no fixes; `pnpm --filter @ronneai/web typecheck` clean |

**Overall:** met.
