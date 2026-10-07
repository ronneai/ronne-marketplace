# 091 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Migration

Witnessed: 2026-10-06 21:37 EDT, by a fresh agent (blind). Commit: 3ba4bfe + working tree (feat/091-workspace-roles: 0020_workspace_members.ts/.db.test.ts untracked; index.ts, schema.ts, kysely-identity-repository.ts, test-auth.ts, user-admin.db.test.ts, 0019_workspaces.db.test.ts modified). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The database tests pass on all four databases. The fixtures include a root, a moderator, a user and a disabled moderator | yes | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db` → 70 files, 552 passed, 8 skipped (server-only); `pnpm test:db:postgres` / `:mysql` / `:mariadb` → 70 files, 560 passed each. Fixtures are at `0020_workspace_members.db.test.ts:60-64` |
| 2 | `workspace_members` has workspace_id, user_id, role, added_by, created_at, updated_at, with PK (workspace_id, user_id). It cascades from workspaces and from users, and added_by is set null | yes | confirmed | `0020_workspace_members.ts:23-53`. Test "has the keys" checks the 3 FKs (CASCADE, CASCADE, SET NULL; exactly 3), and "enforces them" checks duplicate PK, unknown workspace and unknown user are rejected and the row goes with the user, on all four databases. Probe: deleting the user named in added_by left the row with added_by NULL on SQLite, PG, MySQL and MariaDB |
| 3 | The migration gives every non-root user one `global` row, `moderator` for former moderators (disabled ones too) and `user` otherwise, with added_by null. Roots get no rows | yes | confirmed | Test "puts every user but roots in global" passes on all four. Probe: 1203 users (every 3rd a moderator, about 12 roots, Unicode and emoji names), more than the 500-row batch → rows = users − roots, each with the right role, no root rows, on SQLite, PG, MySQL and MariaDB. Mutants: all moderators written as `user` → the test fails; root filter removed → the test fails |
| 4 | After the migration `user.role` holds only `root` and `user` | yes | confirmed | Test "leaves only root and user" passes on all four. Probe: `select distinct role` → `["root","user"]` on all four. Mutant without the `update … set role='user'` → that test fails |
| 5 | The migration is safe to run again (MySQL commits DDL partway through a run); the data is copied in batches of 500 | yes | confirmed | `0020_workspace_members.ts:24` (`ifNotExists`), `:56-63` (index guarded per dialect), `:67-80` (skips users who already have a global row), `:82` (batches of 500). Test "is safe to run again" → rows unchanged, then `migrateToLatest` → `[]`, on all four. The 1203-user probe covers more than one batch |
| 6 | New users get a `global` row in `createUser`; a new root gets none | yes | confirmed | `kysely-identity-repository.ts:295-307`, inside the `createUser` transaction (`user-admin.ts:134`); the setup root is created with role root (`root-account.ts:40`). Test "puts a new user in global, and a new root nowhere" passes on all four. Mutant with the insert disabled → that test fails (1 failed / 23) |
| 7 | Registered in the migration list and the Kysely schema. The test helper gives test users their global row | yes | confirmed | `migrations/index.ts:47`; `schema.ts:109-116,315`; `test-auth.ts:47-60`. The full db suites pass with it |
| 8 | There is an index on `workspace_members.user_id` | yes | confirmed | `0020_workspace_members.ts:56-63`. Probe `probe-index.db.test.ts` (pragma_index_list / information_schema.statistics / pg_indexes) → `workspace_members_user_id_idx` exists on SQLite, PG, MySQL and MariaDB (1 passed each) |
| 9 | A root who is demoted gets a `global` `user` row in `setRole`, only once | yes | confirmed | `kysely-identity-repository.ts:200-220`. Test "puts a root who stops being root in global, once" (root → user → root → user, one row) passes on all four. Mutant with the insert disabled → that test fails; mutant that always inserts → it fails |
| 10 | Lint, typecheck and unit tests pass | yes | confirmed | `pnpm lint` → exit 0, no errors; `pnpm typecheck` → 7/7 tasks successful; `pnpm test` → exit 0, 8/8 tasks successful |

**Overall:** met: the migration creates `workspace_members` with the specified keys and gives every non-root user a `global` row (moderator for former moderators), leaves only `root`/`user` in `user.role`, can run again, and new users get their `global` row, on SQLite, PostgreSQL, MySQL and MariaDB. Rows 8–10 were added after reading the notes, each checked first. Remark for task 2: `setRole` and `createUserWithPassword` still accept `moderator` until `Role` is narrowed.

Witnessed: 2026-10-06 21:55 EDT, by a fresh agent (adversarial). Commit: 3ba4bfe + uncommitted working tree (feat/091-workspace-roles). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `workspace_members` has workspace_id, user_id, role, added_by, created_at, updated_at, with PK (workspace_id, user_id) | yes | confirmed | `0020_workspace_members.ts:25-55` creates exactly these columns and `workspace_members_pk`; the 0020 test "enforces them" rejects a duplicate (global, user) on all four databases |
| 2 | Cascade on workspace and on user; added_by is set null | yes | confirmed | "has the keys" passes on SQLite, PostgreSQL, MySQL 8.4 and MariaDB (verbose, 5/5 each): CASCADE, CASCADE, SET NULL, exactly 3; deleting a user removes their row |
| 3 | The migration gives every non-root user a `global` row (moderator for former moderators), disabled users included | yes | confirmed | `TEST_DATABASE_URL=<each> tsx probe.mts`, 1,100 non-roots (550 mods, 550 users, every 7th disabled) and 2 roots → rows=1100 mods=550 users=550 rootRows=0 missing=0 on all 4, across the 500-row batch |
| 4 | Roots stay root and get no rows | yes | confirmed | The same probe → rootRows=0, user.role ∈ {root,user} on all 4; the real file upgrade (row 7) too |
| 5 | Only `root` / `user` are left in `user.role` | yes | confirmed | "leaves only root and user" passes on all 4; the probe saw only root and user. Values the app never writes aren't normalised (row 10) |
| 6 | Rerunning after a partial failure is safe (MySQL/MariaDB commit DDL; PostgreSQL rolls back) | yes | confirmed | Probe B ran the real `up` then threw: PostgreSQL rolled back; SQLite, MySQL, MariaDB kept the table; a rerun applied 0020 → mods=2 users=1 on all 4. Probe C (table and index kept, half the rows deleted, moderators restored) → rerun 10/10 on all 4 |
| 7 | A real 0019 SQLite file upgrades through the migrate script | no | confirmed | `DATABASE_URL=file:…/real.db pnpm db:migrate` → "applied 0020_workspace_members"; again → "Nothing to migrate"; moderator → user with a global moderator row, the root with none |
| 8 | New users get the `global` row in `createUser` (root gets none) | yes | confirmed | `kysely-identity-repository.ts:295-307` inside the service's transaction (`user-admin.ts:134`); the test passes on all 4. Other creation paths: `root-account.ts:40` (a root), `e2e/seed.ts:38` (same method), `test-auth.ts:47-60` (adds the row); Better Auth sign-up is disabled |
| 9 | Migration tests pass on the four databases | yes | confirmed | `pnpm test:db:postgres` / `:mysql` / `:mariadb` → 70 files / 560 passed each; SQLite `--project db` → 552 passed, 8 skipped (after the core build; a run before it failed only in `setup.db.test.ts` on the missing `@ronneai/core/dist`) |
| 10 | Hostile `user.role` values (not written by the app) | no | confirmed | Probe D with `ROOT`, `Moderator`, `admin`, `""`: SQLite and PostgreSQL → global user rows, role kept; MySQL and MariaDB (case-insensitive collation) → `ROOT` no row, `Moderator` → user with a user row. The app can't write these values (`checkRole`, the default `user`): a remark |
| 11 | Index on `workspace_members.user_id` | yes | confirmed | `sqlite3 real.db` → `workspace_members_user_id_idx`; on MySQL and MariaDB the `mysqlHasIndex` guard let probes B and C rerun without a duplicate-index error |
| 12 | A demoted root gets a global `user` row in `setRole`, once | yes | confirmed | `kysely-identity-repository.ts:200-220`; "puts a root who stops being root in global, once" passes on SQLite, PostgreSQL and MySQL (verbose, 23/23) |
| 13 | Registered in `index.ts` and `schema.ts`; `createTestUser` adds the global row | yes | confirmed | `index.ts:47`, `schema.ts:108-118,315`, `test-auth.ts:47-60`; `pnpm --filter @ronneai/web typecheck` clean |
| 14 | Lint, typecheck and unit tests are green | yes | confirmed | `pnpm lint` → exit 0 (warnings only); web typecheck clean; `vitest run --project unit` → 106 files / 1031 passed |

**Overall:** met: the migration, keys, index, reruns, the real SQLite upgrade and global rows for new and demoted users hold on SQLite, PostgreSQL, MySQL and MariaDB.
