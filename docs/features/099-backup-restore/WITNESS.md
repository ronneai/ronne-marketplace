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
