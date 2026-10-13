# 099 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The format

Witnessed: 2026-10-12 12:19 EDT, by a fresh agent (blind). Commit: f589ae72 (+ uncommitted: new `docs/spec/backup-format.md`, edits to 099 `SPEC.md` and `PLAN.md`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `docs/spec/backup-format.md` exists and covers the tar layout, `backup.json`, `manifest.json`, the JSON Lines rows, the container and the versions | no | confirmed | `git status` → `?? docs/spec/backup-format.md`; sections Versions, The tar, The entries, `backup.json`, The rows, Values, `manifest.json`, What a reader checks, The encrypted container (header, key, chunks) |
| 2 | The tar rules are complete for a reader and match ustar's limits | no | partly | entry types, pax `path`/`size`, paths and order given; `packages/core/src/pack/tar.ts:31-41` prefix ≤155, name ≤100; 8^11 = 8 GiB. Gap: whether two tables' parts may interleave in `database/` |
| 3 | `backup.json`'s fields and the migration check match the code | no | confirmed | `migrate.ts:7-8` → `ronne_migration`, `ronne_migration_lock`; `url.ts:3` dialects; scratch DB (`DATABASE_URL=file:… pnpm run db:migrate`) → 24 migrations `0001_identity` … `0024_scope_moves`; matches SPEC restore steps 2 and 6 |
| 4 | Row parts: naming, JSONL rules, primary-key order, every table has a primary key | no | confirmed | `pragma table_info` on the migrated scratch DB → all 25 tables have a primary key (5 composite, `usage_daily` 7 columns) |
| 5 | Value encoding matches the column types; a reader's conversions are complete | no | partly | `column-types.ts`: boolean `integer`/`boolean`, timestamp `timestamptz`/`datetime(3)`/text, json text; no bigint, float or blob; dev DB `*_at` values all `YYYY-MM-DDTHH:MM:SS.sssZ`. Gap: the per-column rules never accept `null` |
| 6 | `manifest.json`'s fields are enough for a reader | no | confirmed | every field typed; the example is consistent |
| 7 | The reader checks are complete, including the artifact check | no | partly | `publish.ts:347-352` → `artifact_path` is the storage key, `sha256` of the stored `.tgz`. Gaps: a table not in `manifest.tables` isn't refused; `manifest.tables` isn't tied to the target's schema; `manifest.storage` counts unchecked |
| 8 | The header offsets add up to 40 bytes; the magic can't clash with a tar | no | confirmed | 8+1+1+1+1+16+4+7 = 40; probe built and round-tripped the header; a plain tar starts with `backup.j` |
| 9 | scrypt N=2^17, r=8, p=1, keylen 32, `maxmem` ≥ 256 MiB, and the header limits | no | not met | `scryptSync` 17/8/1 fails at 32 and 128 MiB, works at 256 MiB; but 18/8/1 and 20/16/1, inside the stated limits, fail at 256 MiB (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`) |
| 10 | STREAM: 12-byte nonce, last flag, header as AAD, the last chunk always tellable | no | confirmed | 7+4+1 = 12; a probe written from the spec alone round-trips 131,172 bytes and refuses a cut at a chunk boundary, a cut mid-chunk, swapped chunks, an altered reserved byte and a trailing byte |
| 11 | The passphrase rules (NFC, one trailing newline, empty refused) | no | confirmed | "The key" states them precisely |
| 12 | Format and container versions, and what a reader does with a newer one | no | partly | both numbers and messages given; SPEC's edge case says a newer archive is "refused with the version that can read it", impossible for a container version (no version in the header) |
| 13 | SPEC.md agrees with the format spec | no | partly | `backup.json`, parts, `manifest.json` last, N/r/p, 64 KiB consistent; mismatch in row 12; "up to 10,000 rows and 8 MiB per part" can't hold for one row over 8 MiB (`drafts-api.ts:47` allows 20 MiB) |
| 14 | PLAN.md agrees (task 2 pax and parts, task 3 `backup.json`) | no | confirmed | `git diff PLAN.md` |
| 15 | MVP §15's Operations row and the index's 099 row say "a portable archive" | no | confirmed | `MVP.md:965`; `docs/features/README.md:282` |
| 16 | Done when: the witness can name every field a reader needs | no | partly | every field can be named; rows 2, 5, 7 and 9 leave behaviour unspecified or contradictory |

**Overall:** not met: the scrypt limits contradict `maxmem` (9), `null` is refused as written (5), table order and table-set checks underspecified (2, 7), and rows 12 and 13.

### Re-check

Witnessed: 2026-10-12 12:21 EDT, by a fresh agent (blind). Commit: f589ae72 (+ uncommitted: new `docs/spec/backup-format.md`, edits to 099 `SPEC.md` and `PLAN.md`). Machine: macOS 27.0.1, Node v24.0.0 (scrypt probe also on v22.11.0, v22.23.2, v24.21.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The tar rules are complete, including the order inside `database/` | no | confirmed | `backup-format.md:51-54` → one table's parts together and in increasing number; out of order refused |
| 5 | A reader's value rules are complete, including NULL | no | confirmed | `backup-format.md:130-131` → `null` into a nullable column; into `NOT NULL` stops the restore |
| 7 | The checks tie the archive's tables to the manifest and the target schema, and check storage counts | no | confirmed | `:199-203` new check 6; `:209-210` `--verify` skips only the target part; artifact check now 7 |
| 9 | Every accepted header (log2(N) 15-18, r = 8, p 1-4) derives with `maxmem = 256·N·r`; 128·N·r isn't enough | no | confirmed | probe `s2.mjs` → 15/8/1, 15/8/4, 17/8/1, 17/8/4, 18/8/1, 18/8/4 ok at 256·N·r on Node v22.11.0, v22.23.2, v24.0.0, v24.21.0; all fail at 128·N·r; 18/8/4 about 2.0 s |
| 12 | A newer format and a newer container are each handled; SPEC agrees | no | confirmed | `backup-format.md:27-30`; SPEC's edge case reworded |
| 13 | SPEC.md and PLAN.md agree with the format spec | no | partly | SPEC's "up to 10,000 rows or 8 MiB" contradicts the format's oversize-row rule |
| 16 | Done when | no | confirmed | every field and rule can be named; the first pass's gaps are closed |

**Overall:** not met: only SPEC.md's part-size summary (13).

### Re-check

Witnessed: 2026-10-12 12:21 EDT, by a fresh agent (blind). Commit: f589ae72 (+ uncommitted: new `docs/spec/backup-format.md`, edits to 099 `SPEC.md` and `PLAN.md`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | SPEC.md and PLAN.md agree with the format spec | no | confirmed | `SPEC.md:87-88` "up to 10,000 rows or 8 MiB (a larger row is a part on its own; …)" matches `backup-format.md:104-106` |

**Overall:** met: every claim for task 1 confirmed across the three passes (the uneven wrap at `SPEC.md:89-90` fixed after the pass).

## Task 2 — The snapshot and the dump

Witnessed: 2026-10-12 12:46 EDT, by a fresh agent (blind). Commit: cb15ce9f (+ uncommitted: snapshot.ts, introspect.ts, dump.ts, dump.test.ts, dump.db.test.ts, tar.ts, pack/index.ts, tar-stream.test.ts, backup-benchmark.ts, bench-seed.ts, feed-benchmark.ts, apps/web/package.json). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The dump's db tests pass on the four databases | no | confirmed | SQLite `vitest --project db dump.db.test.ts` → 5 passed; `pnpm test:db:postgres\|mysql\|mariadb` → 5 passed on each |
| 2 | A seeded instance is dumped: every table but the migration tables, counts matching `count(*)`, every column a key | yes | confirmed | `dump.db.test.ts:116-156`; schema probe → 25 tables on every dialect, all with a primary key, same FK order |
| 3 | A write made during the dump isn't in it; the test fails without the snapshot | yes | confirmed | probe on all 4: with the snapshot `["root@example.com"]`, without it `late@example.com` included. Remark: a plain `begin` also passes on SQLite and MySQL 8.4 |
| 4 | `readSnapshot`'s statements per dialect; always rolled back, errors passed on | yes | confirmed | `snapshot.ts:21-43`; `create-db.ts:30` WAL; error test passes on all 4 |
| 5 | Tables and FK order from the database's schema | yes | confirmed | `introspect.ts`; identical references and order on all 4; `dump.test.ts` 6 passed |
| 6 | Batched reads in primary-key order, composite keys | yes | confirmed | `dist_tags` read one row at a time → `["latest","stable"]` on all 4 |
| 7 | Values as the format's "Values" | no | confirmed | `dump.ts:28-46`; `published_at === NOW.toISOString()`; `email_verified` boolean on PG, number elsewhere; no bigint/json/decimal columns on any dialect |
| 8 | Part naming, one table's parts together, JSON Lines | no | confirmed | `partMaxRows 1` → 000001, 000002 on all 4 |
| 9 | Parts end at 10,000 rows or 8 MiB; a larger row is a part on its own | yes | partly | probe (partMaxBytes 300; rows 191, 436, 191 B) → part 1 holds a1 and a2 (627 B): a large row joins the part before it; the test's rows were all over the limit |
| 10 | The tar writer streams, waits for each write, checks the size | yes | confirmed | core `src/pack` → 47 passed |
| 11 | Pax `path` and `size` only when needed, self-counting lengths | no | confirmed | tests across a power of ten and `19 size=8589934597`; bsdtar reads a 290-byte path |
| 12 | Header fields and path refusals as the format says | no | confirmed | `tar.ts:44-66,198-202,226-231`; `tar-stream.test.ts:109` |
| 13 | SQLite's WAL files aren't copied | no | confirmed | no file reads in dump, snapshot or introspect |
| 14 | Memory stays flat on 079's data set | yes | confirmed | held after a GC: SQLite 1k 1.4, 10k 16.6, 20k 16.6, 50k 16.5 MiB; PG 1k 1.2, 10k 16.4, 30k 16.5; MySQL 1k 1.5, 10k 16.5 |
| 15 | Lint and typecheck of the changed files | no | confirmed | biome → no fixes; `tsc --noEmit` in apps/web and packages/core → clean |

**Overall:** not met: row 9.

### Re-check

Witnessed: 2026-10-12 13:01 EDT, by a fresh agent (blind). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Parts end at 10,000 rows or 8 MiB; a larger row is a part on its own | yes | confirmed | `dump.ts:191` flushes before a row that would pass `maxBytes`; the probe now gives a1, a2, a3 apart; the test passes on all 4, and fails alone with line 191 removed |
| 16 | The snapshot tests fail when the snapshot is weakened | yes | confirmed | scratch copy with plain `begin` / `start transaction` and no first read → "takes the snapshot before its work's first read" fails on all 4, and more on PG, MySQL and MariaDB |
| 17 | Nothing regressed | yes | confirmed | unit 6, core 49 passed; biome, tsc clean; held 1.4 / 16.6 / 16.5 MiB at 1k / 10k / 30k |

**Overall:** met for the code it checked (the later changes are covered by the passes below).

### Adversarial pass

Witnessed: 2026-10-12 12:51 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted: db/{snapshot,introspect,dump}.ts, dump.test.ts, dump.db.test.ts, pack/tar.ts, pack/index.ts, tar-stream.test.ts, scripts/backup-benchmark.ts, bench-seed.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests dump a seeded instance on all four databases | no | confirmed | 5 passed on each |
| 2 | A write during the dump isn't in it, and the test would catch it | yes | confirmed | READ COMMITTED / plain `start transaction` / no SQLite `begin` in a scratch copy → the test fails on all 4 |
| 3 | The snapshot is fixed before `fn`'s first read | yes | confirmed | a write inside `readSnapshot` before the first read → not seen on PG, MySQL, MariaDB |
| 4 | The snapshot is read-only on every database | yes | partly | PG and MySQL/MariaDB refuse an insert; SQLite accepts it (plain `begin`) |
| 5 | The statements are the spec's | yes | confirmed | `snapshot.ts:22,24-25` |
| 6 | A failed dump leaves no open transaction | yes | confirmed | `addPart` throws → no idle-in-transaction, no open InnoDB transaction; the next dump works on all 4 |
| 7 | Tables without the migration tables, in FK order | yes | confirmed | 25 tables; 0 order violations in 34 references |
| 8 | Keyset reads skip and repeat nothing | yes | partly | `usage_daily`'s 7-column key with case, accent, space, emoji, NBSP, `ß`/`ss` variants → all rows once on all 4; SQLite NULL keys (`[null, null, a, b, c]`, batch 1) → only `[null]` read |
| 9 | Values: ISO UTC timestamps, booleans as stored, integers as numbers | no | confirmed | `TZ=Asia/Kolkata`: MySQL `datetime(3)` and PG `timestamptz` → `…Z` with ms |
| 10 | Values the format can't carry stop the dump | no | confirmed | `dump.test.ts` |
| 11 | A larger row is a part on its own | yes | partly | rows 100, 100, 5000, 100 with partMaxBytes 1000 → parts `abc`, `d` |
| 12 | Backpressure | no | confirmed | test passes; core 47 |
| 13 | Pax `path` lengths at every digit boundary; system tars read long paths | no | confirmed | 137 entries, paths 95–1010 bytes, multi-byte; Python `tarfile`, GNU tar 1.35, bsdtar |
| 14 | Pax `size` at and over 8 GiB | no | confirmed | 8^11−1, 8^11, 8^11+12345, 2^53−1 read back exactly; −1, 1.5, NaN, 2^53 refused |
| 15 | The writer refuses what the format refuses | yes | partly | lone surrogates accepted (two paths become one `storage/a�`); writing goes on after a failed `addStream` |
| 16 | Memory flat on 079's data set | yes | confirmed | held 1.4 / 16.6 / 16.5 (SQLite), 1.4 / 16.5 / 16.6 (PG), 1.3 / 16.4 / 16.7 (MySQL) MiB |
| 17 | Memory flat on a very large instance | yes | partly | batches are 1,000 rows of any size: 1,000 × 1 MiB draft files → 1,352 MiB peak |
| 18 | SQLite reads through the database under WAL | no | confirmed | `create-db.ts:30`; reads are SQL |

**Overall:** not met: rows 4, 8, 11, 15, 17.

### Adversarial re-check

Witnessed: 2026-10-12 13:28 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Read-only on every database; `query_only` never left on | yes | confirmed | SQLite insert, `create table`, `pragma user_version` → refused; `query_only` 0 after every path; mutation fails the test |
| 8 | Keyset reads; a NULL key stops the dump | yes | confirmed | NULL keys → DumpError at batch 1, 2, 3, 1000; concurrent inserts, growth and deletes between batches → the snapshot's 20/20 on all 4 |
| 11 | A larger row starts a new part | yes | confirmed | 100/100/5000/100/3000/3000 → `ab`, `c`, `d`, `e`, `f` on all 4; mutation fails the test |
| 15 | The writer refuses and stops after a failure | yes | partly | surrogates refused, `tar_failed` after an error; but un-awaited overlapping calls (`Promise.all`, `end()` during a stream) corrupt the archive |
| 17 | Memory flat with wide rows | yes | confirmed | SQLite 1000 × 1 MiB → 19 MiB held; PG 18; MySQL 300 × 1 MiB → 17; 300 × 20 MiB → 39.6 MiB |
| 19 | The dump's time stays linear | yes | not met | MySQL 1 MiB rows: 150 → 19.2 s, 300 → 107 s; the size query reads 1,000 rows' `longtext` to keep 4, and `(a, b) > (x, y)` scans the whole index |

**Overall:** not met: rows 15, 19.

### Adversarial re-check

Witnessed: 2026-10-12 13:41 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The writer refuses, stops after a failure, can't be made to hang or corrupt | yes | partly | overlapping outside calls now in call order and intact (Python); a call from inside its own `write` or stream deadlocks |
| 19 | The dump's time is linear on every database | yes | confirmed | MySQL 300 → 3.1 s, 600 → 6.3 s; narrow and wide mixes linear; MariaDB 300 → 3.4 s, 600 → 6.6 s; the spelled-out predicate keeps `ORDER BY`'s order on the 7-column key on all 4 |

**Overall:** not met: row 15.

### Adversarial re-check

Witnessed: 2026-10-12 13:44 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | No hang from a call inside the writer's own work | yes | confirmed | core 51 passed; nested calls from generators, `Readable.from` and read-ahead streams → `tar_reentrant`; mutation times out the test |
| 15b | The guard refuses only calls from inside a call still running | no | partly | the store outlives its call: a timer or listener started in `write` that adds after the call ended → `tar_reentrant` |
| R | SQLite `query_only` goes back to its earlier value | yes | confirmed | before on/off × success, throw, commit, turned off inside → restored on every path; db tests 10 passed on all 4 |

**Overall:** not met: row 15b.

### Adversarial re-check

Witnessed: 2026-10-12 13:45 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15b | The guard refuses only calls from inside a call still running | yes | confirmed | timers, deferred listeners after the call → resolve; an unrelated call's timer → queues; a generator inside its own `addStream` → `tar_reentrant` |
| 15 | The writer can't be made to hang or corrupt | yes | partly | a stream whose work started before it was handed over, adding to its own writer, waits for ever |

**Overall:** not met: row 15 (documented as the writer's contract afterwards).

### Adversarial re-check

Witnessed: 2026-10-12 13:47 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The writer can't be made to hang or corrupt by any use its contract allows | yes | confirmed | contract at `tar.ts:233-243`; 30 un-awaited calls mixing files and 300,000-byte read streams with a random-delay `write` → 30 entries in call order, intact (Python, bsdtar); failures stop it; earlier probes re-run; only the forbidden pre-started stream still waits |

**Overall:** met (the buffer line added to the contract after the pass).

### Adversarial pass — the notes' other claims

Witnessed: 2026-10-12 13:48 EDT, by a fresh agent (adversarial). Commit: cb15ce9f (+ uncommitted, as above). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| N1 | No `node:` import in the tar writer; it loads where `process.getBuiltinModule` is missing | yes | confirmed | no `from "node:` in `tar.ts`; with `getBuiltinModule` undefined, `dist/pack/tar.js` loads and writes (`tar -tf` → a, b) |
| N2 | `readSnapshot` holds SQLite's only connection for the whole dump | yes | confirmed | another query on the same Kysely during a 200 ms snapshot finishes after it |

**Overall:** met.

### Re-check

Witnessed: 2026-10-12 14:15 EDT, by a fresh agent (blind). Commit: cb15ce9f (+ uncommitted db/{snapshot,introspect,dump}.ts and tests, pack/tar.ts, index.ts, tar-stream.test.ts, scripts/{backup-benchmark,bench-seed,feed-benchmark}.ts, apps/web/package.json). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `readSnapshot`: a read-only repeatable snapshot per dialect on one connection, always rolled back | yes | confirmed | `snapshot.ts:41-53`, `end` at `:5-12`; signature `(db, dialect, fn)`; the rollback test passes on all 4 |
| 2 | A write during the dump isn't in it, on the four databases | yes | confirmed | `dump.db.test.ts` 10/10 on SQLite (file, WAL, two connections), PostgreSQL, MySQL, MariaDB; READ COMMITTED / plain `start transaction` / SQLite begin+commit in a scratch copy fail two tests on all 4; without `WITH CONSISTENT SNAPSHOT` alone, on MySQL and MariaDB |
| 3 | A write inside the snapshot is refused on every database | yes | confirmed | the test passes on 4; without `READ ONLY` or `query_only` it fails on each |
| 4 | The tables from the catalogue, without the migration tables | yes | confirmed | `readSchema` → the same 25 tables on SQLite, PostgreSQL, MySQL as `schema.ts:371-395`, all with a primary key |
| 5 | Foreign-key order | no | confirmed | unit tests 6/6; user < items < item_versions in the tar on all 4 |
| 6 | Keyset batches in key order, composite keys, nothing skipped or repeated | yes | confirmed | `dump.ts:90-175`; `dist_tags` in batches of one on 4; removing `order by` fails 2 tests |
| 7 | A batch is sized by its rows' bytes | yes | confirmed | with `rowBytes = null` the batch-size test fails |
| 8 | Parts named from 000001, cut at 10,000 rows or 8 MiB, a larger row alone, one table's together | yes | confirmed | `[["a","b"],["c"],["d","e"]]` passes; without the pre-flush it fails |
| 9 | Values as the format's "Values" | no | confirmed | `dump.test.ts` 6/6; ISO dates, booleans per dialect and keys checked on 4; no json, bigint or numeric columns |
| 10 | The streaming writer, pax `path` and `size` only when needed, header fields | yes | confirmed | core 51/51; a 288-byte path, a 137-byte UTF-8 path, a 100-byte path, a stream and a sparse 8 GiB+3 entry → Python `tarfile` and `bsdtar` list them right (size 8589934595, mode 0600, mtime 0); pax only for the long path and the big file; 1024 zero bytes at the end |
| 11 | The dump goes into the tar writer | yes | confirmed | `dump.db.test.ts:87-105`; `backup-benchmark.ts:101-120` with drain backpressure |
| 12 | Memory flat on 079's data set, wide rows included | yes | confirmed | held after a collection: SQLite 1.4 / 16.6 / 16.5 MiB at 1k / 10k / 30k; PostgreSQL 1.2 / 16.7 / 16.6; MySQL 1.7 / 16.9 / 16.9; 300 vs 1,000 × 1 MiB rows: 17.5 / 17.6, 17.3 / 17.5, 17.7 / 17.8; 30 × 20 MiB about 40 MiB on all three |
| 13 | SQLite's WAL files aren't copied | no | confirmed | reads only through SQL; `create-db.ts:30` |
| 14 | The changed files lint and type-check | no | confirmed | biome clean; web and core typecheck clean |
| 15 | The writer: calls in order without awaits, nothing after a failure, lone surrogates refused, a re-entrant call fails | yes | confirmed | 20 `Promise.all` adds with random delays → in order, intact; `"bad\uD800"` → `tar_path`, then `tar_failed`; a `write` adding to its writer → `tar_reentrant`; a short stream → `tar_size`, then `end()` → `tar_failed` |

**Overall:** met: every claim, in the table and in the notes, holds on the four databases. Task 2 is met by this pass and the last adversarial re-check.

## Task 3 — backup

Witnessed: 2026-10-12 17:06 EDT, by a fresh agent (blind). Commit: a7fbdee5 plus the working tree (git diff and the untracked backup files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The archive holds `backup.json` first, then `database/…`, `storage/…`, `settings.env` and `manifest.json` last, with the fields that backup-format.md lists | no | confirmed | `npx vitest run --project db src/server/backup` → 6 passed, 1 skipped (the lock test, servers only). Real run `scripts/backup.ts` then `tar -tvf` → backup.json, database/*, settings.env, manifest.json, mode 0600, uid 0, mtime 0. The backup.json keys are createdAt, dialect, format, migrations (24 of them) and ronne. manifest.tables.workspaces has columns, primaryKey, rows and parts. `ronne_migration` and `ronne_migration_lock` are left out |
| 2 | Every entry's size and sha256 are in the manifest | no | confirmed | `shasum -a 256 database/workspaces/000001.jsonl` → 5d0ea1ff…, the same as `manifest.files` (size 244). The test at run-backup.db.test.ts:218-223 checks every entry |
| 3 | Storage is copied; links, `<key>.<12hex>.tmp` and odd names are left out and named | no | confirmed | The test lists the storage entries and `skipped` (tmp file and link), run-backup.db.test.ts:200-241. My probe's output had "Left out of the backup: storage/link.tgz, not a regular file (a link?)" |
| 4 | Missing artifacts (backup half): the backup completes, names them and lists them in `missingArtifacts`; an artifact with another sha256 gets a warning | no | confirmed | The test expects `missingArtifacts` = [@incident/notes 1.1.0]. Scratch probe with the 1.0.0 artifact overwritten → "In storage, the artifact of 1 released version has another sha256…". No repository test covers the altered-artifact warning |
| 5 | Output: the path, the size, counts as "N rows in N tables, N stored files (size)", the time, and that the settings are sensitive | no | confirmed | Real run → "Wrote …/ronne-backup-20261012-210415.tar (15 KiB) in 0.0 s." / "2 rows in 25 tables, 0 stored files (0 B)." / "! It holds the settings file, with AUTH_SECRET and the database's password…" |
| 6 | Written as `.partial`, synced, then renamed; the partial file is removed on failure, and the message says so | no | partly | The disk-full and sync-failure paths are confirmed: the test passes, and removing `unlink(partial)` in a scratch copy makes the test fail. **But** `createDb` (run-backup.ts:233) runs after the partial is opened and outside the clean-up `try`. With `.env` `DATABASE_URL=bogus://x`, `scripts/backup.ts` → raw stack trace, exit 1, and `backups/ronne-backup-20261012-210400.tar.partial` (0 bytes) is left behind |
| 7 | Disk full (a mock writer): exit 1 with "the disk is full (ENOSPC)", the partial removed, `--keep` not run, no audit event | no | confirmed | Test run-backup.db.test.ts:313-353: an ENOSPC writer after 3 KiB with keep:1 → the older archives are untouched, no partial file, 0 events. The mutations "keep after failure" and "no unlink" each make a test fail |
| 8 | `--out`: relative to INIT_CWD/callerCwd, the folder 0700, the archive 0600 | no | confirmed | Test (`../elsewhere/b`, modes) passes. The scripts test with `INIT_CWD` → archive in `here/mine`. Real `ls -la` → `drwx------` backups, `-rw-------` archive. The 0o755 mutation makes 2 tests fail |
| 9 | `--out` inside storage (directly, nested, or through a link, even before storage exists) is refused | no | confirmed | Test run-backup.db.test.ts:272-282. With the `isInside` check removed in a scratch copy, the test fails |
| 10 | `--no-settings` leaves `settings.env` out, and the manifest and output say so | no | confirmed | The test passes. A real `backup.mjs --no-settings` → "The settings file isn't in it (--no-settings)…", and the tar ends with database/…, manifest.json |
| 11 | Environment-only values are named (an env value the file lacks or differs from), never their values; Docker mentions compose.yaml | no | confirmed | The test expects ["AUTH_SECRET","TRUST_PROXY"], and a same-valued DATABASE_URL is not counted. The mutation makes it fail. Probe with `RONNE_RUNTIME=docker AUTH_SECRET=t…` → "AUTH_SECRET comes from the environment and isn't in this backup (compose.yaml and the .env next to it set them: keep those too)." |
| 12 | `--keep n` removes the oldest exact-named regular-file archives beyond n. The new archive is never removed; links, folders, `.partial` and other names are left alone | no | confirmed | Test run-backup.db.test.ts:355-403 passes. The mutations `slice(keep)` and `if (info)` each make it fail |
| 13 | `--keep` limits: 1 to 10,000, whole numbers only, exit 2 otherwise | no | confirmed | cli.test.ts: 0, 10001, -1, 1.5, 7days, "", " 3" and 1e3 are refused. Real `--keep 0x5` → "✗ --keep needs a whole number…", exit 2 |
| 14 | A file `--keep` can't remove is named, and the backup still succeeds | no | confirmed | Probe: `chflags uchg` on an old archive, then `--keep 1` → "! --keep couldn't remove ronne-backup-20200101-000000.tar: … (EPERM)", the other old archive removed, exit 0. No repository test covers it |
| 15 | `--yes`/`-y` is accepted; bad flags exit 2 | no | confirmed | cli.test.ts passes (`--yes`, `-y`, unknown flag, missing value, empty `--out`). The scripts test gets exit 2 for `--keep 0` |
| 16 | An archive name already taken is refused | no | confirmed | Test "refuses … an archive that's already there" passes |
| 17 | Audited as `instance.backup_made` with {via, tables, rows, files, bytes, encrypted, settings} and no path. An audit failure still lets the backup succeed, and the output says so | no | confirmed | The test checks the exact metadata. The mutation to another action makes 2 tests fail. Scratch probe with a SQLite trigger aborting audit_log inserts → the archive is written, and "The backup is complete, but recording it in the audit log failed: audit is down (SQLITE_CONSTRAINT_TRIGGER)." Action listed at audit-event.ts:12. `summary.test.ts` passes (7 tests with cli.test) |
| 18 | A backup during a migration waits for the migration lock (PG, MySQL, MariaDB) | no | confirmed | `pnpm run test:db:postgres\|mysql\|mariadb -- src/server/backup src/server/db/snapshot scripts/backup` → 9 passed and 0 skipped on each, the lock test included. Kysely 0.29.6 uses a session `pg_advisory_lock` and `get_lock`, which snapshot.ts takes on the snapshot connection |
| 19 | The script and `pnpm run backup` (root and web) | no | confirmed | `pnpm run backup --help` from the root → `tsx scripts/backup.ts --help` → usage. scripts/backup.db.test.ts: 2 passed (exit 2, exit 1 when not set up, default `backups/`, `--out` from INIT_CWD) |
| 20 | tsdown entry, and the Docker `pnpm` wrapper routes `backup` | no | confirmed | `npx tsdown --out-dir <scratch>` → `backup.mjs`. `node backup.mjs --out … --no-settings --keep 1` → archive written, exit 0. `sh -n docker/pnpm` OK; docker/pnpm:19 has `backup) … dist-scripts/backup.mjs`. The image itself wasn't run |
| 21 | `rmk-server`: `backup` is in `SCRIPTS` and in the help; `--out` is made absolute; `scriptForService` handles backup | no | confirmed | `packages/server npx vitest run` → 120 passed (cli.test: parseArgs backup, scriptArgs, HELP line). run.ts passes `scriptArgs(...)` to both `scriptForService` and the in-process script. control.ts:201 has `backup: "back it up"`. args.ts help updated |
| 22 | Lint and typecheck of the changed code | no | confirmed | `npx biome check …` → 98 files, no fixes. `tsc --noEmit` in apps/web and packages/server → 0. db-scope.test → 5 passed |

**Overall:** not met: everything holds except one failure path. A `DATABASE_URL` that `createDb` rejects leaves a `.partial` file behind and prints a raw stack trace (row 6). Also found: raw stack traces for `--out` through a regular file and for other errors before the write; no repository tests for the altered-artifact warning, an undeletable file under `--keep`, or the audit-failure warning.

### Adversarial pass

Witnessed: 2026-10-12 17:10 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 + working tree (git diff and untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup*.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The archive follows backup-format.md: order, ustar regular files only (mode 0600, uid/gid 0, mtime 0, empty uname/gname), parts from `000001`, line counts and columns as the manifest says, no `ronne_migration*` tables | no | confirmed | An independent Python `tarfile` checker on archives from the bundled `dist-scripts/backup.mjs` → `bad headers: []`, `phases monotone: True`, no part, row or column mismatch, `migration tables in? []`, backup.json has the 5 spec keys and 24 migrations. `run-backup.db.test.ts` passes on SQLite, PostgreSQL, MySQL and MariaDB (9 passed each) |
| 2 | `manifest.files` lists every entry but backup.json and manifest.json, with size and sha256; `storage`, `settings`, `missingArtifacts` as the spec says | no | confirmed | checker → `files == mid: True`, `hash errs []`, manifest keys exactly the 6 spec fields. The db test checks `missingArtifacts` names `@incident/notes 1.1.0` |
| 3 | Storage is copied as is; links (file, folder, fifo), in-progress `.tmp` files and names storage doesn't use are left out and named; long and Unicode paths work | no | confirmed | Storage with a 120-char folder plus a 90-char name, `ünï cödé/café.zip`, an empty file, a hard link, a fifo, a folder symlink, `back\slash`, `ctrl\x01`, `plain.0123456789ab.tmp` → 5 stored files, all read by Python tarfile (pax path); 5 "Left out of the backup: …" lines with the right reasons |
| 4 | `settings.env` is the settings file byte for byte | no | confirmed | A CRLF settings file came back byte-identical from the tar |
| 5 | `--no-settings` leaves the file out and says so | no | confirmed | No `settings.env` entry, "The settings file isn't in it (--no-settings)…"; the db test checks `settings.included: false` |
| 6 | Settings only the environment has are named, never their values, with the compose hint in Docker | no | confirmed | `RONNE_RUNTIME=docker PUBLIC_URL=http://y TRUST_PROXY=true` → "PUBLIC_URL and TRUST_PROXY come from the environment … (compose.yaml and the .env next to it set them: keep those too)". Remark: `STORAGE_PATH=<same>/` (a trailing slash) is also reported as environment-only |
| 7 | Output: path, size, counts, time, the sensitivity warning, missing or altered artifacts, left-out files | no | confirmed | Real run → "Wrote …tar (23 KiB) in 0.0 s.", "8 rows in 25 tables, 5 stored files (15 B).", "! It holds the settings file, with AUTH_SECRET…"; `run-backup.ts:271-297` |
| 8 | Written as `<name>.partial`, flushed, renamed; folder 0700, archive 0600 | no | confirmed | `ls -la` after a real run → `drwx------`, `-rw-------`; `run-backup.ts:206,224,254-257`; the db test asserts both modes |
| 9 | On any failure the partial file is removed and nothing else changes | no | partly | Failures inside the archive writer are cleaned up (ENOSPC, sync failure, EACCES on a storage file, ECONNREFUSED). But `createDb` runs after the partial is opened and outside the try (`run-backup.ts:233`): `DATABASE_URL=file:<a folder>` → raw `SqliteError`, exit 1, a 0-byte `.partial` left. SIGTERM mid-write left a 720 MB `.partial`, which `--keep` never removes. A missing SQLite file is created empty (folder included) before failing |
| 10 | Every failure is a worded `BackupFailedError`, no stack trace | no | partly | `--out <file>/sub` → raw `Error: ENOTDIR … realpath` (`realOf`, `run-backup.ts:122`); the `createDb` errors of row 9 escape too, and the script prints a stack |
| 11 | Exit codes: 0 complete, 1 failed, 2 bad flags | no | confirmed | `--keep 0/10001/abc/1.5`, `--out=`, `--bogus`, a positional, a missing `--keep` value → 2 each; `--help` → 0; failures → 1 (the uncaught ones of row 10 too). Through `node packages/server/dist/bin.js backup --keep 0` → 2, inside storage → 1 |
| 12 | A relative `--out` is from where the command was typed | no | partly | `rmk-server` (typed in `typedhere/`, `--out relrmk` → `typedhere/relrmk/`) and `INIT_CWD` set (the script test) work. `cd docs/knowledge && pnpm run backup --out witness-relout` → written at the repository's root; the same with `pnpm -C <repo>` and `pnpm run -w` from `packages/core`: pnpm's INIT_CWD is the workspace root |
| 13 | `--out` inside storage is refused: through links, by case on macOS, storage as the data folder, storage itself | no | confirmed | `STORAGE/bk` → refused; `real/bk` with storage a symlink to `real` → refused; `STORAGE_PATH=./data` with the default out → refused; storage's parent → allowed; nothing created in storage |
| 14 | An existing archive name is refused; two backups in the same second don't clobber each other | no | confirmed | Two parallel `runBackup` with the same clock → one written, the other "…tar.partial already exists: another backup is being written there"; one archive in the folder |
| 15 | `--keep n` keeps the newest n by name, never this one, links, folders, `.partial` or other names; limits 1 to 10,000; never after a failure | no | confirmed | db test: `--keep 3` removed exactly the 2 oldest, the future-dated (clock back) archive handled, 10,000 removed nothing; cli.test bounds; the ENOSPC test asserts no removal. Remark: a slow backup started earlier can remove a newer archive that finished first (by spec: "this one" is always kept) |
| 16 | `--yes` accepted, nothing asked | no | confirmed | `parseBackupCommand(["--yes"])` / `-y` (cli.test); the server probe and these runs used `--yes` |
| 17 | `instance.backup_made` with `{via, tables, rows, files, bytes, encrypted, settings}`, no path; a failed record still succeeds and says so | no | confirmed | The db test checks the exact metadata; a trigger aborting audit inserts → "The backup is complete, but recording it in the audit log failed: audit disk gone…", exit 0, archive kept |
| 18 | No secret in output, errors or audit metadata | no | confirmed | `postgres://u:Sup3rSecretPW@127.0.0.1:1` and the same for mysql → "connect ECONNREFUSED 127.0.0.1:1", no password, partial removed; unsupported URL → `admin:***`; the test asserts AUTH_SECRET absent from the output |
| 19 | Waits for a running migration, and the lock is released on every path (PG, MySQL, MariaDB) | no | confirmed | Temporary probe tests on the 3 servers: with Kysely's lock held elsewhere, `readSnapshot` waits only with `waitForMigrations` (≥700 ms vs <500 ms); after success, a thrown `fn` and an SQL error inside, the lock is free (`pg_try_advisory_lock` true / `is_used_lock` null); a sanity check showed the probe detects a held lock. The repo's lock test passes on all 3 |
| 20 | Wiring: `pnpm run backup` (root and web), tsdown entry, docker/pnpm, `rmk-server` SCRIPTS and help, `scriptForService` | no | confirmed | Root `pnpm run backup` ran; `npx tsdown --out-dir scratch` → `backup.mjs`, ran (exit 0); `bin.js --help` lists backup, `bin.js backup` → `RONNE_DATA_DIR/backups`; a temporary test of `scriptForService(…, "backup", ["--out","/home/alex/b","--keep","3"])` → `node ENTRY backup --out /home/alex/b --keep 3` as uid 995 in `/`, a non-root caller gets "To back it up, run: sudo rmk-server backup". docker/pnpm read only; the image wasn't built |
| 21 | Tests cover each flag, a disk-full failure (mock writer) and `--keep`'s limits | no | confirmed | ENOSPC through a mock `OpenOutput` (no partial, no `--keep`, no audit), `--out`, `--no-settings`, `--keep`; cli.test flags and bounds; scripts test exit codes 2 and 1. Read, not mutation-tested |
| 22 | Storage files changing or vanishing during the backup are handled | no | confirmed | `archive.ts`: a file gone before open is skipped (then listed in `missingArtifacts` if released); the size from the open handle; growth → `tar_size`, into the cleaned-up catch. Read, not run |

**Overall:** not met. The archive, format, flags, `--keep`, audit, secrecy and migration lock hold. Missing: the partial file isn't removed when opening the database fails, or on SIGTERM; a missing SQLite file is created; some failures escape as raw stack traces; a relative `--out` typed in a subfolder of a clone lands at the workspace root. Minor: storage names with control characters are printed as they are; a `STORAGE_PATH` differing only by a trailing slash counts as environment-only.

### Re-check

Witnessed: 2026-10-12 17:24 EDT, by a fresh agent (blind). Commit: a7fbdee5 + working tree (git diff and untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 1) A database that can't be opened (`bogus://`, `file:<a folder>`) gives a worded error, exit 1, no `.partial` and no stack trace | yes | confirmed | Real script with `DATABASE_URL=bogus://alex:hunter2@db/x` → "✗ The database couldn't be opened: Unsupported DATABASE_URL "bogus://alex:***@db/x" … Nothing was written.", exit 1, `backups/` empty. `file:<folder>` → "… unable to open database file (SQLITE_CANTOPEN). Nothing was written.", exit 1, empty. Mutation `dbwrap` (rethrow raw) → the test fails |
| 2 | SPEC: "Nothing is written before the database opens", for a server database too | yes | partly | `createDb` doesn't connect, so the `.partial` is created before the first query. PG wrong password → "✗ The backup failed: password authentication failed … (28P01). The partial archive was removed", exit 1, nothing left. Unreachable host (`postgres://u:hunter2@10.255.255.1:5432/x`), SIGKILL after 4 s → a 0-byte `.partial` left (removed by the witness) |
| 3 | (prior 2a) `--out <regular file>/sub` gives a worded error, not a stack trace | yes | confirmed | `--out $S/afile/sub` → "✗ … can't be looked at: ENOTDIR: not a directory, realpath … Nothing was written.", exit 1. Unwritable parent → "couldn't be made: … (EACCES)", exit 1 |
| 4 | (prior 2b) `--keep` that can't list the folder after a complete archive warns and exits 0 | no | confirmed | `--out <dir mode 0300> --keep 1` → "Wrote …" then "! --keep couldn't list … so it removed nothing: … (EACCES)", exit 0. Mutation `readdir` (rethrow) → 1 test fails |
| 5 | (prior 3) Repository tests cover the altered-artifact warning, a file `--keep` can't remove, and the audit-failure warning | no | confirmed | `run-backup.db.test.ts:506,524,554`. Mutations `altered`, `unremovable` and `audit` each turn exactly 1 test red (14 passed unmutated). The audit test runs only on SQLite (a trigger) |
| 6 | (prior 4) A missing SQLite file named in the settings is never created | yes | confirmed | `DATABASE_URL=file:<inst>/nodir/x.db` → "✗ The settings name a SQLite database file that isn't there. Nothing was written", exit 1, no `nodir`. Relative `file:./rel.db` → the same, no `apps/web/rel.db`. Mutation `sqlite` → the test fails |
| 7 | (prior 5) SIGTERM, SIGINT and SIGHUP during the write remove the `.partial`, exit 143/130/129 | yes | confirmed | Real script, 2 GiB sparse storage file, signal sent once the `.partial` appeared → "! Stopped (SIGTERM): the partial archive was removed.", exit 143; INT → 130; HUP → 129; the out folder empty each time. Mutation `signal` → the test fails |
| 8 | (prior 6) A relative `--out` behaves as the SPEC now says: the repository root for `pnpm run backup` in a clone, the typed folder for `rmk-server`, `RONNE_CALLER_CWD` in Docker | yes | confirmed | `cd docs && pnpm run backup --out ../../../../../<scratch>/rel5` → `<scratch>/rel5` (from the root), full path printed. `cd <scratch>/typed && node packages/server/dist/bin.js backup --out rs` → `typed/rs/…`. `RONNE_CALLER_CWD=<scratch>/dock node dist-scripts/backup.mjs --out d1` → `dock/d1/…`. `scriptArgs` tests pass |
| 9 | (prior 7a) Storage names with control characters are printed escaped | yes | confirmed | `evil\x1b[31mred` and `sub/new\nline.tgz` → "storage/evil\x1b[31mred …", "storage/sub/new\x0aline.tgz", no raw ESC (`cat -v`). Names with DEL or C1 are archived, not printed. Mutation `printable` → the test fails |
| 10 | (prior 7b) `STORAGE_PATH` written another way (trailing `/`, `//`, `/./`) isn't environment-only; a different folder is | no | confirmed | env `<S>/`, `<S>//`, `<I>/./storage` → no "from the environment" line; `./storage-other` → "! STORAGE_PATH comes from the environment and isn't in this backup." Mutation `storage` → the test fails |
| 11 | The backup tests pass on SQLite | no | confirmed | `npx vitest run --project db src/server/backup scripts/backup.db.test.ts` → 16 passed, 1 skipped (the server-only lock test). `cli.test.ts` → 4 passed |
| 12 | The backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm run test:db:<x> -- src/server/backup scripts/backup.db.test.ts` → 16 passed, 1 skipped (the SQLite-only audit test) on all three. The first MySQL and MariaDB runs each failed once in `scripts/backup.db.test.ts › refuses bad flags` (detail not captured); 8 later runs all green. Likely, not proven: another agent was rebuilding `packages/core/dist` at the same time |
| 13 | *Done when*: tests cover each flag, a disk-full failure (mock writer), and `--keep`'s limits | yes | confirmed | `cli.test.ts`: `--out`/`--out=`, `--no-settings`, `--keep` 1 to 10,000 and bad values, `--yes`/`-y`, `--help`/`-h`, unknown flags, empty `--out`. `run-backup.db.test.ts:315` ENOSPC after 3 KiB: no `.partial`, no `--keep`, no audit. `:357` `--keep` cases. Mutations `enospc` and `keepname` → 1 failure each |
| 14 | Wiring: `pnpm run backup`, tsdown entry, `docker/pnpm`, `rmk-server`'s `SCRIPTS` and help, `scriptForService` | yes | confirmed | `package.json:29`, `apps/web/package.json:19`, `tsdown.config.ts:20`, `docker/pnpm:19`, SCRIPTS includes `backup`, SCRIPT_VERBS `backup: "back it up"`; `rmk-server --help` lists it; `packages/server` vitest → 120 passed |
| 15 | Folder 0700 when created, archive 0600, `--out` inside storage refused | yes | confirmed | `backups/` drwx------, archives -rw-------; an existing 0755 `--out` stays 0755 ("created with"); `--out <storage>/sub/b` → "… is inside the storage folder …", exit 1, nothing made; `--keep 0` → exit 2 |
| 16 | Lint and typecheck of the changed code | no | confirmed | `npx biome check apps/web/src/server/backup apps/web/scripts/backup*.ts packages/server/src` → no fixes; `pnpm --filter @ronneai/web typecheck` → no errors |

**Overall:** not met: the seven earlier findings are fixed and tested, but with a server database the `.partial` is created before the server is reached, so an unreachable or refusing server reports "The backup failed … partial archive was removed", and a process killed while connecting leaves the file (row 2). Also: stray archives in `apps/web/mine/` from an earlier test run, to delete before committing.

### Adversarial re-check

Witnessed: 2026-10-12 17:31 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 + working tree as of 17:26 EDT (the `select 1` change landed while it ran; claims 5 and 21 were probed again after it). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Archive: `backup.json` first, `database/<table>/<part>.jsonl`, `storage/…`, `settings.env`, `manifest.json` last | no | confirmed | `tar tf` on a fresh archive → first `backup.json`, last `manifest.json`; `backup.json` has format 1, ronne 0.3.2, dialect sqlite, 24 migrations in order |
| 2 | Every entry's size and sha256 are in the manifest | no | confirmed | Extracted, then a Python check against `manifest.json` → 8 entries, 0 bad; only `backup.json`/`manifest.json` unlisted |
| 3 | Output: path, size, counts, sensitive-settings warning | no | confirmed | `Wrote …/ronne-backup-…tar (319 KiB)`, `26 rows in 25 tables, 1 stored file (293 KiB)`, `! It holds the settings file, with AUTH_SECRET…` |
| 4 | Disk full: partial removed, `--keep` doesn't run, exit 1 | yes | confirmed | A 4 MiB HFS+ image plus a 6 MB storage file, `--keep 1` → `✗ The backup failed: the disk is full (ENOSPC)…`, exit 1; the two old archives still there, no `.partial`, no `instance.backup_made` added (16 → 16) |
| 5 | Nothing written before the database opens; a database that can't be opened → exit 1 | yes | confirmed | After 17:26: PG wrong password → `The database couldn't be opened: password authentication failed… (28P01). Nothing was written.`; MariaDB unknown db → the same; blackhole host 10.255.255.1 → no `.partial` during the connect, SIGTERM leaves nothing. Remark: the empty `--out` folder is made before the database opens |
| 6 | A missing SQLite file is never created; odd URLs | yes | confirmed | `file:./wprobe-missing.db`, `file:/…/missing.db?mode=ro` → "isn't there", nothing created; `file:` → worded "Unsupported"; a directory → SQLITE_CANTOPEN; a garbage file → SQLITE_NOTADB; an empty file and `file::memory:` → "no such table: ronne_migration", partial removed, exit 1 |
| 7 | Every error before the write is worded (no stack trace) | yes | partly | `--out` through a file, ENAMETOOLONG, EACCES folder, EPERM `/usr/bin`, data dir a file → worded. An unreadable settings file (`chmod 000`) or `RONNE_ENV_FILE` a directory → raw stack trace from `loadConfig` (`config.ts:36`, called at `run-backup.ts:200`); the worded branch at `run-backup.ts:208-215` is never reached |
| 8 | SIGINT/SIGTERM/SIGHUP while writing removes the partial (130/143/129) | yes | confirmed | A 3 GB storage file, direct `node`: 130/143/129, `Stopped (…): the partial archive was removed.`, folder empty. Through `pnpm run backup`: partial removed, but pnpm reports exit 1. Through `rmk-server` in-process: 143 and removed |
| 9 | Signals at other moments; handlers not left registered | no | confirmed | Before the file exists: killed, nothing left. After the rename, during `--keep` over 30,000 archives: default kill, complete archive kept, no partial. Listener counts stay 0 after 3 successes, a write failure, an open failure and a sync failure |
| 10 | `--out` folder 0700, archive 0600 | yes | confirmed | `umask 000`, `--out o7/a/b` → `drwx------` both levels, `-rw-------` archive |
| 11 | `--out` inside storage is refused | yes | partly | Refused: storage itself, trailing `/`, deep subfolders, `STORAGE`/`Storage`, a symlink to storage, `..`, `./`, `//`. Not refused: storage folder missing on a case-insensitive disk (`STORAGE_PATH=…/Stor`, `--out …/stor/b`) → written, and the next backup holds `storage/b/ronne-backup-….tar` |
| 12 | Relative `--out` in a clone follows INIT_CWD as the SPEC says | yes | confirmed | From `docs/`, `pnpm run backup --out wprobe-rel` → `<repo>/wprobe-rel`; from `apps/web/src`, `pnpm run backup` → `apps/web/src/wprobe-a`; from `docs/`, `pnpm --filter @ronneai/web run backup` → `docs/wprobe-c`. All match INIT_CWD. The notes' "folder of the package whose script ran" is inexact (second and third cases) |
| 13 | `rmk-server` makes `--out` absolute before the script runs | yes | partly | `rmk-server backup --out rel --keep 1` from `cwd/` → `cwd/rel/…tar`. But `rmk-server backup --out --no-settings` → wrote `cwd/--no-settings/…tar` with the settings included; the script alone refuses it (exit 2) |
| 14 | Docker stand-in sets `RONNE_CALLER_CWD` and runs `dist-scripts/backup.mjs` | yes | confirmed | `docker/pnpm` with the `cd` and `node` paths swapped for local ones, from `dk/` with `--out rel` → `dk/rel/…tar`. The image wasn't built |
| 15 | `--no-settings` | no | confirmed | `dist-scripts/backup.mjs --no-settings` → no `settings.env`, `settings: {included: false}`, "isn't in it (--no-settings)" |
| 16 | `--keep n` touches only exact archive names, never the new one; a file it can't remove is named | yes | confirmed | `.partial`, `.TAR`, a short stamp, `other.tar`, a symlink (target intact), a directory, the 2099 archive → untouched; 2 removed; a `chflags uchg` file → `--keep couldn't remove … (EPERM)`, backup succeeded. `0`, `1e3`, `١` → exit 2 |
| 17 | Environment-only settings named; STORAGE_PATH compared as a folder | no | confirmed | `…/storage/`, `…/./storage` → no warning; another folder → named; `AUTH_SECRET`+`TRUST_PROXY` → "come from the environment"; same values → none; docker → the compose.yaml hint |
| 18 | `instance.backup_made` after completion; audit failure still succeeds | no | confirmed | Row: actor null, target instance/null, metadata `{"via":"cli","tables":25,"rows":22,"files":1,"bytes":325120,"encrypted":false,"settings":true}`; read-only DB file → exit 0, `! The backup is complete, but recording it in the audit log failed (SQLITE_READONLY)` |
| 19 | Concurrent backups in the same second | no | confirmed | 3 parallel runs, same `--out` → one `Wrote`, two `….partial already exists…` exit 1, one archive |
| 20 | Control characters in printed storage names are escaped | yes | confirmed | `\e]0;pwn\a` and `\e[31m` (in a directory) → printed `\x1b]0;pwn\x07x`, `d\x1b[31m/f`; `od -c` shows no raw 033/007 |
| 21 | Tests pass on SQLite and the three servers | no | confirmed | After 17:26: 16 passed, 1 skipped on SQLite and on each server. Remark: the refused-connection test would also pass without `select 1` (the old code removed the partial too) |
| 22 | Script, `pnpm run backup`, tsdown entry, `SCRIPTS`, help, `scriptForService` | yes | confirmed | `build:scripts` → `dist-scripts/backup.mjs` runs; root and app scripts; SCRIPTS has `backup`; `--help` lists it; `run.ts` passes `scriptArgs(...)` to `scriptForService`; `cli.test.ts` → 9 passed |

**Overall:** not met: an unreadable settings file prints a raw stack trace; `rmk-server backup --out --no-settings` writes into a folder named `--no-settings` with the settings included; on a case-insensitive disk with the storage folder missing, `--out` in another case gets inside storage. Minor: through `pnpm run`, signals end with pnpm's exit 1; the refused-connection test doesn't tell the `select 1` fix from the old behaviour.

### Re-check

Witnessed: 2026-10-12 17:34 EDT, by a fresh agent (blind). Commit: a7fbdee5 plus the working tree (git diff and the untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 2) SPEC: "Nothing is written before the settings are read and the database answers", for a server database too. One that refuses or can't be reached never gets a `.partial` | yes | confirmed | Real `scripts/backup.ts` from a scratch copy: PG wrong password → "✗ The database couldn't be opened: password authentication failed … (28P01). Nothing was written.", exit 1; PG port 1 → "connect ECONNREFUSED … Nothing was written.", exit 1; MySQL wrong password → ER_ACCESS_DENIED_ERROR, exit 1; MariaDB unknown db → ER_BAD_DB_ERROR, exit 1; out folder empty each time. Blackhole `10.255.255.1` (pg and mysql): no file after 5 s; SIGKILL → 137, SIGTERM → 143, folder empty. Left to time out, mysql → "connect ETIMEDOUT. Nothing was written.", exit 1. `run-backup.ts:302-309` runs `select 1` before `openOutput` at `:313`. Remark: the empty `--out` folder (0700) is still made at `:258`, before the database answers |
| 2 | A repository test separates the `select 1` fix from the old clean-up-after behaviour | no | confirmed | `run-backup.db.test.ts:447-464` (postgres://…@127.0.0.1:1, `openOutput` watched, `expect(opened).toBe(false)`). Scratch mutation removing `select 1` → "expected true to be false", 1 failed / 13 passed; restored → 14 passed |
| 3 | No stray archives left in the repository (`apps/web/mine/`) | no | confirmed | `ls apps/web/mine` → no such file; `find apps packages -name 'ronne-backup-*'` (outside node_modules) → nothing; `git status --ignored apps/web` → only `.env`, `data/` (ronne.db, storage, no backups), `.turbo`, `dist-scripts`, `test-results`, `.DS_Store` |
| 4 | A settings file that can't be read stops it with exit 1, worded, nothing written | yes | confirmed | `chmod 000` on the env file → "✗ The settings file couldn't be read (EACCES). Nothing was written: run it as the account that runs the server.", exit 1, out folder not created |
| 5 | A SQLite file the settings name that isn't there is never created | yes | confirmed | `DATABASE_URL=file:<scratch>/x.db` → "✗ The settings name a SQLite database file that isn't there…", exit 1; no `x.db` |
| 6 | Backup tests pass on SQLite | no | confirmed | `npx vitest run --project db src/server/backup scripts/backup.db.test.ts` → 16 passed, 1 skipped |
| 7 | Backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm run test:db:{postgres,mysql,mariadb} -- src/server/backup scripts/backup.db.test.ts` → 16 passed, 1 skipped on each, no flakes |
| 8 | Flag tests and the server package | no | confirmed | `cli.test.ts` → 4 passed; `packages/server` → 12 files, 120 passed |
| 9 | *Done when*: tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits | yes | confirmed | `cli.test.ts` flags and `--keep` bounds; `run-backup.db.test.ts:329` ENOSPC after 3 KiB. Scratch mutations: no unlink on failure → the disk-full test fails; `slice(keep)` → 2 `--keep` tests fail |
| 10 | (notes) `scriptArgs` leaves a `--out` value that starts with `-` alone; the script refuses `--out --no-settings` | yes | confirmed | `packages/server/src/cli.test.ts:108-111` passes; script `--out --no-settings` → "✗ Option '--out' argument is ambiguous…", exit 2 |
| 11 | (notes) Inside storage is judged without regard to case on macOS, even when storage doesn't exist yet | yes | confirmed | `STORAGE_PATH=<s>/Stor` (missing), `--out <s>/stor/b` → "… is inside the storage folder…", exit 1, neither folder made; `run-backup.ts:150-152` |
| 12 | Lint and typecheck of the changed code | no | confirmed | `npx biome check apps/web/src/server/backup apps/web/scripts/backup*.ts packages/server/src` → no fixes; `pnpm --filter @ronneai/web typecheck` → exit 0 |

**Overall:** met: a server database that refuses, can't be reached or is killed while connecting leaves no `.partial`, and a test catches a return to the old behaviour; the stray archives are gone; the Done when holds on SQLite, PostgreSQL, MySQL and MariaDB. Minor: the empty `--out` folder is made before the database answers (allowed by the SPEC's wording).

### Adversarial re-check

Witnessed: 2026-10-12 17:41 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 + working tree (git diff and the untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 7) An unreadable settings file stops the backup with a worded error and exit 1, and writes nothing | yes | confirmed | `chmod 000` settings, `RONNE_ENV_FILE=<it> scripts/backup.ts --out b7` → "✗ The settings file couldn't be read (EACCES). Nothing was written…", exit 1, no stack, no `b7/`. Test at run-backup.db.test.ts:466-470 |
| 2 | (prior 7) `RONNE_ENV_FILE` set to a folder gives the same worded error | yes | confirmed | `RONNE_ENV_FILE=<dir>` → "✗ The settings file couldn't be read (EISDIR)…", exit 1, no stack. No repository test for the folder case |
| 3 | Other things `loadConfig` can hit give a worded error | no | confirmed | ENOTDIR, ELOOP, a relative missing path → "✗ This instance isn't set up yet…", exit 1, no stack. Remark: reported as "not set up" rather than "can't be read"; a FIFO settings file hangs (the server would too) |
| 4 | A settings file that changes between `loadConfig`'s read and the backup's own read is handled | no | partly | A preload patching `fs.readFileSync` acts right after loadConfig's read: unreadable → EACCES, worded; a folder → EISDIR, worded. **Removed** → the backup completes, exit 0, no `settings.env`, "There's no settings file to back up: the settings come from the environment.", which is wrong: DATABASE_URL and AUTH_SECRET came from the file |
| 5 | (prior 11) Storage folder missing, `--out` in another ASCII case → refused | yes | confirmed | `STORAGE_PATH=…/c-ascii/Stor`, `--out …/c-ascii/stor/b` → "… is inside the storage folder…", nothing made. Test at run-backup.db.test.ts:286-298 |
| 6 | Storage folder missing, `--out` spelled another way that APFS treats as the same → refused | yes | not met | APFS equates `Café`/`café` (NFC/NFD), `Straße`/`STRASSE`, `σοφος`/`σοφοσ`, `ﬀ`/`ff`; `toLowerCase` doesn't. `STORAGE_PATH=…/Café` (NFC), `--out …/café/b` (NFD); `Straße`/`STRASSE`; `σοφος`/`σοφοσ` → each "Wrote …/b/ronne-backup-….tar", exit 0, `ls <storage>` → `b`; `tar -tvf` → `storage/b/ronne-backup-20261012-213647.tar.partial` |
| 7 | Storage that exists in one spelling, `--out` in another (fully or partly existing, Unicode too) → refused | yes | confirmed | `e-ss/Straße` exists, `--out e-ss/STRASSE/b` → refused; NFC folder with NFD `--out` → refused; `Straße` exists without `storage` under it, `--out STRASSE/storage/b` → refused, nothing made. `realpath` returns the disk's spelling |
| 8 | (prior 13) `rmk-server backup --out --no-settings` is refused, and no folder is made | yes | confirmed | `node packages/server/dist/bin.js backup --out --no-settings` → "✗ Option '--out' argument is ambiguous…", exit 2, no folder; same for `--out -x`, `--out --`. cli.test.ts:109 |
| 9 | A folder really named `-x` can still be chosen through `rmk-server` | no | confirmed | `--out=-x` → `typed/-x/…tar`; `--out ./-y` → `typed/-y/…tar` |
| 10 | `rmk-server` makes every relative `--out` absolute before the script runs (SPEC "Where") | yes | not met | `scriptArgs("backup",["--out","-"],"/home/alex")` → `["--out","-"]`, left relative, and the script accepts `-`. In-process with `INIT_CWD=<initcwd>`, typed in `typed2/`: `--out -` → `initcwd/-/…tar`; under the service (`cwd: "/"`, control.ts:285) it means `/-` |
| 11 | An empty or blank `--out` is refused the same way through `rmk-server` as through the script | no | partly | `--out=` → kept empty, refused. `--out " "` → `scriptArgs` makes `/home/alex/ `, past the script's `trim() === ""` check: "Wrote …/typed/ /ronne-backup-….tar". The script alone → "--out needs a folder.", exit 2 |
| 12 | Signals through `pnpm run`: the partial is removed, and pnpm exits 1 as SPEC now says | no | confirmed | `pnpm --filter @ronneai/web run backup` on a 30 GiB sparse storage file, INT/TERM/HUP to the group once the `.partial` appeared → "! Stopped (SIG…): the partial archive was removed.", pnpm exit 1, folder empty. SPEC says "through `pnpm run`, pnpm reports 1" |
| 13 | A direct run still exits 130 on SIGINT | yes | confirmed | `node --import tsx scripts/backup.ts`, SIGINT mid-write → 130, "Stopped (SIGINT)…", folder empty |
| 14 | (prior minor) The refused-connection test tells the `select 1` fix from the old behaviour | yes | confirmed | A temporary test (deleted) mocking `sql` so `select 1` resolves without connecting → `opened = true`, "The backup failed: connect ECONNREFUSED…", `expect(opened).toBe(false)` fails; unmutated, it passes |
| 15 | Backup tests pass on SQLite | no | confirmed | 16 passed, 1 skipped; `cli.test.ts` → 4 passed |
| 16 | Backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm run test:db:postgres\|mysql\|mariadb -- src/server/backup scripts/backup.db.test.ts` → 16 passed, 1 skipped on each |
| 17 | `packages/server` tests pass | no | confirmed | 12 files, 120 passed |
| 18 | No regression: archive layout, manifest hashes, modes, `--keep` | yes | confirmed | Real run `--keep 2 --yes` → "Removed 2 older archives"; `.partial`, `other.tar`, the newer 2022 archive kept. Python `tarfile` → `backup.json` first, `manifest.json` last, 7 entries, 5 listed, 0 bad sha256 or size, all 0600 |
| 19 | Lint and typecheck of the changed code | no | confirmed | `npx biome check …` → no fixes; web and marketplace typecheck → 0 |

**Overall:** not met: with the storage folder missing, Unicode spellings APFS treats as the same (NFC/NFD, ß/SS, σ/ς) still get `--out` inside storage; `rmk-server backup --out -` isn't made absolute; `--out " "` gets past the blank check through `rmk-server`; a settings file removed mid-start gives exit 0 and a false "settings come from the environment". Remark: ENOTDIR/ELOOP on `RONNE_ENV_FILE` read as "not set up", and a FIFO settings file hangs.

### Adversarial re-check

Witnessed: 2026-10-12 17:52 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 plus the working tree (git diff and the untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 6) The storage folder is missing and `--out` uses a spelling APFS treats as the same folder (NFC/NFD, ß/SS, σ/ς, ﬀ/ff, İ/i̇): the backup refuses | yes | confirmed | Real `scripts/backup.ts` with `STORAGE_PATH=<d>/<s>` (missing), `--out <d>/<o>/b`: `Café`/`café`, `Straße`/`STRASSE`, `σοφος`/`σοφοσ`, `ﬀx`/`FFX`, `İ`/`i̇` → "✗ … is inside the storage folder…", exit 1, no folder made. Test at run-backup.db.test.ts:286-306 |
| 2 | Every other spelling that APFS treats as the same folder is refused too | yes | not met | 36 pairs made on APFS, compared with `normalize("NFC").toUpperCase().toLowerCase()`: APFS treats `ẞ` (U+1E9E) as `ß`, `ss` and `SS`; the fold doesn't (`ẞ`→`ß`, `ß`→`ss`). `STORAGE_PATH=<d>/ẞ` (missing), `--out <d>/SS/b`, `<d>/ß/b` or `<d>/ss/b` → "Wrote …/SS/b/ronne-backup-….tar", exit 0, `[ -e <d>/ẞ/b ]` true, "1 stored file (0 B)": the archive holds its own partial file. The other way, `ı` (U+0131) storage with `--out I/b` is refused though APFS keeps them apart (harmless) |
| 3 | On Windows, names are compared as NTFS compares them | yes | can't check here | No Windows here, and CI doesn't run the web database tests on Windows. Remark: NTFS uses simple upper-casing without normalisation, so the NFC step can only refuse more, never less |
| 4 | (prior 10) `rmk-server` makes `--out -`, `--out=-` and `--out=--` absolute before the script runs | yes | confirmed | `scriptArgs("backup",["--out","-"],"/home/alex")` → `["--out","/home/alex/-"]`; `--out=-` → `--out=/home/alex/-`. Through the real script: "Wrote …/typed/-/…tar" for both, `…/typed/--/…tar` for `--out=--`. cli.test.ts:109 |
| 5 | (prior 11) A blank `--out` is refused the same way through `rmk-server` as by the script | yes | confirmed | Space, tab, `\n`, U+3000, `--out= `, `--out=<tab>` stay blank → "✗ --out needs a folder.", exit 2, both ways. U+200B is a folder name both ways. cli.test.ts:110-111 |
| 6 | Flag-like values are never taken as a folder: `--out -- x`, `-- --out x`, `--out --no-settings`, `--out -<tab>` | yes | confirmed | Passed through unchanged, then refused by `parseBackupCommand` ("ambiguous…" or "Unexpected argument…"). `--out x --out -` → the last, made absolute |
| 7 | (prior 4) The settings file removed between the two reads while every setting comes from it: exit 1, nothing written | yes | confirmed | Temporary probe test (deleted) with `beforeSettingsFile: rmSync` → "The settings file changed while the backup was starting. Nothing was written…", no out folder. Test at run-backup.db.test.ts:561-575 |
| 8 | SPEC: "So does a settings file that changes between being read for the settings and being read into the archive" (exit 1) | no | not met | Same probe. Only `AUTH_SECRET` changed → exit 0, the archive holds the new secret; only `PUBLIC_URL` changed or `TRUST_PROXY` added → exit 0; file removed with `DATABASE_URL` and `STORAGE_PATH` in the environment → exit 0 and "the settings come from the environment" though `AUTH_SECRET` came from the file; no file at the first read and one made before the second → exit 0, that file archived; the file's `DATABASE_URL` changed while the environment overrides it → exit 0. run-backup.ts:241-247 compares only `DATABASE_URL` and `STORAGE_PATH` |
| 9 | The `--out` folder is made only once the database has answered | yes | confirmed | `DATABASE_URL=postgres://a:b@127.0.0.1:1/x`, `--out <s>/never/made` → "connect ECONNREFUSED… Nothing was written.", exit 1, `never/` absent; `select 1` (:315) before `mkdir` (:324); the test at :462 checks `data/backups` doesn't exist |
| 10 | The database answers, then `mkdir` fails: a worded exit 1, the pool closed, nothing left | no | confirmed | PostgreSQL and MySQL, `--out <ro>/a/b` with `<ro>` 0500 → "✗ The folder … couldn't be made: … (EACCES)…", exit 1, 0.4 s, `<ro>` empty (an open PostgreSQL pool keeps the process 10.7 s, so the pool was closed). Remark: the message lacks "Nothing was written" |
| 11 | No regression: archive layout, hashes, modes, links and tmp files, `--keep` | yes | confirmed | `--out <k> --keep 2 --yes` → "Removed 2 older archives"; `.partial`, `other.tar`, a link named like an archive, the 2022 archive kept. Python `tarfile`: `backup.json` first, `manifest.json` last, 7 entries all 0600, 5 listed, 0 bad sha256 or size; tmp file and link left out and named; new folder 0700, archive 0600; `--keep 0`, `--keep 10001`, `--bogus` → exit 2 |
| 12 | *Done when*: tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits | yes | confirmed | `cli.test.ts` flags and `--keep` bounds; ENOSPC at run-backup.db.test.ts:344-369; `--keep` at :386; all pass |
| 13 | Backup tests pass on SQLite | no | confirmed | 17 passed, 1 skipped |
| 14 | Backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm run test:db:postgres\|mysql\|mariadb -- src/server/backup scripts/backup.db.test.ts` → 17 passed, 1 skipped on each |
| 15 | `packages/server` tests pass | no | confirmed | 12 files, 120 passed |
| 16 | Lint and typecheck of the changed code | no | confirmed | biome → no fixes; web and marketplace typecheck → exit 0 |

**Overall:** not met: with the storage folder missing, `ẞ` (U+1E9E) still lets `--out` go inside storage; a settings file changed between the two reads in any way but `DATABASE_URL` or `STORAGE_PATH` gives exit 0; Windows can't be checked here. The fixes for `--out -`, a blank `--out`, plain removal of the settings file, the mkdir after the database answers, and the rest of the task hold on the four databases.

### Adversarial re-check

Witnessed: 2026-10-12 18:02 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 plus the working tree (git diff and the untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 2) The storage folder is missing and `--out` is `SS`, `ß` or `ss` while storage is `ẞ` (U+1E9E): refused, and nothing is left | yes | confirmed | Real `scripts/backup.ts`, `STORAGE_PATH=<d>/ẞ` (missing), `--out <d>/{SS,ß,ss}/b` → "✗ … is inside the storage folder…", exit 1; `ls -A <d>` → only `.env`. Test at run-backup.db.test.ts:300-321 |
| 2 | Storage exists in one spelling and `--out` uses another (ẞ/ss, NFC/NFD), or storage is partly there: refused, and only the folders it made are removed | yes | confirmed | `ẞ` exists, `--out ss/new/b` → refused before mkdir; `Café` (NFC) exists, NFD `--out` → refused; `Aẞ` exists without `storage`, `--out ass/STORAGE/b` → refused, `Aẞ` kept and empty; storage `X/ẞ`, `--out x/SS` → refused, nothing left |
| 3 | Links: storage as a dangling link, `--out` through a link | yes | confirmed | Storage `L`→`t` (dangling), `--out t/x/b` → refused, `t/` removed, `L` kept; `L`→`T`, `--out t/x/b` → the same; `--out L/b` with `L` → the missing storage → "couldn't be made: ENOTDIR…", exit 1, nothing made; link `SS`→`real` with storage `ẞ` → refused, `real/` left empty |
| 4 | `--out` outside a missing storage still works and doesn't create storage; an existing empty `--out` is used | no | confirmed | Storage `ẞ` missing, `--out other/b` → "Wrote …", exit 0, only `other/b`; `--out pre` (existing) → written, `pre` kept |
| 5 | The removal after a refusal never takes a folder it didn't make, or one that isn't empty | yes | confirmed | A preload hooking `fs.promises.mkdir`: a file put into `made` → refused, `SS/someone-elses.txt` left; a file in `SS/x/b` → all three folders left; `x/` made by another before mkdir → `x/` kept; storage made by another as `SS`, `--out ss/b` → `ss/b` removed, `SS` kept. `rmdir` only (run-backup.ts:327-330) |
| 6 | A storage folder created by something else between the checks never lets `--out` inside | yes | confirmed | Hook makes storage before our mkdir: `--out ss/b` against `SS` → refused. Remark: with `--out` elsewhere it also refuses ("…/elsewhere/b is inside the storage folder"), a false refusal: safe, but the message is wrong |
| 7 | On Windows, the disk judges names the same way | yes | can't check here | No Windows here; the web database tests don't run on Windows in CI. What depends on Windows: that `realpath` gives NTFS's spelling, and that `existsSync` after `mkdir` sees the NTFS match; the code folds nothing itself. Remark: the test at run-backup.db.test.ts:286-321 runs on `win32` and expects refusals for `Straße`/`STRASSE`, `Café`/NFD, `ẞ`/`SS`, `ẞ`/`ß`, which NTFS treats as different names, so it would fail there |
| 8 | The settings file is read once; the settings and the archive come from that one read | yes | confirmed | `grep loadConfig\|envFilePath\|readFile` in backup/, scripts/backup.ts, create-db, dump, audit → only run-backup.ts:216-219. A temporary copy archiving `settingsText + "#"` → a test fails |
| 9 | Every setting follows the server's rules: environment over file, an empty variable unset, `STORAGE_PATH`'s default | yes | confirmed | Probe with a mock output: env `DATABASE_URL=""` → the file's; env `STORAGE_PATH=""` → the file's; env `STORAGE_PATH=B` → B's file archived; file `DATABASE_URL=` with none in env → "isn't set up"; no STORAGE_PATH → `./data/storage`; `RONNE_RUNTIME=npm` → `RONNE_DATA_DIR/storage`; relative paths from the app. Same expressions as config.ts:38,45. Remark: no repository test catches env-over-file (a copy with `file[key] \|\| env[key]` passes all 14) |
| 10 | Environment-only settings are named as SPEC says | no | confirmed | Env equal to the file, an empty `AUTH_SECRET`, `STORAGE_PATH` with a trailing `/` → none; a different `AUTH_SECRET`/`PUBLIC_URL`/`TRUST_PROXY` → all three named; no file → "no settings file to back up…" plus the three |
| 11 | The archived `settings.env` is "the settings file as it is" | no | partly | Byte-equal for LF, CRLF, BOM, no final newline, quotes, `export`, NUL. Not for invalid UTF-8: `# caf\xe9` in a comment or a Latin-1 byte in `PUBLIC_URL` → differs: `readFile(envFile, "utf8")` (:219) then `Buffer.from(settingsText)` (:375) makes it U+FFFD |
| 12 | Nothing is written before the settings are read and the database answers | no | confirmed | `postgres://a:b@127.0.0.1:1/x`, `--out never/made` → "connect ECONNREFUSED… Nothing was written.", exit 1, only `.env`; a missing SQLite file → refused, nothing made; `chmod 000` settings → EACCES, worded; settings path a folder → EISDIR, worded |
| 13 | No regression: layout, hashes, modes, links and tmp files, `--keep`, flags | yes | confirmed | `--out k --keep 2 --yes` → "Removed 1 older archive (--keep 2)"; `.partial`, `other.tar`, a link named like an archive untouched. Python `tarfile`: `backup.json` first, `manifest.json` last, 7 entries 0600, 5 listed, 0 bad. Folder 0700, archive 0600; `--keep 0`, `10001`, `1.5`, `--out` with no value → exit 2 |
| 14 | *Done when*: tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits | yes | confirmed | `cli.test.ts` → 4 passed. Temporary mutated copies (deleted): no unlink on failure → the disk-full test fails; `slice(keep)` → 2 `--keep` tests fail; no `rmdir` → the `--out` test fails; post-mkdir check off → the `--out` test fails |
| 15 | Backup tests pass on SQLite | no | confirmed | 16 passed, 1 skipped |
| 16 | Backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | 16 passed, 1 skipped on each |
| 17 | `packages/server` tests pass | no | confirmed | 12 files, 120 passed |
| 18 | Lint and typecheck of the changed code | no | confirmed | biome → no fixes; web typecheck → exit 0 |

**Overall:** not met: the inside-storage check now asks the disk and held every spelling, link and race tried, and its clean-up never removed a folder it didn't make or one that wasn't empty; the settings read once follow the server's rules. Open: a settings file that isn't valid UTF-8 isn't archived as it is (11); Windows can't be checked here (7), where the test's Unicode expectations look wrong for NTFS. Minor: a false refusal with the wrong message when another process makes storage between the checks; no test catches env-over-file being inverted.

### Adversarial re-check

Witnessed: 2026-10-12 18:12 EDT, by a fresh agent (adversarial). Commit: a7fbdee5 plus the working tree (git diff and the untracked `apps/web/src/server/backup/`, `apps/web/scripts/backup.ts`, `apps/web/scripts/backup.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (prior 11) The settings file is archived byte for byte, including bytes that aren't valid UTF-8 | yes | confirmed | Real `scripts/backup.ts`, a settings file with a BOM, `\xe9`, `\xff\xfe`, overlong `\xc0\x80`, a surrogate `\xed\xa0\x80`, a lone CR, CRLF, a Latin-1 `PUBLIC_URL`, NUL, `\xf4\x90\x80\x80` → `cmp` with the extracted `settings.env`: byte-equal; sha256 689ecfb4… = `manifest.files["settings.env"]` (434). run-backup.ts:220 `readFile(envFile)`, :374 `settingsBytes`. A copy re-encoding through UTF-8 → the test at run-backup.db.test.ts:573 fails |
| 2 | The settings file is read once; the settings and the archived copy come from that read | yes | confirmed | `grep readFile\|loadConfig\|envFilePath` over backup/, scripts/backup.ts, dump, snapshot, create-db → only run-backup.ts:216-220 |
| 3 | Environment over file, an empty variable unset, as the server reads them; a test catches it inverted | no | confirmed | Real script: `DATABASE_URL=` → the file's; `STORAGE_PATH=` → the file's storage; `STORAGE_PATH=<other>` → `storage/fromenv.bin`, named as environment-only; no file with the values in env → "no settings file to back up…", both named. Mutants `file[key] \|\| env[key]` and `env[key] ?? file[key]` → test :573 fails |
| 4 | (prior minor) A storage folder made by another process between the checks no longer gives a false refusal | yes | confirmed | A hook on `fs.promises.mkdir` makes `<d>/store` before the backup's mkdir of `<d>/elsewhere/b` → "Wrote …", exit 0; making `SS` with storage `ẞ` and `--out ss/b` → refused, `SS` kept, `ss/b` removed; `STORE` with `--out store/b/c` → refused, only `STORE` left |
| 5 | Inside storage is judged by the disk (`realpath` of both after mkdir) for every spelling APFS equates, storage missing or existing, the folders made removed | yes | confirmed | Storage missing: Straße/STRASSE, Café/NFD, σοφος/ΣΟΦΟΣ, ẞ/SS, ẞ/ß, ẞ/ss/x, ﬀx/FFX, İ/i̇, a/ẞ→A/SS, store/STORE → refused, only `.env` left. Existing: Straße, ẞ/ss, Café/NFD, store → refused, storage kept. `ı` with `--out I/b` → written (APFS keeps them apart). Dangling `L→t`/`L→T` with `--out t/x/b` → refused, `t` removed; `L→REAL` with `real/b` → refused; `zz/../STORE/./b` → refused |
| 6 | The tests bite: Unicode (macOS), ASCII case (macOS and Windows), the `existsSync`/`realpath` check | yes | confirmed | run-backup.db.test.ts:288 and :301. Mutants: no realpath → fails; only `outDir` realpath'd → fails; `existsSync` → `false` → fails; `rmdir` a no-op → fails |
| 7 | On Windows, the disk judges names the same way | yes | can't check here | No Windows here. What depends on it: that `fs.promises.realpath` (libuv, `GetFinalPathNameByHandleW`) gives NTFS's stored spelling for an existing folder, and `existsSync(storageRoot)` sees a folder NTFS matches case-insensitively. `path.win32.relative` already lowercases both sides, so a mismatch could only refuse more. No test or CI job shows it: ci.yml and database.yml run on `ubuntu-latest`, so the `win32` branch of :288 never runs; server-checks.yml's Windows `backup --keep 1` would show only a basic failure |
| 8 | Nothing is written before the settings are read and the database answers; errors are worded | no | confirmed | `file:<missing>.db` → "SQLite database file that isn't there. Nothing was written", exit 1; the test at :460 passes; `--out O/b` with `O` a link into storage whose target is missing → "couldn't be made: ENOTDIR…", nothing made |
| 9 | No regression: layout, hashes, modes, links and tmp files, `--keep`, flags | yes | confirmed | `--out k --keep 2 --yes` → "Removed 2 older archives (--keep 2)"; `other.tar`, `.partial`, a link named like an archive kept. Python `tarfile`: `backup.json` first, `manifest.json` last, 6 entries 0600, 4 listed, 0 bad. `--keep 0`, `10001`, `1.5`, `--out` with no value, `--bogus`, `--out ''` → exit 2 |
| 10 | *Done when*: tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits | yes | confirmed | `cli.test.ts` → 4 passed. Mutants: no `unlink(partial)` → the ENOSPC test (:356) fails; `slice(keep)` → 2 `--keep` tests fail |
| 11 | Backup tests pass on SQLite | no | confirmed | 17 passed, 1 skipped |
| 12 | Backup tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | 17 passed, 1 skipped on each |
| 13 | `packages/server` tests pass | no | confirmed | 12 files, 120 passed |
| 14 | Lint and typecheck of the changed code | no | confirmed | biome → no fixes; `tsc --noEmit` in apps/web → exit 0 |

**Overall:** not met: only Windows is open (7), which can't be checked on this Mac. Settings are archived byte for byte, env over file and empty-as-unset are tested, the false refusal in the race is gone, and every APFS spelling, link and race tried was refused with clean-up; nothing regressed on the four databases. Remarks: storage removed between `existsSync` and `realpath` leaves the new `--out` folder with an ENOENT message; a write that fails after mkdir leaves the new `--out` folder though it says "nothing else changed"; CI runs neither spelling test.

**Owner's decision (2026-10-12):** the Windows claim (row 7 above) is closed by CI: `server-probe.js` now runs `backup --out <data>/STORAGE/b` on macOS and Windows and expects the refusal (it passed here on macOS against the packed `rmk-server`). Task 3 stays unticked until the Windows server-checks job passes on the pull request and a re-check records it. The remarks of the last pass (folders left after a failed write) are fixed: every failure after `mkdir` removes the empty folders it made.

## Task 4 — Encryption

Witnessed: 2026-10-12 22:02 EDT, by a fresh agent (blind). Commit: cc9254da + working tree (crypto.ts/passphrase.ts as before their 22:13 edit). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is 40 bytes as specified: `RONNEBAK`, version 1, KDF 1, scrypt 17/8/1, a new 16-byte salt each time, chunk size 65536 BE, 7 zero bytes | no | confirmed | `xxd -l 40` of a real `.tar.enc` → `524f4e4e4542414b 01 01 11 08 01 <16 salt> 00010000 00…`; crypto.test.ts:62-75 |
| 2 | Key = scrypt(NFC passphrase, salt, N=2^17, r=8, p=1, 32 bytes, maxmem 256·N·r) | no | confirmed | An independent decoder (`scryptSync` + `createDecipheriv` from the spec) opened the archives `scripts/backup.ts --encrypt` wrote → `chunks 1 plain 19968 first entry backup.json ustar` |
| 3 | AES-256-GCM per 64 KiB chunk; nonce = 7 zero bytes, BE counter, last flag; AAD = the header; the last chunk always shorter (empty on an exact multiple) | no | confirmed | crypto.test.ts:77-106; 2×65536 plain bytes → 131160 = 40+2·65552+16. Mutations: flag always 0 → the spec test fails; no AAD → 2 tests fail |
| 4 | Tests show a round trip | no | confirmed | 17 passed; sizes 0, 1, C-1, C, C+1, 3C, 3C+1234 with pushes of 1 to 100000 bytes. Mutation (no counter++ on open) → fails |
| 5 | A wrong passphrase fails | no | confirmed | crypto.test.ts:127-132; run-backup.db.test.ts "--encrypt writes…"; the decoder with `wrong` → "unable to authenticate data" |
| 6 | A cut archive fails | no | confirmed | crypto.test.ts:147-150 (inside the last chunk, a full chunk, to the header, inside the header); 5 bytes cut from the empty last tag → refused |
| 7 | A reordered chunk fails | no | confirmed | crypto.test.ts:151-154, 161: swapped, repeated, dropped, spliced, another archive's header → `damaged` |
| 8 | A flipped bit fails | no | confirmed | crypto.test.ts:162-165 |
| 9 | A dropped last chunk fails | no | confirmed | crypto.test.ts:146; an exact multiple with its empty last chunk dropped → `damaged`. Removing the length check alone leaves the tests green (the flag still catches it) |
| 10 | After a failure the reader hands out nothing more and refuses to go on | no | confirmed | crypto.test.ts:208-221; mutation (bytes out before `final()`) → 3 tests fail. Chunks before the bad one are already out (65536 bytes, then refused), as documented; restore must decrypt everything first. Removing the `failed` latch leaves the tests green |
| 11 | A header it doesn't know or accept is refused before any key is derived | no | confirmed | crypto.ts:77-108 before `deriveKey` (:258-260); each limit ±1 and a reserved byte → `bad_header` |
| 12 | A newer container version is refused as "encrypted by a newer Ronne" | no | confirmed | crypto.test.ts:187-188, 205; the message at crypto.ts:83-87 |
| 13 | Passphrase: NFC; one trailing `\n` or `\r\n` removed only for the file and env; nothing else trimmed; empty refused | no | confirmed | crypto.test.ts:223-236; passphrase.test.ts; a CRLF file with `Pässwörd-ZZQ9 spécial` decrypted with the bare string |
| 14 | `--encrypt` writes `.tar.enc` (0600) and audits `encrypted: true` | no | confirmed | run-backup.db.test.ts:603-640 on SQLite; servers → 20 passed, 1 skipped each; audit rows `"encrypted":true`, no path or passphrase |
| 15 | Asked twice in a terminal, masked; two that differ refused | no | confirmed | `script -q` pty with `TtyPass-WW3` twice → archive opened by the decoder; 0 occurrences in the pty log; `AAA-1`/`BBB-2` → "The two passphrases differ. Nothing was written.", rc 1, no folder |
| 16 | `--passphrase-file` relative to where typed, only with `--encrypt` | no | confirmed | passphrase.ts:40; cli.test.ts; `scriptArgs` makes it absolute; packages/server → 121 passed |
| 17 | `RONNE_BACKUP_PASSPHRASE` for schedules; none and no terminal → exit 2 | no | confirmed | A real run with it → exit 0, opened; scripts/backup.db.test.ts:45-62 |
| 18 | No passphrase in output or logs | no | confirmed | `grep -a` for the three passphrases over the runs' output, `ronne.db*` and the archives → none; the pty log → 0; the db test checks output and audit |
| 19 | The output says a lost passphrase can't be recovered | no | confirmed | "! It's encrypted: without the passphrase it can't be read, and a lost passphrase can't be recovered…" |
| 20 | "Sensitive": with the settings, the output says the archive holds AUTH_SECRET and the database password, and suggests `--encrypt` | no | partly | Plain run → says so with the `--encrypt` hint. With `--encrypt` and the settings, run-backup.ts:442-446 drops the warning, and run-backup.db.test.ts:635 asserts it's absent; SPEC.md:127 and :143 say the output says so whenever the settings are in it |
| 21 | Usage and HELP list the new flags | no | confirmed | `BACKUP_USAGE`; `rmk-server backup [--out DIR] [--encrypt] [--no-settings] [--keep N]` |
| 22 | The adversarial pass reviews the construction against the format spec | no | can't check here | A blind pass; needs the `mode: adversarial` pass |

**Overall:** not met: the container, its failure modes, the passphrase sources and the no-leak scan hold, but the encrypted output drops the "Sensitive" warning the spec asks for (row 20), the adversarial review is separate (row 22), and crypto.ts/passphrase.ts changed during this pass (22:13), so that version needs a re-check. Test gaps: the opener's `failed` latch, the full-chunk-at-end rule, and dropping the empty last chunk of an exact multiple have no test of their own. Side effect of this pass: a probe's setup run rewrote the git-ignored dev settings `apps/web/.env` (DATABASE_URL and STORAGE_PATH now name the witness's scratch instance) and left `apps/web/data/backups/ronne-backup-20261013-020411.tar.enc`; reported to the owner.

### Adversarial pass

Witnessed: 2026-10-12 22:12 EDT, by a fresh agent (adversarial). Commit: cc9254da + working tree (uncommitted crypto.ts, passphrase.ts, their tests, and the cli/run-backup/scripts/server diffs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is the spec's 40 bytes: magic, version 1, KDF 1, 17/8/1, a 16-byte salt, chunk size 65536 big-endian, 7 zero bytes | no | confirmed | `crypto.ts:54-67`; `vitest run crypto.test.ts` → 8 passed, test 1 checks every byte; the `fixedSalt` mutation fails 2 tests |
| 2 | The reader refuses an unknown magic, version or KDF, a nonzero reserved byte, and scrypt or chunk values out of bounds, before deriving a key; a forged header can't use more than 512 MiB | no | confirmed | p2: chunk size 0xFFFFFFFF → `bad_header`; version 0 or 2 → `newer_container`; the largest accepted header (log2N 18, r 8, p 4) derives in 2.0 s with rss +256 MiB at most; garbage → `not_encrypted`; the `noReservedCheck` mutation fails a test |
| 3 | The key is scrypt(passphrase, salt, N, r, p, 32) with maxmem = 256·N·r | no | confirmed | `crypto.ts:121-131`; maxmem removed → 8 of 8 tests fail; test 2 derives the key independently with `scryptSync` from the spec |
| 4 | Passphrase: UTF-8 in NFC, one trailing `\n`/`\r\n` stripped only for the file and env, nothing else trimmed, empty refused | no | partly | Rules hold (`passphrase.test.ts`; env `" a \n"` → `" a "`; NFD and NFC prompts equal; the `noNFC` and `trailingAll` mutations each fail a test; `""`, `"\n"`, `"\r\n"` files exit 2). But the file is decoded lossily with `readFile(…, "utf8")` (`passphrase.ts:40`): `70 77 FF` and `70 77 FE` both give `7077efbfbd`, so two key files open the same archive; a lone surrogate in `RONNE_BACKUP_PASSPHRASE` likewise |
| 5 | nonce = 7 zero bytes, a 4-byte BE counter, the last flag; AAD = the 40-byte header | no | confirmed | `crypto.ts:135-140,167,222`; the test opens chunks by hand from the spec; the `noLastFlag`, `noAAD` and `noCounter` mutations each fail ≥1 test |
| 6 | The last chunk is always shorter than the chunk size, empty for a multiple of it, for any push sizes | no | confirmed | p1: 8 sizes × 5 push patterns on a 4096-byte forged chunk: the layout right every time |
| 7 | The counter never wraps (at most 2^32 chunks), both sides | no | confirmed | Read, not run: `crypto.ts:160` and `:219` refuse `counter >= 2**32` |
| 8 | Round trip | no | confirmed | p1: 240 seal/open combinations of push sizes → byte-equal; CLI archives (env, CRLF file, TTY prompt) open to a tar starting with `backup.json` |
| 9 | A wrong passphrase fails | no | confirmed | the test; the NFD form or a trailing `\n` at the prompt → `damaged`; file+env archive opened with the env value → `damaged` |
| 10 | A cut archive fails at any length | no | confirmed | p1: 190 cut points (every byte 0–41, ±18 around every boundary, the last 20) → never accepted |
| 11 | A reordered, repeated, dropped-middle or spliced chunk, or another archive's header, fails | no | confirmed | crypto.test's 16 cases; the `noCounter` mutation fails it |
| 12 | A flipped bit anywhere fails | no | confirmed | p1: each of the 40 header bytes, plus 60 random flips in chunks and tags → 0 accepted |
| 13 | A dropped last chunk fails, the empty one included | no | confirmed | p1: 2C plaintext without its 16-byte empty last chunk → `damaged` |
| 14 | Bytes after the last chunk, fewer than 16 trailing bytes, magic only, header only, empty input all fail | no | confirmed | p1: appending 1, 15, 16, 17, S−1, S, S+1 bytes → rejected; p2: `RONNEBAK`, magic+5, 7 bytes, the header alone, empty → `damaged` |
| 15 | After a failure the opener hands out nothing more and refuses later calls | no | confirmed | p2: push or end after end → `damaged`; the test checks it after a swap. Chunks before `end` are handed out unchecked by design, so restore must decrypt the whole archive first (the spec says so). The `noFailGuard` mutation survives the tests: the guard has no test of its own |
| 16 | A new salt per archive, so no nonce repeats under a key | no | confirmed | 3 CLI archives → 3 salts; `randomBytes(16)` |
| 17 | `--encrypt`, `--passphrase-file` (only with it, relative to where typed), `RONNE_BACKUP_PASSPHRASE`; the file wins over env | no | confirmed | exit codes 0/0/0; the file+env archive opens with the file's; `--passphrase-file` without `--encrypt` → exit 2; a relative file through `pnpm --dir apps/web run backup` → written; empty, missing, folder file → 2/1/1; env empty with no TTY → 2 |
| 18 | The prompt asks twice, hidden, and refuses a mismatch | no | confirmed | `script` pty: `ttyPass-42` twice → `.tar.enc` that opens with it, 0 echoes in the pty log; `aaa`/`bbb` → "two passphrases differ", no archive |
| 19 | The passphrase never reaches output, errors, logs, audit metadata or the archive | no | confirmed | 11 runs' stdout/stderr, the archive, the decrypted tar, `audit_log` (`"encrypted":true`) → 0 matches; argv holds only the file path |
| 20 | A failure while encrypting removes the partial archive and audits nothing | no | confirmed | A temporary db test (deleted) failing the write at bytes 10, 65576, 70000, 200000 → `BackupFailedError`, empty folder, 0 events, no secret in messages |
| 21 | Name `ronne-backup-…tar.enc`, mode 0600; `--keep` counts `.tar.enc` | no | confirmed | `ronne-backup-20261013-020707.tar.enc`, `600`; `ARCHIVE_NAME` covers `.enc` |
| 22 | `rmk-server` makes `--passphrase-file` absolute | no | confirmed | `packages/server` → 121 passed (the `=` form at `cli.ts:102`) |
| 23 | Suites green on all dialects | no | confirmed | unit 17 passed; db SQLite 20 passed, 1 skipped ×4; PostgreSQL, MySQL, MariaDB on run-backup.db.test.ts → 16 passed, 1 skipped each |

**Overall:** not met: the container matches the format spec byte for byte and every tamper, cut and splice tried fails, but a `--passphrase-file` that isn't valid UTF-8 is decoded lossily, so different key files give the same key (row 4). Minor: the sealer has no guard after `end`; version or KDF 0 is called "newer"; no test pins the opener's failure guard; the opener joins its bytes on every push (quadratic with tiny pushes).

### Re-check

Witnessed: 2026-10-12 22:28 EDT, by a fresh agent (blind). Commit: cc9254da + working tree (crypto.ts 22:15, crypto.test.ts 22:21, passphrase.ts/.test.ts 22:13, run-backup.ts/.db.test.ts 22:15). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is the spec's 40 bytes | no | confirmed | `xxd -l 40` of a CLI `.tar.enc` → `524f4e4e4542414b 01 01 11 08 01 <salt> 00010000 00×7`; crypto.ts:54-67 |
| 2 | Key = scrypt(NFC passphrase bytes, salt, N, r, p, 32), maxmem 256·N·r | no | confirmed | crypto.ts:130-141; an independent decoder from the spec opened the file, env and prompt archives; a wrong passphrase → "unable to authenticate data" |
| 3 | AES-256-GCM per chunk, nonce = 7 zero bytes \| BE counter \| last flag, AAD = header; the last chunk always shorter, empty for an exact multiple | yes | confirmed | crypto.ts:144-149,176-178,203-206; crypto.test.ts:100-116; mutation (no empty last chunk) → "opens what it sealed…" fails |
| 4 | Tests show a round trip | no | confirmed | 18 passed; crypto.test.ts:109-126 |
| 5 | A wrong passphrase fails | no | confirmed | crypto.test.ts:128-133; run-backup.db.test.ts:628-631; the decoder → auth failure |
| 6 | A cut archive fails | yes | confirmed | crypto.test.ts:148-151 |
| 7 | A reordered chunk fails | no | confirmed | crypto.test.ts:152-162 |
| 8 | A flipped bit fails | no | confirmed | crypto.test.ts:163-166 |
| 9 | A dropped last chunk fails, including the empty last chunk of an exact multiple; a full chunk at the end is refused by length | yes | confirmed | crypto.test.ts:174-196; mutation (length check removed) → that test fails |
| 10 | After a failure the opener hands out nothing more and refuses later calls | yes | confirmed | crypto.test.ts:236-249; mutation (`failed = true` removed) → the test fails |
| 11 | A header it doesn't know or accept is refused before a key; version/KDF 0 is a bad header | yes | confirmed | crypto.ts:77-111 before `deriveKey` (:271); crypto.test.ts:211-233 |
| 12 | A `--passphrase-file` that isn't UTF-8 is refused (exit 2) | yes | confirmed | `pw\xff`, `pw\xfe`, CESU `pw\xed\xa0\x80`, overlong `pw\xc0\xaf` → refused, exit 2; real CLI `pw\xff` → rc 2 "isn't UTF-8 text", no archive; mutation to lossy decoding → passphrase.test.ts fails |
| 13 | A passphrase that isn't valid Unicode text is refused from every source | yes | partly | The prompt and an injected `"x\ud800"` are refused. But a real environment can't hold a lone surrogate: Node decodes invalid env bytes to U+FFFD. `RONNE_BACKUP_PASSPHRASE=$'pw\xff'` and `$'pw\xfe'` both → `7077efbfbd`; a real CLI run with `$'pw\xff'` → rc 0, and `$'pw\xfe'` opens it |
| 14 | Passphrase rules: NFC; one trailing `\n`/`\r\n` removed only for the file and env; nothing else trimmed; empty refused | no | partly | NFC, CRLF, `\n\n`, empty hold. But `new TextDecoder("utf-8", {fatal:true})` (passphrase.ts:52) strips a leading BOM: `EF BB BF 70 77 31` and `70 77 31` → both `707731` |
| 15 | `--encrypt` writes `.tar.enc`, 0600, audits `encrypted: true` without the passphrase | no | confirmed | `-rw-------`; `audit_log` → `{"via":"cli",…,"encrypted":true,"settings":true}` |
| 16 | Asked twice, hidden; two that differ refused | yes | confirmed | `script -q` pty: `TtyPass-RC9` twice → opens, 0 occurrences; `AAA-1`/`BBB-2` → "two passphrases differ", 0 files |
| 17 | `--passphrase-file` relative to where typed; `rmk-server` makes it absolute | yes | confirmed | passphrase.ts:42; passphrase.test.ts:40-49; `PATH_FLAGS`; packages/server → 121 passed |
| 18 | `RONNE_BACKUP_PASSPHRASE` for schedules; none and no terminal → exit 2 | yes | confirmed | `env -i … RONNE_BACKUP_PASSPHRASE=Env-Secret-ZP44` → rc 0, opens; without → exit 2 |
| 19 | No passphrase in output or logs | yes | confirmed | `grep -arlF` for the 5 passphrases over every run's output, pty logs, `ronne.db*`, the archives → 0 files |
| 20 | The output says a lost passphrase can't be recovered | no | confirmed | "! It's encrypted: … a lost passphrase can't be recovered. …" |
| 21 | "Sensitive": with the settings, the output says so; the `--encrypt` hint only on a plain archive | no | confirmed | `--encrypt` → "! It holds the settings file, with AUTH_SECRET and the database's password: keep it as safe as the server itself."; plain → the same plus the hint; run-backup.db.test.ts:636-637 |
| 22 | Usage and HELP list the new flags | no | confirmed | `BACKUP_USAGE`; packages/server/src/cli.ts:127 |
| 23 | Suites green on all four dialects | no | confirmed | 20 passed, 1 skipped on SQLite and each server |
| 24 | The adversarial pass reviews the construction against the format spec | no | can't check here | A blind pass; the adversarial re-check covers it |

**Overall:** not met: the earlier findings are fixed and the test gaps closed (each new test fails under its mutation), but invalid UTF-8 in `RONNE_BACKUP_PASSPHRASE` is accepted lossily (row 13), and the file reader drops a leading BOM against "nothing else trimmed" (row 14). `apps/web/.env` and `apps/web/data` were unchanged before and after.

### Adversarial re-check

Witnessed: 2026-10-12 22:30 EDT, by a fresh agent (adversarial). Commit: cc9254da + working tree (uncommitted crypto.ts, passphrase.ts and their tests, plus the cli/run-backup/scripts/server/spec diffs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is the spec's 40 bytes, a new salt each archive | no | confirmed | `xxd` on 5 CLI archives → `0101110801 <salt> 00010000 00…00`, 5 different salts; crypto.test.ts:63-76 |
| 2 | Key = scrypt(NFC passphrase, salt, N, r, p, 32), maxmem 256·N·r | no | confirmed | An independent decoder from the spec opened the env, file (CRLF, `Pässwörd`) and TTY archives; a wrong passphrase → auth failure |
| 3 | Nonce layout, AAD = header, the last chunk always shorter (empty on an exact multiple) | no | confirmed | p1 (log2N 15, 4 KiB chunks): 12 sizes × 7 push patterns → layout right every time; mutation M9 → the round-trip test fails |
| 4 | Round trip, at odd push sizes after the lazy join | yes | confirmed | p1: 924 seal/open pairs → 0 failures; 18 tests pass. M5 and M10 survive but behave the same as the real code |
| 5 | A wrong passphrase fails | no | confirmed | crypto.test.ts:128-133; the decoder; run-backup.db.test "a guess" |
| 6 | A cut archive fails at every length | no | confirmed | Every cut of a 3C+100 archive at two push sizes (24,984) and of an exact-multiple 2C archive (8,280) → 0 accepted |
| 7 | Reordered, repeated, dropped, spliced chunks or another header fail | no | confirmed | crypto.test.ts:146-171 |
| 8 | A flipped bit fails | no | confirmed | 858 flips across header, chunks, tags → 0 accepted |
| 9 | A dropped last chunk fails (the empty one too); a full chunk sealed as the last is refused by length | yes | confirmed | crypto.test.ts:174-196; M1 (length rule removed) → exactly that test fails |
| 10 | Bytes after the end, under 16 trailing, empty, magic only, header only fail | no | confirmed | +1, 15, 16, 17, F−1, F, F+1 → 0 accepted; empty, `RONNEBA`, magic, magic+5, header → `damaged`; garbage, a tar → `not_encrypted` |
| 11 | After a failure the opener refuses every later call with its own message | yes | confirmed | "It failed to open earlier. …"; M2 → crypto.test.ts:236 fails. The "already read to its end" guard (M8) has no test |
| 12 | The sealer refuses calls after its end | yes | confirmed | crypto.test.ts:251-255; M3 → fails |
| 13 | Version/KDF 0 is damaged, 2 and 255 "newer"; limits before the key | yes | confirmed | byte 8/9 = 0 → `bad_header`, 2/255 → `newer_container`; M4 → the header test fails |
| 14 | The opener's memory stays bounded with a forged 1 MiB chunk size | yes | confirmed | 96 MiB in 64 KiB pushes → rss 470→477 MiB; junk after a forged header → refused after 16 pushes. 1-byte pushes: linear time, about +260 MiB (one Buffer per pushed byte until the join); restore reads 64 KiB |
| 15 | A `--passphrase-file` must be valid UTF-8 (exit 2) | yes | confirmed | Latin-1, CESU, overlong, `F4 90 80 80` → "isn't UTF-8 text" (2); real CLI → exit 2; M6 → a test fails |
| 16 | Passphrase: NFC, one trailing line break only for file and env, nothing else trimmed, empty refused, not-valid-Unicode refused | yes | partly | Holds for `pw\n`, `pw\r\n`, `pw\n\n`, `pw\r`, empty, a prompt `x\ud800`. Fails 1: Node decodes the environment lossily, so `RONNE_BACKUP_PASSPHRASE=$'p\xe4ss'`, `$'p\xdcss'` and a literal `p�ss` → the same key; a real run with `$'x\xed\xa0\x80'` → exit 0. Fails 2: the fatal TextDecoder strips a leading BOM (`EF BB BF 70 77` and `70 77` → `7077`), while the prompt keeps it |
| 17 | `--encrypt`, `--passphrase-file` (only with it, made absolute by rmk-server), env; the file wins | no | confirmed | exit 0; the file+env archive opens with the file's; without `--encrypt` → 2; packages/server → 121 passed |
| 18 | Asked twice, hidden; differing refused | no | confirmed | pty: `Tty-Pass-MM5é` twice → opens; differing → exit 1, no archive; 0 matches in pty logs |
| 19 | The passphrase never reaches output, errors, logs, audit or the archive | yes | confirmed | `grep -a -c` for 5 passphrases over 7 runs' output, setup.log, 5 archives, 3 decrypted tars, `ronne.db*` → 0 |
| 20 | Encrypted output keeps the "Sensitive" warning without the hint; plain keeps the hint | yes | confirmed | b1 and b7 stderr; run-backup.db.test.ts:636-637 |
| 21 | The construction matches "## The encrypted container" and "## Versions" byte for byte | no | confirmed | Header offsets (crypto.ts:54-67), limits (:21), nonce (:144-149), AAD (:177, :235), reading rules (:276, :294), counter < 2^32 (:170, :232), the newer-version message word for word (:87); a spec-only decoder reads every CLI archive |
| 22 | Suites green on all dialects | no | confirmed | unit 18; db SQLite 20/1 skipped; PostgreSQL, MySQL, MariaDB 20/1 skipped each; packages/server 121 |
| 23 | The owner's files untouched | no | confirmed | `md5 apps/web/.env` and mtime 22:17 unchanged; `git status --ignored .env data` the same before and after |

**Overall:** not met: the container matches the format spec byte for byte, and no cut, flip, splice, forged last chunk or forged header got through (over 34,000 tries); but a passphrase that isn't valid UTF-8 still reaches a key through `RONNE_BACKUP_PASSPHRASE` (Node has already made the bad bytes U+FFFD), and a leading BOM in a `--passphrase-file` is dropped (row 16). Minor: 1-byte pushes hold a Buffer each until the join; no test pins "already read to its end".

### Re-check

Witnessed: 2026-10-12 22:41 EDT, by a fresh agent (blind). Commit: cc9254da + working tree (crypto.ts and passphrase.ts as of 22:31, their tests 22:32, backup-format.md 22:32, plus the cli/run-backup/scripts/server diffs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A `RONNE_BACKUP_PASSPHRASE` that isn't valid UTF-8 (Node makes the bad bytes U+FFFD) is refused | yes | confirmed | Real CLI under `env -i` with `$'pw\xff'`, `$'pw\xfe'`, CESU `$'x\xed\xa0\x80'`, a literal `p�ss` → rc 2, "The passphrase isn't valid Unicode text. Choose another.", 0 files; passphrase.ts:71, crypto.ts:118. Mutations (U+FFFD dropped from the regex; env check removed) → 2 tests fail each |
| 2 | A leading BOM in `--passphrase-file` is part of the passphrase | yes | confirmed | `EF BB BF "Bom-RC2-Pass" \n` → rc 0; a spec-only decoder opens it with the BOM bytes, not without; passphrase.ts:51; passphrase.test.ts:64-69; mutation `ignoreBOM: false` → that test fails |
| 3 | A `--passphrase-file` that isn't UTF-8, or holds U+FFFD, is refused (exit 2) | yes | confirmed | `pw\xff` → rc 2 "isn't UTF-8 text"; `p\xef\xbf\xbdss` → rc 2 "holds the replacement character (U+FFFD)"; no archive |
| 4 | A lone surrogate or U+FFFD is refused at the prompt and by `passphraseBytes` | yes | confirmed | passphrase.ts:82, crypto.ts:128; passphrase.test.ts; crypto.test.ts:275-276 |
| 5 | Passphrase rules: NFC; one trailing line break only for file and env; nothing else trimmed; empty refused | no | confirmed | CRLF file `File-RC2-Päss\r\n` → opens with the bare string; env `Env-RC2-Secret-é\n` → opens with the bare string, `…-e` fails; crypto.test.ts:265-274; empty / `\n` → exit 2 |
| 6 | Tests show a round trip | no | confirmed | 3 files, 19 passed; the real sealer and opener, 3C+100 bytes in 7777-byte pushes → byte-equal, 196812 = 40+3·65552+116; the opener reads the CLI env archive → `backup.json` |
| 7 | A wrong passphrase fails, with nothing restored | no | confirmed | `damaged`: "The backup is damaged, or the passphrase is wrong … Nothing was restored from it."; the decoder → auth failure |
| 8 | A cut archive fails | yes | confirmed | cut inside the last chunk, at a boundary, inside the header → `damaged` |
| 9 | A reordered chunk fails | no | confirmed | chunks 0 and 1 swapped → `damaged` |
| 10 | A flipped bit fails | no | confirmed | a bit in chunk 1, a bit in the salt → `damaged` |
| 11 | A dropped last chunk fails, the empty one after an exact multiple too; a byte after the end fails | yes | confirmed | 3C+100 without its last chunk, 2C without its empty last chunk → `damaged`; +1 byte → `damaged` |
| 12 | After a failure the opener hands out nothing more | yes | confirmed | crypto.ts:255-265; `end` opens the last chunk only after the length checks (:290-305) |
| 13 | The key is derived before the archive file is created | yes | confirmed | run-backup.ts:350-363 before `openOutput` (:366) |
| 14 | Asked twice, hidden; differing refused | yes | confirmed | pty: `TtyPass-RC2Q` twice → opens; `AAA-RC2`/`BBB-RC2` → "differ. Nothing was written.", 0 files |
| 15 | `RONNE_BACKUP_PASSPHRASE` and `--passphrase-file` work; neither and no terminal → exit 2 | yes | confirmed | rc 0, 0600 `.tar.enc`; no source, stdin `/dev/null` → rc 2 with both options named |
| 16 | No passphrase in output or logs | yes | confirmed | `grep -arlF` for 7 passphrases over every run's output, pty logs, setup logs, `ronne.db*`, the archives → 0 files; audit rows `"encrypted":true` |
| 17 | Suites green on all dialects and in packages/server | no | confirmed | SQLite 20 passed, 1 skipped; PostgreSQL, MySQL, MariaDB 20/1 each; packages/server 121 |
| 18 | The adversarial pass reviews the construction against the format spec | no | can't check here | A blind pass; the adversarial re-check covers it |
| 19 | The owner's files are untouched | no | confirmed | `md5 apps/web/.env` b9eb4577… before and after; `git status --ignored .env data` the same; all runs `env -i` in the scratchpad |

**Overall:** not met: rows 13 and 14 of the 22:28 pass are fixed and the rest of the Done when holds; row 18, the adversarial review, waits for the adversarial re-check. Bugs found: none.

### Adversarial re-check

Witnessed: 2026-10-12 22:56 EDT, by a fresh agent (adversarial). Commit: cc9254da + working tree (untracked crypto.ts, passphrase.ts and their tests; the cli/run-backup/scripts/server/spec diffs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is the spec's 40 bytes, with the version 1 values | no | confirmed | A spec-only decoder read 7 CLI archives → `log2N=17 r=8 p=1 cs=65536`, magic, version and KDF 1, reserved zero; crypto.ts:54-67 |
| 2 | Key, nonce, AAD and last-chunk rule follow "## The encrypted container" byte for byte | yes | confirmed | The decoder (scrypt with `maxmem 256·N·r`, nonce `0^7‖BE i‖flag`, AAD = header, full read then EOF = cut) opened the env, file and pty archives → `ok … ustar` |
| 3 | Tests show a round trip | no | confirmed | 3 files, 19 passed; `fz.mts` (log2N 15, 4 KiB chunks, 1000-byte pushes, 777-byte reads) → 0, 1, C−1, C, C+1, 3C, 3C+100 round-trip |
| 4 | A wrong passphrase fails | no | confirmed | The decoder with wrong bytes on 6 archives → auth failure; crypto.test.ts:128 |
| 5 | A cut, a reordered chunk, a flipped bit, a dropped last chunk and trailing bytes each fail, with nothing restored | yes | confirmed | `fz.mts` → `{ tries: 1688, accepted: 0 }`; crypto.test.ts:135-196 |
| 6 | After a failure, or after reading to the end, the opener refuses later calls; the end guard is tested | no | confirmed | crypto.test.ts:251-255; mutation Mc (the `ended` line gone) → 1 failed |
| 7 | An unknown or out-of-limit header is refused before a key; 0 is damaged | yes | confirmed | crypto.ts:84-109 before `deriveKey` (:275); crypto.test.ts:198-233 |
| 8 | A passphrase holding U+FFFD is refused from every source | yes | confirmed | `env -i` CLI: `$'pw\xff'` → rc 2; WTF-8 pair `$'x\xed\xa0\xbd\xed\xb8\x80'` (6× U+FFFD) → rc 2; a file with `Rep\xef\xbf\xbdFile` → rc 2. Mutations Mb, Md, Mf → a test fails each; Me (file check gone) survives, as `passphraseBytes` still refuses but with a ContainerError, not a PassphraseError (exit 1, not 2) |
| 9 | A leading BOM in `--passphrase-file` is kept (and in the env) | yes | confirmed | File `EF BB BF BomFile-88\n` → rc 0, opens only with the BOM; the same for env; mutation Ma → passphrase.test.ts fails |
| 10 | A `--passphrase-file` that isn't UTF-8 is refused (exit 2) | yes | confirmed | CESU pair and UTF-16LE with BOM → exit 2 "isn't UTF-8 text" |
| 11 | Apart from NFC, no two different inputs reach one key; one trailing line break only from file and env; nothing else trimmed | yes | partly | File and env hold (CR alone, NUL, `\n\n`, `\n\r\n`, U+2028, U+0085, U+FFFE kept; `\n` refused as empty). The prompt doesn't: clack's `password` returns readline's edited line, so a tab, NUL, 0x16 and ESC+char are dropped silently, and a pasted LF keeps only what follows. Real pty: `Tab<TAB>Pass-1` twice → opens only with `TabPass-1`; `First` + pasted `\nSecond-2` twice → opens with `Second-2`. Remark, within the spec: scrypt's HMAC hashes a key over 64 bytes, so a 78-byte passphrase and its SHA-256 open the same archive |
| 12 | No passphrase in output, logs, the audit log or the archives | yes | confirmed | `grep -a -l -F` for 10 strings over 13 run logs, pty transcripts, setup.log, every `.tar.enc`, `ronne.db*` → 0 files; audit row `"encrypted":true` |
| 13 | backup-format.md "The key" states the U+FFFD and BOM rules | no | confirmed | The key section quotes both |
| 14 | Suites green on all four dialects | no | confirmed | SQLite 20/1 skipped; PostgreSQL, MySQL, MariaDB 20/1 each; packages/server 121 |
| 15 | The adversarial pass reviews the construction against the format spec | no | confirmed | Rows 1-7 against "## The encrypted container"; "## Versions": the newer-container message word for word (crypto.ts:87), version or KDF 0 a bad header |
| 16 | The owner's files are untouched | no | confirmed | `md5 apps/web/.env` b9eb4577… before and after; `git status` unchanged; every run `env -i` in the scratchpad |

**Overall:** not met: the container matches the format spec, and 1688 tamper attempts got nothing through; the last pass's findings are fixed and tested. But the hidden prompt silently drops tabs, NUL and other control characters, and keeps only what follows a pasted LF, so two different typed inputs reach one key (row 11). Minor: no test for a passphrase file holding U+FFFD (it would exit 1 instead of 2 without its check).

### Re-check

Witnessed: 2026-10-12 23:18 EDT, by a fresh agent (blind). Commit: cc9254da + working tree (crypto.ts, passphrase.ts, passphrase.test.ts, backup-format.md 22:58:16; crypto.test.ts 22:58:58; run-backup.ts/.db.test.ts 22:15; cli.ts, scripts/backup.ts, packages/server cli.ts 21:56–21:59). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is the spec's 40 bytes, a new salt each time | no | confirmed | `xxd -l 40` of a CLI `.tar.enc` → `524f4e4e4542414b 01 01 11 08 01 <salt> 00010000 00×7`; crypto.ts:54-67 |
| 2 | Key = scrypt(UTF-8 NFC passphrase, salt, N=2^17, r=8, p=1, 32, maxmem 256·N·r) | no | confirmed | A spec-only decoder opened the env, file, BOM-file, prompt and NFC archives; decomposed `café-NFC-31` in env opens with the composed form; mutation (NFC removed) → 2 tests fail |
| 3 | AES-256-GCM per 64 KiB chunk; nonce; AAD = header; the last chunk always shorter | yes | confirmed | The decoder treats a full read then EOF as a cut and accepted every CLI archive; mutations: flag always 0 → 1 fails; no `setAAD` in the opener → 3 fail; no `counter++` → 1 fails |
| 4 | Tests show a round trip | yes | confirmed | 3 files, 19 passed; 6 sizes round-tripped by the probe |
| 5 | A wrong passphrase fails | no | confirmed | crypto.test.ts; probe → `damaged`, got 0; the decoder → auth failure |
| 6 | A cut archive fails | yes | confirmed | crypto.test.ts cut cases; 36 random cuts → all refused |
| 7 | A reordered chunk fails | no | confirmed | crypto.test.ts; probe swap, dup, drop0, other header → refused |
| 8 | A flipped bit fails | no | confirmed | crypto.test.ts; 36 random single-bit flips → refused |
| 9 | A dropped last chunk fails, the empty one and a forged full last chunk too | yes | confirmed | crypto.test.ts; mutation (full-chunk-at-end check removed) → 1 fails; probe total `{ tries: 102, accepted: 0 }` |
| 10 | Each fails with nothing restored | yes | confirmed | No restore yet (task 6) and no caller of `createOpener` outside tests. For task 6: chunks that authenticated before a later failure are handed out (28 of 102 cases), as crypto.ts documents and as the spec requires restore to decrypt everything first |
| 11 | Header refusals and "## Versions" | yes | confirmed | crypto.ts:80-110 before `deriveKey`; the newer message = spec; version or KDF 0 → `bad_header`; limits ±1 and byte 39 tested |
| 12 | `--encrypt` writes `.tar.enc` (0600), the key before the file, `--passphrase-file` only with `--encrypt` | yes | confirmed | `-rw-------`; key before `openOutput`; without `--encrypt` → rc 2 + usage |
| 13 | Asked twice, differing refused | yes | confirmed | pty: `Typed-Pass-55` twice → opens; `…55`/`…56` → rc 1 "differ", no file; no terminal, no passphrase → rc 2 |
| 14 | `--passphrase-file`: one trailing break removed, a BOM kept, made absolute by rmk-server | yes | confirmed | `FileSecret-4412\r\n` → opens bare; BOM file opens only with the BOM; `PATH_FLAGS`; packages/server → 121 passed |
| 15 | `RONNE_BACKUP_PASSPHRASE` for schedules, one trailing break removed | yes | confirmed | `env -i … $'EnvSecret-7731\n'` → rc 0, opens with `EnvSecret-7731` |
| 16 | "The key" refusals: empty, invalid UTF-8, lone surrogate, U+FFFD, control characters | yes | confirmed | CLI: env tab, `\xff`, lone CR, `pw\n\n` → rc 2; `\n` alone, empty file → rc 2 "empty"; Latin-1 file → rc 2; file U+FFFD, NUL → rc 2; mutations (`\p{Cc}`, U+FFFD, `ignoreBOM:false`) → tests fail each. Remark, within the spec's wording: typed `Tab<TAB>Pass-1` twice → the archive opens with `TabPass-1` |
| 17 | No passphrase in output, logs or archives | yes | confirmed | `grep -a -r -l -F` for 10 passphrases over every log, `.tar.enc`, decrypted tar, `.env`, `ronne.db` → 0 files |
| 18 | "Sensitive" and the lost-passphrase line | no | confirmed | Plain run → the AUTH_SECRET line with the `--encrypt` hint; encrypted run → "It's encrypted: … can't be recovered" plus the line without the hint |
| 19 | Suites green on all four dialects | no | confirmed | SQLite 20/1 skipped (one load error while another process rebuilt core's dist; 8 other runs green); PostgreSQL, MySQL, MariaDB 20/1 each |
| 20 | The adversarial pass reviewed the construction against the format spec | no | confirmed | WITNESS.md, Task 4, the adversarial re-check at 22:56, row 15, with a spec-only decoder; crypto.ts changed afterwards only in the passphrase check |
| 21 | The owner's files are untouched | no | confirmed | `md5 apps/web/.env` b9eb4577… before and after; `git status --ignored .env data` the same |

**Overall:** met: the container matches the format spec byte for byte; every cut, reorder, flip, dropped last chunk and wrong passphrase tried fails (102 tries, 0 accepted); the three passphrase sources follow "The key"; no passphrase anywhere; the latest adversarial re-check records the construction review. Bugs found: none.

### Adversarial re-check

Witnessed: 2026-10-12 23:02 EDT, by a fresh agent (adversarial). Commit: cc9254da + working tree (crypto.ts, passphrase.ts, their tests and backup-format.md as of 22:58; crypto.test.ts 22:58:58; scripts/backup.ts 21:57; the cli/run-backup/server diffs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The prompt can't make a typed passphrase and the same text in a file (or the environment) reach different keys | yes | not met | Node readline takes U+2028 and U+2029 as line ends (clearing the line; clack returns `rl.line`), and they aren't `Cc`, so the check passes them. Real CLI: file `61 E2 80 A8 62 0A` → rc 0, opens with `a b`, not `b`; typing `a b⏎` twice at a pty → rc 0, opens with `b` only |
| 2 | Control characters (`Cc`) are refused from every source, so a typed one can't silently match a file | yes | partly | File and environment: refused (passphrase.test.ts:157-176; crypto.test.ts:270-280). At the prompt U+0085 and U+009B reach the value and are refused; tab, NUL, LF and ESC+char are dropped before the check (`Tab⇥Pass` → `TabPass`), but their file form is refused with exit 2, so file and prompt can't silently disagree on them. Two typed inputs reaching one key is a remark (the user sees an error, not a wrong key) |
| 3 | Other readline edits and long input don't make keys disagree silently | no | confirmed | pty: backspace, ^H, ^U, ^W, ←, Home, ^T, ^A^K^Y act as visible edits; bracketed-paste markers dropped; a pasted `Secret\r\n` → `Secret`; U+200B, U+FEFF, U+202E, U+FFFE, 😀 kept; NFD → NFC; 1000 characters → 1000 bytes. Remark: from about 3000 characters the prompt crawls |
| 4 | Tests show a round trip | no | confirmed | 3 files, 19 passed; CLI env, file and pty archives open with a spec-only decoder |
| 5 | A wrong passphrase, cut, reordered chunk, flipped bit, dropped last chunk and trailing bytes fail, with nothing restored | no | confirmed | `fz.mts` against the current crypto.ts → `{ tries: 1688, accepted: 0 }`, round trips intact; wrong key → GCM auth error |
| 6 | The construction matches "## The encrypted container" | no | confirmed | crypto.ts:54-67, :21, :134-147, :150-155, :177/:235, :291-305; the spec-only decoder reads every CLI archive |
| 7 | "## Versions": a newer container gets the spec's message; 0 is a bad header | no | confirmed | crypto.ts:87-91 word for word; :99-100 |
| 8 | A passphrase file holding U+FFFD is refused with exit 2 (tested) | yes | confirmed | passphrase.test.ts:161 |
| 9 | backup-format.md "The key" states the `Cc` and U+FFFD rules and the HMAC remark | yes | confirmed | Spec lines 248-255; it doesn't name U+2028 and U+2029 |
| 10 | Asked twice; differing refused, nothing written | no | confirmed | pty `LeakPtyA-Rc3` / `LeakPtyB-Rc3` → rc 1, 0 files |
| 11 | No passphrase in output, logs, audit or archives | yes | confirmed | `grep -a -r -l -F` for 5 passphrases over logs, pty transcripts, 6 `.tar.enc`, 3 decrypted tars, `ronne.db*` → 0; archives 600 |
| 12 | Suites green on all four dialects and packages/server | no | confirmed | unit 19; SQLite 20/1; PostgreSQL, MySQL, MariaDB 20/1 each; packages/server 121 |
| 13 | The adversarial pass reviews the construction against the format spec | no | confirmed | Rows 5-7; no regression since 22:56 |
| 14 | The owner's files are untouched | no | confirmed | `md5 apps/web/.env` b9eb4577… before and after; `git status` unchanged; `env -i` runs in the scratchpad |

**Overall:** not met: the container still matches the format spec, 1688 tamper attempts got nothing through, the `Cc`/U+FFFD rule holds for files and the environment, and nothing leaked; but U+2028 and U+2029 pass the check while the prompt takes them as line ends, so a passphrase holding one makes a different key from a file than at the prompt (row 1). Cosmetic: two comment lines in a row at crypto.test.ts:269-270.

### Adversarial re-check

Witnessed: 2026-10-12 23:54 EDT, by a fresh agent (adversarial). Commit: cc9254da + working tree (crypto.ts, crypto.test.ts, passphrase.ts, passphrase.test.ts 23:33:15; backup-format.md; cli/run-backup/scripts/server diffs as found). Machine: macOS 27.0.1, Node v24.0.0 (sweep also on v22.23.2 and v24.21.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Readline and clack change typed text only through line endings and control characters (`Cc`, `Zl`, `Zp`), so no text a file can hold unrefused reaches the passphrase changed at the prompt | yes | confirmed | Source: readline's `lineEnding` (Node 24 includes U+2028/9; Node 22 doesn't); `emitKeys` names keys only from ESC sequences, `\r \n \t \b \x7f`, `ch <= '\x1a'`, space and `[0-9A-Za-z]`, the rest goes to `kInsertString`; undo/redo 0x1f/0x1e; cancel `\x03`/escape; clack's `_isActionKey` is tab only; `masked` is display only; stdin `StringDecoder('utf8')` makes bad bytes U+FFFD (refused). Sweep with the real `@clack/prompts` 1.8.1 `password()` over a fake TTY: `a<cp>b⏎` for every code point but surrogates, typed and pasted → 0 well-formed strings changed (Node 24.0.0, 22.23.2, 24.21.0); a byte-by-byte UTF-8 feed of 11,464 code points → 0. Real CLI at a pty with ZWSP, 😀, U+202E, NFD é, BOM, NBSP, U+FFFE, U+E000, `kλ` → the same key as from a CRLF file and the env; all 4 archives open with that text under a spec-only decoder |
| 2 | The class is refused from every source; the tests catch its removal | yes | confirmed | CLI file and env with `a<X>b` for U+2028, U+2029, U+0085, U+009B, ESC, DEL → rc 2; file NUL → rc 2. Mutations: without `\p{Zl}` → 2 tests fail; without `\p{Zp}` → 1; without `\p{Cc}` → 2. Remarks: typed `a<U+2028>Rc4Sep` twice → opens with `Rc4Sep` only (two typed inputs, one key; the file form is refused, so file and prompt never silently disagree); no test feeds U+2028/U+2029 through the environment |
| 3 | backup-format.md "The key" names the class | yes | confirmed | The key, first bullet. Remark: one line past the wrap width |
| 4 | Tests show a round trip | no | confirmed | 3 files, 19 passed; `fz.mts` sizes 0 to 200000 round-trip through crypto.ts and the spec decoder; length = 40 + n + 16·(⌊n/65536⌋+1) |
| 5 | A wrong passphrase, cut, reordered, duplicated or dropped chunk, flipped bit, trailing byte or swapped header fails | no | confirmed | `fz.mts`: 117 tries with random push sizes → 0 accepted; the NFD passphrase opens (NFC) |
| 6 | Nothing is restored on failure | no | confirmed | No restore yet (task 6); `createOpener`'s doc says chunks before `end` are unchecked, as the spec requires restore to decrypt everything first |
| 7 | The construction matches "## The encrypted container" | yes | confirmed | 5 CLI headers → `524f4e4e4542414b 01 01 11 08 01 <salt> 00010000 00×7`, a different salt each; a spec-only decoder opens every CLI and fuzz archive; the key before the file (run-backup.ts:355-356 before :368) |
| 8 | "## Versions" and the header refusals | no | confirmed | `hdr.mts`: version or KDF 2 → `newer_container` with the spec's sentence; version 0, KDF 0, byte 39, log2N 14/19, r 9, p 5, chunk 4095/1048577 → `bad_header`; log2N 18, p 4 accepted; wrong magic → `not_encrypted`; 39 bytes → `damaged` |
| 9 | No passphrase in output, logs, audit or archives | yes | confirmed | `scan.mjs`: 7 needles over 19 files (pty transcripts, logs, 5 `.tar.enc`, 5 decrypted tars, `.env`, `ronne.db*`) → 0 hits; audit rows `"encrypted":true`; archives `-rw-------` |
| 10 | Suites green on all four dialects and packages/server | no | confirmed | SQLite 20/1 skipped; PostgreSQL, MySQL, MariaDB 20/1 each; packages/server 121 |
| 11 | The adversarial pass reviews the construction against the format spec | no | confirmed | Rows 4-8, with an independent decoder; no regression since 23:02 |
| 12 | The owner's files are untouched | no | confirmed | `md5 apps/web/.env` b9eb4577… before and after; `git status --ignored .env data` the same; `env -i` runs in the scratchpad |

**Overall:** met: Node 24's readline and clack act on nothing outside `Cc`/`Zl`/`Zp` (the source, and a sweep of every code point typed and pasted on Node 22 and 24), and the rule refuses that class from every source, so a file and the prompt can't silently disagree; the container still matches the format spec, 117 tamper attempts got nothing through, and nothing leaked. Remarks, since done: a test feeds U+2028 and U+2029 through `RONNE_BACKUP_PASSPHRASE`, and the long spec line is rewrapped (test and documentation only; the code is as witnessed). Left as is: the environment and prompt message names control characters but not line separators.
