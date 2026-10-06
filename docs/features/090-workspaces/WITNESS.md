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

## Task 3 — Scopes in a workspace

Witnessed: 2026-10-06 16:42 EDT, by a fresh agent (blind). Commit: e4bed45 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `createScope` (action and service) takes an optional `workspaceId`; without one the scope goes in `global` | yes | confirmed | `services/scopes.ts:34` uses `input.workspaceId \|\| GLOBAL_WORKSPACE_ID`; the test "creates a scope from what root typed" expects global and passes |
| 2 | A new scope is created in the chosen workspace, which then can't be deleted (FK RESTRICT) | yes | confirmed | Test "creates a scope in the workspace root chose" passes (and `deleteWorkspace` throws `WorkspaceNotEmptyError`); hard-coding global in a scratch copy → 2 tests fail |
| 3 | A `workspaceId` that doesn't exist is refused, and no scope or event is created | yes | confirmed | `services/scopes.ts:35` throws `ScopeWorkspaceNotFoundError`; test "refuses a workspace that doesn't exist" passes, and fails under that mutation |
| 4 | The scope repository returns each scope's workspace (`Scope.workspace {id,name}`), and `insert` stores `workspaceId` | yes | confirmed | `kysely-scope-repository.ts`: inner join on `workspaces`, `toScope` maps `workspace`, insert writes `workspace_id: scope.workspaceId`; asserted in the tests |
| 5 | Audit `scope.created` gains `workspace` | yes | confirmed | `services/scopes.ts:49` metadata includes `workspace: workspace.name`; removing it in a scratch copy → 2 tests fail |
| 6 | `GET /api/v1/scopes` returns `workspace` for each scope | yes | confirmed | `drafts-api.ts:71-75` adds `workspace: scope.workspace.name`; the route calls `getScopes`; deleting that line in a scratch copy → the "for every role" test fails |
| 7 | Scope tests and the API test pass on all four databases | yes | confirmed | SQLite db project → 4 files, 62 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb` on scopes and drafts-api → 37 passed each |
| 8 | Every caller of the repository's `insert` passes a workspace, and nothing else broke (lint, typecheck, tests) | yes | confirmed | grep: e2e seed and tests pass `GLOBAL_WORKSPACE_ID`, `feed-benchmark.ts:83` writes `workspace_id`; `pnpm lint` → 0 errors; web typecheck clean; web vitest → 1549 passed, 8 skipped |
| 9 | `rmk` export and the MCP server's export tools read the endpoint, use only name and description, and the MCP's structured answer now carries `workspace` | yes | confirmed | `packages/cli/src/export.ts:713-722` `fetchScopes` reads only name/description; `packages/mcp/src/export-tools.ts:102-113` prints `@name description` and returns `{ needs, scopes }` unchanged |
| 10 | The workspace is looked up in the same transaction as the insert | yes | confirmed | `services/scopes.ts:33-35`: `findWorkspace` runs inside `deps.repo.transaction(…)`, before `findByName` and `insert` |
| 11 | `pnpm build` passes | yes | confirmed | `turbo run build --force` in a scratch copy of the working tree → 5 of 5 tasks successful, none cached |

**Overall:** met. Remark taken: the first version of the notes said `rmk` and the MCP server don't read `GET /api/v1/scopes`; they do (corrected in PLAN.md before the commit).

## Task 4 — Admin › Workspaces

Witnessed: 2026-10-06 16:48 EDT, by a fresh agent (blind). Commit: daafd08 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The component tests pass, and they cover what they claim | yes | confirmed | `vitest run src/features/admin-workspaces` → 15 passed; four mutations in a scratch copy (Delete never disabled, global shows actions, no root check on either page) each failed 1–2 tests |
| 2 | The phone sweep passes on the new pages | yes | confirmed | `next build` then `playwright test mobile-sweep --project=phone --project=phone-webkit --project=tablet` → 15 passed; `e2e/pages.ts` adds both routes for root |
| 3 | A non-global workspace's page and the dialog don't overflow on phones | yes | confirmed | scratch Playwright probe on phone and phone-webkit: list, New workspace dialog and `/admin/workspaces/acme-*` (with Edit and Delete) "ok" at 412/393, 360 and 320px |
| 4 | The table is on `DataTable` with name, visibility, scopes and created, sorted by name, `global` first (members come in 092) | yes | confirmed | `WorkspacesTable.tsx:42-96` (also a Description column); probe rows: `global … Public 1 \| acme-phone … Public 0` |
| 5 | New workspace takes name, description and visibility, and offers only Public | yes | confirmed | hidden `visibility=public`; probe: 0 select/radio in the dialog; `workspace.ts:48-51` refuses anything but public |
| 6 | Creating works end to end and normalises the name | no | confirmed | probe typed `ACME-PHONE` → "Created acme-phone." and the row appears after reload |
| 7 | The workspace page shows its description (editable) and only its scopes | yes | confirmed | probe: Edit description → "Description saved."; `[name]/page.tsx:51` passes `workspaceId`; "pageScopes in a workspace (090)" passes on SQLite, PG 15, MySQL 8.4, MariaDB 10.11 |
| 8 | Delete works only when the workspace has no scopes; otherwise it's disabled with "Move or remove its scopes first." | yes | confirmed | `disabledReason`; component test checks `disabled=""` and the reason; probe: empty workspace deleted, back to the list, its page then 404 |
| 9 | Global's page shows no edit or delete | yes | confirmed | probe on `/admin/workspaces/global`: buttons are only `["Menu","Edit @e2e-seeded"]` and the "can't be changed or deleted" text |
| 10 | `global` can't be edited or deleted by calling the services | no | confirmed | `changeable()` throws `GlobalWorkspaceError`; workspaces db tests "refuses global…" pass on all 4 dialects |
| 11 | Nobody but root can reach the pages, the actions or the nav entry | yes | confirmed | probe: member and moderator get 404 on both pages, no Workspaces link; `workspaces.manage: ["root"]`; services throw `ForbiddenError` for non-root |
| 12 | UI rules: tokens only, flat, arrow functions, feature-first | no | confirmed | grep for hex/rgb/shadow/raw palette/`function` in the new files → none; `biome check` and typecheck clean |

**Overall:** met. Remark taken: the sweep only opened `global`'s page, which has no buttons; fixed below.

### Re-check after fixes

Witnessed: 2026-10-06 16:59 EDT, by a fresh agent (blind). Commit: daafd08 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The seed adds an empty workspace `e2e-team`, and the phone sweep opens its page | yes | confirmed | `e2e/seed.ts:56-62` inserts it; `e2e/pages.ts:77` sweeps `/admin/workspaces/${E2E_WORKSPACE}`; probe → 200, 0 scope rows |
| 2 | That page has Edit description and Delete, both enabled | yes | confirmed | probe buttons on phone and phone-webkit → `["Menu"],["Edit description"],["Delete"]`, none disabled |
| 3 | The Edit button's accessible name is its visible text "Edit description" | yes | confirmed | probe: `aria-label` null, `getByRole("button",{name:"Edit description",exact:true})` enabled |
| 4 | The component tests pass | yes | confirmed | `vitest run src/features/admin-workspaces` → 15 passed |
| 5 | The phone sweep passes, the new page included | yes | confirmed | `playwright test mobile-sweep --project=phone --project=phone-webkit --project=tablet` → 15 passed |
| 6 | The full end-to-end suite passes | yes | confirmed | `pnpm exec playwright test` (apps/web, current build) → 91 passed (1.8m) |
| 7 | Lint, typecheck, test and build pass | yes | confirmed | `pnpm lint` exit 0; `pnpm typecheck` 7/7; `pnpm test` 8/8 tasks; `pnpm build` 5/5 |
| 8 | An unknown name is a 404, and a malformed `%` is a 500 from Next.js (shared, out of scope) | yes | confirmed | probe as root: `/admin/workspaces/nope` → 404, `/admin/workspaces/%` → 500 |
| 9 | Search and both sorts are kept in the URL, and the scope table pages on the workspace page's own address | yes | confirmed | `/admin/workspaces?q=team&sort=created` → only `e2e-team`; component tests assert the hrefs |
| 10 | The scope list has a `workspaceId` filter in the repository and `pageScopes` | yes | confirmed | `kysely-scope-repository.ts:52-54`, `services/scopes.ts:132,138`; db test on 4 dialects |
| 11 | Admin nav has Workspaces before Scopes | yes | confirmed | `AdminNav.tsx:10`; component test "has Workspaces, before Scopes" passes |
| 12 | Members column and help topic aren't built yet (wait for 092 and task 7) | yes | confirmed | `grep -i member` in the new files → none; no workspaces entry in `components/help/topics.ts` |

**Overall:** met.

Witnessed: 2026-10-06 16:56 EDT, by a fresh agent (adversarial). Commit: daafd08 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests pass and cover the claims | yes | confirmed | 15 passed; 6 mutations in a scratch copy each turned a test red (global's Edit shown, page auth removed on both pages, `workspaceId` dropped, always redirect, list path not its own) |
| 2 | The phone sweep passes and includes both new pages | yes | confirmed | `playwright test mobile-sweep` on 3 projects → 15 passed; a probe got 200 on both as root (the sweep doesn't assert status) |
| 3 | A non-global workspace page (with Edit and Delete) doesn't scroll sideways on phones | yes | confirmed | Probe at 412, 360 and 320px: `measureOverflow` → none |
| 4 | The list shows name (linked), visibility, scopes and created, sorted by name, `global` first | yes | confirmed | Probe rows `["global…Public 1","busy…Public 60"]`; `?sort=created` still has global first |
| 5 | New workspace has name, description and visibility, and offers no Private | yes | confirmed | only a hidden `visibility=public`; direct call with `private` → "Workspaces are public for now." |
| 6 | Create validates input from hostile clients | no | confirmed | Direct calls as root: `Global` → reserved, `Ｆull` → refused, ` Busy-WS ` → `busy-ws`, duplicate → taken, 301×`é` → refused |
| 7 | The workspace page shows its description (editable) and only its own scopes | yes | confirmed | 60 scopes in `busy2` → "60 scopes", rows 50 then 10, no `@e2e-seeded`; edit saved |
| 8 | The scope table pages, sorts and searches on the workspace page's own address | yes | confirmed | next href `/admin/workspaces/busy2?cursor=…` → s50–s59; `?sort=created&q=s05` → `@busy2-s05` only |
| 9 | The scope `workspaceId` filter is right on all dialects | yes | confirmed | `test-db.mjs postgres\|mysql\|mariadb …scopes.db.test.ts …workspaces` → 27 passed each; SQLite 30 |
| 10 | Delete is disabled with "Move or remove its scopes first." while the workspace has scopes | yes | confirmed | `busy` (60 scopes): `disabled=true`, `aria-describedby` and `title` give the reason; on touch screen readers only (shared `Button`) |
| 11 | The action refuses to delete a non-empty workspace, and an error doesn't redirect | no | confirmed | Direct call → "Move or remove its scopes first.", row kept; redirects only on `done` |
| 12 | Deleting an empty workspace returns to the list | yes | confirmed | UI delete → `/admin/workspaces`, rows `["global"]`; again → doesn't exist |
| 13 | `global` has no Edit or Delete in the UI | yes | confirmed | `global`, `GLOBAL`, `Global%20`, `%20global` → 200 with no Edit-description or Delete buttons |
| 14 | `global` can't be edited or deleted through the actions or services | no | confirmed | As root with `global`, ` GLOBAL `, `Global` → "The global workspace can't be changed or deleted."; tampered posts refused |
| 15 | Nobody but root can reach the pages | yes | confirmed | Member and moderator → 404 on the list, `/global` and `/<new>`; signed out → `/sign-in?next=…` |
| 16 | Nobody but root can run create, update or delete through direct server-action calls | no | confirmed | `Next-Action` posts as member and moderator → "You don't have permission… (workspaces.manage)"; nothing changed |
| 17 | Odd names in the URL give a 404 and don't crash | yes | partly | `%25`, `%2Fglobal`, `..%2Fusers`, 3000×`a`, `%00`, Cyrillic → 404; malformed `%E0%A4%A`, `%C0%AF`, `%ZZ` → 500, also on `/reviews/…`, `/submissions/…`, `/items/…` (Next.js-wide) |
| 18 | The admin nav has Workspaces, for root only | yes | confirmed | `AdminNav.tsx:10`; the admin layout 404s without `users.view` |
| 19 | Design rules: tokens, no raw colours, accessible names | yes | partly | No raw colours; Biome and tsc clean; the Edit button's aria-label didn't contain its visible text (WCAG 2.5.3) |

**Overall:** not met: the Edit button's accessible name (row 19) and the malformed-escape 500 (row 17) were open.

### Re-check after fixes

Witnessed: 2026-10-06 17:00 EDT, by a fresh agent (adversarial). Commit: daafd08 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Edit button's accessible name is its visible text | yes | confirmed | Probe on `/admin/workspaces/e2e-team`: `getByRole("button",{name:"Edit description",exact:true})` → 1, aria-label null |
| 2 | The seed adds an empty workspace `e2e-team` | yes | confirmed | `e2e/seed.ts` inserts it; probe list rows `["global","e2e-team"]`, page 200, Delete enabled |
| 3 | The phone sweep opens a page with Edit and Delete as well as global's, and passes | yes | confirmed | `e2e/pages.ts` has both URLs; `playwright test mobile-sweep` on 3 projects → 15 passed |
| 4 | The e2e-team page doesn't scroll sideways on phones | yes | confirmed | Probe `measureOverflow` at 412, 360 and 320px → none |
| 5 | Names that reach the page (`decoded()` and the lookup) give a 404 or the canonical workspace, and never crash | yes | confirmed | `%25`, `%2Fglobal`, `..%2Fusers`, 3000×`a`, fullwidth, Cyrillic, `%00` → 404; `GLOBAL` → global with no buttons; `%20E2E-Team%20` → e2e-team. Remark: malformed escapes still 500 in Next.js before the page runs, on every dynamic route; out of this task |
| 6 | Still root-only, and `global` still protected, after the changes | yes | confirmed | Moderator and member: page 404, actions refused; root update and delete of `global` refused |
| 7 | Component tests, lint and typecheck still pass | yes | confirmed | 15 passed; `biome check` no errors; `tsc --noEmit` ok |

**Overall:** met. Out of this task, reported to the owner: the Next.js-wide 500 on malformed `%` escapes, and the disabled reason on touch (068).

## Task 5 — Admin › Scopes

Witnessed: 2026-10-06 17:09 EDT, by a fresh agent (blind). Commit: 70a6ce3 + uncommitted diff (7 files in apps/web, PLAN.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Admin › Scopes tests pass | yes | confirmed | `pnpm exec vitest run src/features/admin-scopes src/features/admin-workspaces` → 2 files, 27 passed |
| 2 | The Admin › Scopes table has a Workspace column that links to the workspace's page | yes | confirmed | e2e probe on a scratch copy of the build → headers `Scope, Description, Workspace, Created by, Created, Actions`; cell link href `/admin/workspaces/acme` |
| 3 | Admin › Scopes filters by workspace, and the filter lives in the URL | yes | confirmed | probe: choosing `acme` → URL `?q=&workspace=acme`, rows `[@acme-infra]`; `?workspace=global` → `[@e2e-seeded, @glob-one]` |
| 4 | The workspace filter has a removable chip, and a stale workspace name matches nothing | yes | confirmed | probe: removing the workspace chip → `?q=infra`; `?workspace=gone` → 0 rows, "No scopes match these filters.", chip still shown |
| 5 | New scope has a workspace select with `global` first and selected | yes | confirmed | probe → options `["global","acme","e2e-team"]`, selected `global`; the repository orders by `is_global desc, name` |
| 6 | A new scope is created in the chosen workspace, and in `global` by default | yes | confirmed | probe: acme chosen → "Created @acme-infra in acme." and cell `acme`; select untouched → "Created @glob-one.", listed under `?workspace=global` |
| 7 | An invalid workspace id in the form is refused | no | confirmed | probe: option value changed to `nope` → "That workspace doesn't exist.", no `@bogus-ws` row |
| 8 | A workspace's page shares the scope table without the Workspace filter, showing only its scopes | yes | confirmed | probe `/admin/workspaces/acme` → no `#scope-workspace` select, rows `[@acme-infra]`; `workspaceScopesList` (q only) |
| 9 | Only root reaches the page; a non-root user gets a 404 with the filter too | no | confirmed | probe: notRoot user, `/admin/scopes?workspace=acme` → 404 |
| 10 | UI rules: colour tokens only, arrow functions, feature-first, filters in the URL | yes | confirmed | `biome check` clean; diff grep for hex, rgb() and palette classes → none; `tsc --noEmit` → 0 |
| 11 | The tests cover the page's Workspace column and the dialog's select | no | partly | scratch mutations: removing `<WorkspaceSelect>` from CreateForm → 12/12 pass; removing `workspaces=` on page.tsx → 12/12 pass |
| 12 | Creating or editing a scope also revalidates the workspace pages | yes | confirmed | actions.ts:18 `revalidatePath("/admin/workspaces", "layout")`; the scope-actions test asserts it |
| 13 | An empty filtered list reads "No scopes match these filters." | yes | confirmed | probe `?workspace=gone` → shown; the ScopesTable test asserts it |
| 14 | The page turns the workspace name into its id for the query | yes | confirmed | page.tsx:22-24 (unknown name → `"none"`); the page test expects `"w1"` for `acme` and `"none"` for `gone` |
| 15 | Lint, typecheck, test and build pass | yes | confirmed | `biome check .` exit 0; `pnpm typecheck` 7/7; `pnpm test` all pass (web 1569 passed, 8 skipped); web build = repo `.next` written after the last source edit |
| 16 | The full e2e suite (91) passes | yes | confirmed | scratch copy of the repo's build, `pnpm exec playwright test` → 91 passed |

**Overall:** not met: everything works in the built app, but the tests didn't catch losing the dialog's select or the page's Workspace column (claim 11). Remark, out of this task and reported to the owner: the Create scope dialog's Description box has the accessible name "Description Description" (pre-existing).

### Re-check after fixes

Witnessed: 2026-10-06 17:21 EDT, by a fresh agent (blind). Commit: 70a6ce3 + uncommitted diff (7 files in apps/web, PLAN.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Admin › Scopes tests pass | yes | confirmed | `vitest run src/features/admin-scopes src/features/admin-workspaces` → 27 passed; only admin-scopes.test.tsx changed since the first pass |
| 11 | The tests cover the page's Workspace column and filter, and the dialog's select | yes | confirmed | scratch mutations each failing "root gets the list…": no `<WorkspaceSelect>` → 1 failed; no `workspaces=` → 1 failed; column off → 2 failed; filter select off → 2 failed; restored → 12 passed |

**Overall:** met.
