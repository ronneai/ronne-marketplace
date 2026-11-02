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
