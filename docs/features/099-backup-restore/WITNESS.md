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
