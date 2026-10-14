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

## Task 5 — --verify

Witnessed: 2026-10-13 00:12 EDT, by a fresh agent (blind). Commit: 38ae2169 + working tree (verify.ts, run-verify.ts, verify.db.test.ts, tar-reader.test.ts untracked; cli.ts, backup.ts, tar.ts, packages/server/src/cli.ts modified). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tests pass, on SQLite and on all three servers | no | confirmed | core `src/pack` → 56 passed; web `cli.test.ts` → 6; db → 28 passed, 1 skipped (a migration wait in run-backup.db.test.ts); PostgreSQL, MySQL, MariaDB → 28/1 each; packages/server → 122 |
| 2 | A test covers a good archive, and it passes | no | confirmed | "passes a good archive…" (a real runBackup archive, plus the summary through runVerify); CLI → "is complete: every checksum matches…", exit 0 |
| 3 | A test covers an altered file, refused by its sha256 against the manifest | no | confirmed | "refuses an altered file" (a part's JSON edited, a byte flipped in the stored artifact); mutation (sha256 compare removed) → only that test fails |
| 4 | A test covers a missing artifact: refused unlisted, passes listed, refused with another sha256 | no | confirmed | The test; mutations removing the missing check and the sha check → it fails each time; a probe with an injected item_versions row behaves the same |
| 5 | A test covers a newer format: refused, naming the Ronne version | no | confirmed | format 2 → exact message; unknown migration refused; older prefix passes; mutation accepting the format → fails; CLI on a crafted archive → "This backup was made by Ronne 7.1.0 in backup format 2; install that version or newer to read it.", exit 1 |
| 6 | An encrypted archive from a newer container version is refused as "encrypted by a newer Ronne" | no | confirmed | CLI, byte 8 of a real .tar.enc set to 2 → the message, exit 1 (tested in crypto.test.ts; none in verify.db.test.ts). With no passphrase source and no terminal it asks first: exit 2 "There's no terminal…" |
| 7 | Reads and decrypts with the env, a file or a prompt; wrong or damaged → exit 1 | no | confirmed | `RONNE_BACKUP_PASSPHRASE` → "…, encrypted", exit 0; `--passphrase-file` → exit 0; a flipped byte → "damaged, or the passphrase is wrong", exit 1 |
| 8 | Asks for the passphrase only when the first bytes say it's encrypted | no | confirmed | a plain archive named `plain.tar.enc` → verified with no passphrase; routing on `isContainer(head)` |
| 9 | Step 2: tar structure, order, backup.json first, manifest last, nothing after | no | confirmed | tar-reader.test.ts refusals at step sizes 1/512/all; verify.db.test.ts order cases; probe `000000.jsonl` → refused |
| 10 | Step 4: every entry in manifest.files with its size and sha256, and every listed path in the archive | no | confirmed | verify.ts:417-425; probe "manifest lists backup.json" → refused |
| 11 | Step 5: parts 1..parts hold `rows` lines, each a JSON object with exactly the table's columns | no | partly | Rows and parts hold (rows+1 → refused; extra column → refused, mutation fails the test). But a row whose single key is two column names joined by U+0000 passes: key sets compared as NUL-joined strings (verify.ts:211, 441-446) |
| 12 | Step 6 without the target's tables | no | confirmed | A table missing from the manifest, rows with no parts, storage count, `settings.included` flipped → refused |
| 13 | Step 7: each artifact in storage with that sha256, or listed | no | confirmed | Row 4; verify.ts:458-469 |
| 14 | Prints the summary; warnings name missing artifacts and environment-only settings | no | confirmed | CLI → "Made by Ronne 0.3.2 at … from SQLite, 24 migrations applied (20 KiB)." / "7 rows in 25 tables, 0 stored files (0 B), with the settings file."; the test asserts the missing-artifact line |
| 15 | Exit 1 with the first problem; 2 for bad flags | no | confirmed | missing file → ENOENT, exit 1; a folder, an empty file → exit 1; `--verify X --out x` → exit 2 with usage |
| 16 | Needs no settings or running instance; writes or audits nothing | no | confirmed | `RONNE_ENV_FILE`/`RONNE_DATA_DIR` nonexistent → exit 0, nothing made; ronne.db mtime and size unchanged; `audit_log` count 3 before and after |
| 17 | A relative archive path is from where the command was typed | no | confirmed | `INIT_CWD` run; `PATH_FLAGS` has `--verify`; cli.test.ts; runVerify with "b.tar" |
| 18 | Streams: memory doesn't follow the archive's size | no | confirmed | `/usr/bin/time -l` on a 1.5 GiB archive → max RSS 303 MB, against 176 MB for 20 KiB |
| 19 | rmk-server HELP and the usage show `--verify` | no | confirmed | packages/server/src/cli.ts:131 (without `[--passphrase-file]`); BACKUP_USAGE in full |

**Overall:** not met: everything holds and the Done-when tests fail when the code is broken, except step 5's "exactly the table's columns": a row key made of two column names joined by U+0000 gets past it. Minor: a newer container with no passphrase source asks for the passphrase first; the wrong-passphrase message speaks of restoring; HELP leaves out `[--passphrase-file FILE]`.

### Re-check

Witnessed: 2026-10-13 00:20 EDT, by a fresh agent (blind). Commit: 38ae2169 + working tree (verify.ts, run-verify.ts, verify.db.test.ts, tar-reader.test.ts untracked; crypto.ts, cli.ts, backup.ts, tar.ts, packages/server/src/cli.ts modified). Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tests pass on SQLite and on all three servers | no | confirmed | core `src/pack` → 56; web `cli.test.ts crypto.test.ts` → 15; db → 28 passed, 1 skipped; PostgreSQL, MySQL, MariaDB → 28/1 each; packages/server → 122; biome clean; `tsc --noEmit` exit 0 |
| 2 | Step 5: a row key holding two column names joined by U+0000 is refused | yes | confirmed | Key sets compared as `JSON.stringify` of sorted keys and columns; CLI on a crafted archive → "✗ A row of user doesn't have exactly the columns its manifest lists.", exit 1; the NUL-join put back in a scratch copy → only the order/shape test fails |
| 3 | A newer encrypted container is named before any passphrase is asked for | yes | confirmed | `route()` calls `parseHeader(head)` first; CLI, byte 8 set to 2, no passphrase source → "✗ This backup was encrypted by a newer Ronne; …", exit 1; removing `parseHeader(head)` → the test fails |
| 4 | The wrong-passphrase or damaged message no longer speaks of restoring | yes | confirmed | crypto.ts:50; CLI wrong `--passphrase-file` → "✗ The backup is damaged, or the passphrase is wrong (the two can't be told apart).", exit 1 |
| 5 | rmk-server HELP shows `backup --verify ARCHIVE [--passphrase-file FILE]` | no | confirmed | packages/server/src/cli.ts:131-132; `BACKUP_USAGE` the same |
| 6 | A test covers a good archive, and it passes | no | confirmed | The test; CLI on a real backup → "… is complete: every checksum matches, and every released version's artifact is in it.", exit 0 |
| 7 | A test covers an altered file, refused by its sha256 | no | confirmed | The test; mutation dropping the sha256 compare → only it fails |
| 8 | A test covers a missing artifact: refused unlisted, passes listed, refused with another sha256 | no | confirmed | The test; mutation disabling the missing check → only it fails |
| 9 | A test covers a newer format, with the spec's message | no | confirmed | The test asserts the message; mutation accepting format 2 → it fails |
| 10 | Decrypts with the env or a file; asks only when the first bytes say encrypted | no | confirmed | env → "…, encrypted (20 KiB)", exit 0; file → exit 0; a plain archive with stdin /dev/null → no prompt, exit 0 |
| 11 | Steps 2, 4 and 6 | yes | confirmed | Mutation of the order check → the test fails; a Python `tarfile` archive with 10 KiB record padding → "The archive has bytes after its end." (strict, as the spec says); files both ways, tables, storage, `settings.included` checked |
| 12 | Exit 1 with the first problem; 2 for bad flags | no | confirmed | `--verify X --out x` → exit 2; crafted archives → exit 1 |
| 13 | Needs no settings or instance; writes or audits nothing | no | confirmed | Missing settings folder → complete, not created; ronne.db mtime and size unchanged; `audit_log` count 3 before and after |
| 14 | A relative archive path is from where the command was typed | no | confirmed | `INIT_CWD=$S/out … --verify rel.tar` → complete; `scriptArgs` test |
| 15 | Streams; a line held up to 256 MiB | yes | confirmed | max RSS 171 MB (20 KiB archive), 297 MB (1 GiB archive); `LINE_MAX` |
| 16 | Each test breaks one rule on a real archive; mutations each make a test fail | yes | confirmed | Mutations sha / missing / order / format / header / NUL → exactly one test failed each; unmutated → 7/7 |

**Overall:** met: the NUL-joined key is refused (the test fails if the old comparison returns), a newer container is named before any passphrase is asked for, the damaged message no longer mentions restoring, HELP lists `[--passphrase-file FILE]`, and the Done-when tests fail when the code they cover is broken. Observations, not failures: a part line with a duplicate JSON key passes (JSON.parse keeps the last value); a tar with standard 10240-byte record padding is refused, as the spec's "nothing after the end blocks" says.

## Task 6 — restore

Witnessed: 2026-10-13 00:41 EDT, by a fresh agent (blind). Commit: 611afdbb + working tree (17 modified, 5 untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests restore into a SQLite target (from SQLite) | no | confirmed | `--project db src/server/backup scripts/backup.db.test.ts scripts/restore.db.test.ts` → 36 passed, 1 skipped (run-backup's migration wait); restore.db.test.ts's 7 pass |
| 2 | Into PostgreSQL, MySQL and MariaDB from a SQLite archive | no | confirmed | `test:db:postgres\|mysql\|mariadb` → 36/1 each; test 1 (`restore.db.test.ts:221`) compares every table's rows, migrations, file mode 0600, the audit row |
| 3 | PostgreSQL, MySQL and MariaDB archives into a new SQLite file | no | confirmed | `restore.db.test.ts:265` passes on the 3 server runs |
| 4 | Server ↔ server restores work too | no | confirmed | Real scripts: SQLite (Unicode + CRLF, booleans, dates, a binary artifact) → PG → MySQL 8.4 → MariaDB 10.11 → new SQLite, each exit 0; final rows byte-identical to the source's (hex), the artifact identical (`cmp`); 3,012 rows SQLite → PG → 3,003 audit rows (3,002 + `instance.restored`) |
| 5 | An archive from an older migration set restores, then the newer migrations run | no | confirmed | `:280` passes on 4 dialects; `migrateToLatest` → `[]` in a scratch copy fails it |
| 6 | A non-empty target is refused, nothing changed | no | confirmed | Test `:325`; `isEmptyDatabase` always true → fails; a PG db with table `foo` → refused, exit 1, still only `foo`; a db with only an empty `ronne_migration` → accepted |
| 7 | A newer backup is refused, nothing changed | no | confirmed | Test `:325`; adding `9999_future` to knownMigrations fails it; `format: 2` → "made by Ronne 7.1.0 in backup format 2…", exit 1 |
| 8 | An altered archive is refused, nothing changed | no | confirmed | Test `:325` → "doesn't match its checksum… Nothing was changed", target empty, no `data`, no `.env` |
| 9 | Step 1: the second read re-checks every entry, so an archive changed between the reads stops the restore | no | partly | Changed bytes are caught (`restore.ts:196-209`, `:316-327`); entries removed between the reads aren't: reading A without its `storage/…` entry → success, `files: 0`; without `database/audit_log/` → success, one row missing |
| 10 | Step 3: the target's order | no | confirmed | `run-restore.ts:115-120`; scripts test; `--with-settings` into the backup's own MariaDB → refused; no flags → `ronne.db` plus a `.env` |
| 11 | Messages name the database by its kind, never its URL | no | confirmed | The test asserts the URL is absent; every probe reads "the PostgreSQL/MySQL or MariaDB/SQLite database" |
| 12 | Step 4: target storage empty or absent | no | confirmed | Test `:353`; `if (false)` → fails |
| 13 | Step 5: the lock on the one connection serialises concurrent runs | no | confirmed | Two concurrent restores into one PG db: one restored, the other "isn't empty… Nothing was changed"; the same on MySQL. SQLite has no lock, as at start (bug 2) |
| 14 | Step 5: `rmk-server restore` refuses while the service runs | no | confirmed | `control.ts` checks `isActive`; packages/server → 124 passed with the new test |
| 15 | Step 6: tables, columns and primary keys equal the manifest's after migrating | no | confirmed | `restore.ts:145-159`; `dist_tags.primaryKey` → `["item_id"]` → refused |
| 16 | Step 6: the migrations' rows removed, then the rows in foreign-key order, in batches, one transaction | no | confirmed | `restore.ts:161-192`, `:174-338`; removing the `delete from` fails 6 of 7 tests; 3,012 rows (~400 B each) restored |
| 17 | Step 6: storage files mode 0600, never over a file, checked by sha256 | no | confirmed | `restore.ts:274`; the test checks 0600; `open(target, "w")` → fails |
| 18 | Values converted per target column; bad ones stop it naming part, line, column | no | confirmed | `"email_verified":"yes"` → "…line 1, column email_verified: not a whole number"; `null` name → "…which the column doesn't allow"; `"download_count":"7"` → refused; an invalid date into SQLite stored as is (spec allows for SQLite's text) |
| 19 | Step 7: settings written, or differences reported without values | no | confirmed | Test `:443`; the probe's `.env` mode 0600 with the targets and the backup's `PUBLIC_URL` |
| 20 | Step 8: the summary, the next step, `instance.restored` with its summary line | no | confirmed | PG probe's audit_log; `AUDIT_ACTIONS`; 22 tests passed |
| 21 | A failure after writing started says what it left | no | confirmed | Bad boolean, null, bad PK → "It left the SQLite database partly restored, and maybe files in the storage folder: empty both before trying again" |
| 22 | Missing artifacts: asks, `--yes` continues, refuses without a terminal | no | confirmed | Test `:415` |
| 23 | The same archive twice: the second refused | no | confirmed | `scripts/restore.db.test.ts`; concurrent PG and MySQL probes |
| 24 | A newer format version refused, naming the version | no | confirmed | Claim 7 |
| 25 | Windows paths: platform separators; `..`, absolute paths and links refused | no | can't check here | Refusals hold on both reads (`isSafeTarPath`, type `0` only, `storageKeyProblem`); the write splits keys on `/` (`restore.ts:271`); writing on Windows needs Windows |
| 26 | Wiring: `pnpm run restore`, tsdown, `docker/pnpm`, `SCRIPTS`/HELP/`scriptArgs` | no | confirmed | `npx tsdown` → `restore.mjs`, which restored the probe archive; `sh -n docker/pnpm`; `scriptArgs` makes the archive and `--passphrase-file` absolute, leaves `--database-url`; `parseRestoreCommand` exit 2 for two archives, a blank URL, an unknown flag |

**Overall:** not met: everything the Done when asks for holds on the four databases, but the second read misses entries removed between the two reads (claim 9), and Windows path handling needs a Windows run (claim 25). Low: two concurrent restores into one new SQLite file — the loser says to empty the target, which would destroy the good restore. Cosmetic: HELP's restore line lacks `--passphrase-file`; the summary counts only tables with rows.

### Adversarial pass

Witnessed: 2026-10-13 00:50 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (restore.ts, run-restore.ts, scripts/restore.ts and both restore db tests untracked; diff in cli.ts, verify.ts, migrate.ts, packages/server). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests pass on all four databases | no | confirmed | `--project db …` → 36 passed, 1 skipped; `test:db:postgres` / `:mysql` / `:mariadb` → 36/1 each; packages/server → 124 |
| 2 | A SQLite archive restores into PostgreSQL, MySQL, MariaDB and SQLite with every value the same | no | confirmed | A SQLite instance with 𝔘🚀, CRLF, U+2028, `""` next to `null`, a timestamp without milliseconds, int 2147483647, 1/0 booleans, 2,600 audit rows, 40 submission_files rows of 300 KB → restored into each kind; a row-by-row compare → "diff tables 0" each; PostgreSQL turns `…02Z` into `…02.000Z` (same instant, as the spec allows) |
| 3 | PostgreSQL, MySQL and MariaDB archives restore into SQLite (and server↔server) | no | confirmed | 7 restores among PG, MySQL, MariaDB and SQLite → exit 0, "diff tables 0" against the original source |
| 4 | Rows load in foreign-key order, in batches, without parameter or packet limits | no | confirmed | 2,600 rows (about 6 batches) and a 12 MB table (split at 4 MB) loaded on all four; 40 foreign keys, none to its own table |
| 5 | Storage files written 0600, checked, odd keys and deep paths | no | confirmed | `odd/it em/…`, `odd/ünï/ç ode/deep/a/…/g/1.0.1.tgz`, `odd/x/weird+&=@,;~!$()'.tgz` → 600 everywhere, sha256 lists identical |
| 6 | An entry's content changed between the reads stops the restore | no | confirmed | `swap.mts` during the missing-artifact question: a changed part or storage entry → "changed since the archive was verified … partly restored" |
| 7 | An archive changed between the two reads stops the restore (SPEC step 1) | no | not met | The swapped archive drops `database/submission_files/000002.jsonl` and a storage entry, backup.json and manifest.json unchanged → `{"rows":2645,"files":1}`, "Restored …"; 27 of 40 rows and one artifact missing. No test exercises the second read |
| 8 | An altered archive is refused, nothing changed | no | confirmed | The test passes on all four; target empty, no `data/`, no `.env` |
| 9 | A newer backup is refused, nothing changed | no | confirmed | The test on all four |
| 10 | A non-empty target is refused, nothing changed | no | partly | PG and MySQL: refused under the lock, nothing written. SQLite: a non-empty rollback-journal `other.db` → refused, but its md5 changed and header bytes 18–19 became `0202`: `createDb` ran `journal_mode = WAL` |
| 11 | Non-empty storage is refused, nothing changed | no | confirmed | The test; the storage check comes before `createDb` |
| 12 | Target choice and no passwords printed | no | confirmed | No flag, no settings → `ronne.db` made and restored; the CLI test refuses `--with-settings` into the backup's own URL; 8 bad URLs, `grep -c S3CRET` → 0 |
| 13 | The lock makes a concurrent restore or a starting server wait (PG, MySQL, MariaDB) | no | confirmed | Two restores together on PG and MySQL → one restored, the other "isn't empty … Nothing was changed" |
| 14 | The same on SQLite | no | not met | No lock for SQLite (and Kysely's does nothing there). `server-start.cjs` migrates and writes a row while the restore waits after its emptiness check → "Restored 2,657 rows …", exit 0, the server's row gone |
| 15 | `rmk-server restore` refuses while the service runs | no | confirmed | control.test.ts; the check before the root check |
| 16 | The same against real systemd, launchd, Windows services | no | can't check here | Tests mock systemd; no live service here, no Windows |
| 17 | `rmk-server` makes the archive absolute, leaves `--database-url` alone | no | confirmed | `scriptArgs` probes; exception: `["--","b.tar"]` stays relative |
| 18 | An older migration set restores, then the newer migrations run | no | confirmed | The test on all four |
| 19 | Values follow "Values": anything else stops the restore | no | partly | `2026-02-30T00:00:00.000Z` → stored as 2026-03-02; `…T24:00:00.000Z` → the next day (PG and MySQL); out-of-range integers, null into NOT NULL, non-`$b64` refused |
| 20 | Settings: 0600; new secret or the backup's; an existing file kept, differences without secrets | no | partly | 0600 and the merge hold. But an existing `.env` naming `old.db` with `--database-url file:new.db --with-settings` → only "AUTH_SECRET differs", and "Next, start the server" would open `old.db`; and a `.env` written during the restore is overwritten |
| 21 | `instance.restored` with no secrets | no | confirmed | PG and MariaDB rows `{"via":"cli","from":{…},"rows":2657,"files":3}`, actor, target id, IP null |
| 22 | A failure after writing says what it left | no | confirmed | int 9007199254740991 into PG/MySQL → "Out of range … partly restored, and maybe files …: empty both"; PG state matches |

**Overall:** not met: the four-way and cross-kind restores, value round-trips, storage writes, server refusals and the audit event hold; not met: an archive that loses entries between the reads restores with data missing; SQLite has no lock (a server starting mid-restore loses its rows); a non-empty SQLite target is changed despite "Nothing was changed"; impossible timestamps are moved; a kept settings file isn't checked against the target, and one written mid-restore is overwritten. Minor: `restore -- b.tar` leaves the archive relative.

### Re-check

Witnessed: 2026-10-13 01:01 EDT, by a fresh agent (blind). Commit: 611afdbb + working tree (19 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests still pass on the four databases (cross-kind both ways, older migration set, the three refusals) | yes | confirmed | `--project db …` → 40 passed, 1 skipped; `test:db:postgres` / `:mysql` / `:mariadb` → 40/1 each; packages/server → 124 |
| 2 | Real scripts: a SQLite archive into a new PostgreSQL database; a second run refused, nothing changed | no | confirmed | 300,007 rows → "Restored 300,007 rows in 25 tables…", 300,002 audit rows (1 `instance.restored`); again → "The PostgreSQL database isn't empty… Nothing was changed." |
| 3 | Step 1: a database part removed between the reads stops it before the rows commit | yes | confirmed | Swapped at the missing-artifact question: no `audit_log/000002` → "…went missing…", audit_log 0 rows; storage moved ahead of the database → "database/user/000001.jsonl went missing"; turning off `restore.ts:191` → the new test fails |
| 4 | Step 1: a stored file or settings.env removed between the reads stops it | yes | confirmed | The storage case; turning off `restore.ts:357` → fails; no settings.env → "settings.env went missing…"; an extra `storage/extra.tgz` → "changed since the archive was verified"; cut or empty → "ends in the middle", 0 rows |
| 5 | Step 1: the second read checks `backup.json`'s and `manifest.json`'s bytes, and that every entry came again | yes | partly | When they come they're compared (`restore.ts:333-345`); when missing nothing checks: without `manifest.json` → resolved `{"rows":25013,"files":1}`, `.env` written; the same without `backup.json`. No data lost |
| 6 | Step 5: SQLite locked (exclusive) from the emptiness check to the end | yes | confirmed | `run-restore.ts:204-211`; during a real 3.9 s restore a writer got 134 SQLITE_BUSY (first write 16 ms after `instance.restored`), a read-only reader 141 BUSY |
| 7 | A SQLite file another process holds is refused as in use, nothing written | yes | confirmed | Test `:554`. Note: removing the `locking_mode` pragma still passes it; only the probe in row 6 shows restore's own lock |
| 8 | Two concurrent restores into one new SQLite file: the good one survives, the loser says nothing changed | no | confirmed | 2 tries → one exit 0, the other "isn't empty… Nothing was changed.", exit 1, no `.env`; winner `integrity_check` ok |
| 9 | Step 3: a non-empty SQLite file looked at read-only first, unchanged | yes | confirmed | Test `:554` (byte-equal); the look turned off → fails |
| 10 | HELP names `--passphrase-file`; the summary counts every table | no | confirmed | `packages/server/src/cli.ts:149`; "25 tables" |
| 11 | `restore -- b.tar` makes the archive absolute | no | confirmed | `cli.test.ts:127`; packages/server 124 |
| 12 | Windows paths: storage keys written with the platform's separators | no | can't check here | `restore.ts:288` `join(storageRoot, ...key.split("/"))`; refusals unchanged; waits for task 7's Windows server check in CI |
| 13 | `rmk-server restore` refuses while a real service runs | no | can't check here | Only the mocked test runs here; needs task 7's server checks in CI |

**Overall:** not met: lost data entries now stop the restore; the SQLite lock, the read-only look and the cosmetic points hold; the Done when holds on the four databases. Open: a `backup.json` or `manifest.json` missing from the second read isn't noticed (row 5, no data lost); Windows paths and real services wait for task 7's CI (rows 12–13). Test gap: no test shows restore's own SQLite lock keeping another process out.

### Adversarial re-check

Witnessed: 2026-10-13 01:09 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (19 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests pass on all four databases | yes | confirmed | 40 passed, 1 skipped on SQLite and each server; packages/server 124 |
| 2 | Cross-kind restores keep every value | yes | confirmed | Real scripts, 300,009 rows (𝔘🚀, CRLF, U+2028, `""` next to null, an escaped NUL): SQLite → PG → MySQL 8.4 → MariaDB 10.11 → new SQLite, each exit 0 in 4–11 s; the compare shows only `…00Z` → `…00.000Z` and fresh `ronne_migration` timestamps; each hop adds its `instance.restored` |
| 3 | Entries lost, added, repeated or reordered between the reads stop the restore | yes | confirmed | Swapped during the confirm question, on all 4: a part twice, settings.env dropped, storage before database, an unlisted `zzz.txt`, a storage entry twice, cut in half → each refused |
| 4 | backup.json and manifest.json must come again in the second read | yes | partly | Without either → `{"rows":13,"files":1}`, "Restored" on all 4; an extra `database/zzz.txt` with manifest.json's bytes is accepted. No data lost |
| 5 | PG, MySQL, MariaDB: the lock serialises a second restore | yes | confirmed | B started 3 s after A waited and was refused "isn't empty … Nothing was changed"; PG A's rows intact |
| 6 | SQLite: a server starting mid-restore can't write, and its rows aren't lost | yes | confirmed | A simulated server 0.5 s in waited 2.1 s, then wrote and kept its row; during an 18 s restore it failed at once with `SQLITE_BUSY` and wrote nothing. Remark: a SQLite server exits rather than wait out a long restore |
| 7 | SQLite: a file another process holds is refused as in use | no | confirmed | "in use by another process … Nothing was changed", no `.env`. Cosmetic: two restores started together → the loser says "couldn't be opened: database is locked" (createDb's `SQLITE_BUSY` not mapped) |
| 8 | The exclusive lock is released on every path | no | confirmed | 9 failing and succeeding restores in one process, each followed by `createDb` + `readSchema` → 328 ms in all |
| 9 | A non-empty SQLite target is left unchanged | yes | confirmed | Main file and `-wal` md5 identical for rows only in `-wal`, a mode-444 file, a text file; `-shm` may be written (an index); a 0-byte file counts as empty |
| 10 | An impossible timestamp stops the restore instead of moving | yes | partly | PG, MySQL, MariaDB refuse `2026-02-30`, `T24:00`, `23:59:60`, `2023-02-29`, `+00:00`, lowercase `z`, `not a date`. A SQLite target stores every one as is. PG with `TZ=America/New_York`: `1850-01-01T00:00:00.000Z` stored as `1849-12-31 23:59:58+00` (node-pg's local-time Dates); exact with `TZ=UTC` |
| 11 | A kept settings file naming another database is warned about | yes | confirmed | The test and a probe. Cosmetic: `file:./x/../t.db` for the same file → a spurious warning; the STORAGE_PATH warning can't fire |
| 12 | A settings file that appears mid-restore is kept, never replaced | yes | partly | Kept when it appears before `run-restore.ts:276`; the window between that check and `writeEnvFile`'s rename could replace it (inferred, not reproduced). A kept file removed meanwhile → the output still says "kept"; one rewritten to name `other.db` → no warning (the start's copy is used) |
| 13 | `rmk-server restore -- b.tar` makes the archive absolute | no | confirmed | `scriptArgs` probes |
| 14 | Refusals on servers change nothing | no | confirmed | A full `witness_rc_pg` → refused, no `.env` |
| 15 | `instance.restored` recorded, no secrets in the output | yes | confirmed | 4 rows on the final SQLite; the database password in no log |
| 16 | Storage files written once and checked | no | confirmed | Probes; mode 0600 in the tests on all 4 |
| 17 | Real services and Windows paths | no | can't check here | No live service, no Windows; task 7's CI |

**Overall:** not met: lost, added, repeated or reordered data entries stop the restore on all four; SQLite's lock keeps a starting server out and is released on every path; non-empty SQLite files stay byte-identical; cross-kind values, server refusals and the audit event hold. Missing: a SQLite target takes impossible or garbage timestamps (and PG shifts pre-1883 timestamps outside UTC); `backup.json` and `manifest.json` aren't required in the second read; settings races (a remaining window, removed and rewritten files). Minor messages.

### Re-check

Witnessed: 2026-10-13 01:21 EDT, by a fresh agent (blind). Commit: 611afdbb + working tree (20 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests restore on each of the four databases, from each other kind, from an older migration set, and refuse a non-empty target, a newer backup and an altered archive with nothing changed | yes | confirmed | SQLite → 40 passed, 2 skipped; `test:db:postgres` / `:mysql` / `:mariadb` → 41 passed, 1 skipped each; packages/server → 124 |
| 2 | Real scripts, cross-kind | no | confirmed | `env -i`, scratchpad data folders: SQLite setup → backup → new PG db: "Restored 7 rows in 25 tables…"; again → "isn't empty… Nothing was changed."; PG → MariaDB → new SQLite: each "Restored"; 3 `instance.restored` events at the end |
| 3 | Step 1: the second read requires `backup.json` and `manifest.json` | yes | confirmed | `restore.ts:366`; swapped at the missing-artifact question on SQLite and PG: without either or both → "…went missing… partly restored… empty both", no `.env`, no `instance.restored`; an altered backup.json → "changed since…", rows rolled back; moving either to the end → restored |
| 4 | Nothing else takes their branch | yes | confirmed | `restore.ts:341-342`; an extra `database/zzz.txt` with manifest.json's bytes → "changed since the archive was verified" |
| 5 | A test covers a missing backup.json/manifest.json | yes | confirmed | `restore.db.test.ts:521-522`; reducing `:366` to `missing("")` → the test fails |
| 6 | A test shows restore's own SQLite lock | yes | confirmed | `restore.db.test.ts:609-619` (`onLocked` → `tryWriteSqlite` → `SQLITE_BUSY`); removing the exclusive mode → fails. The other writer is a second connection in the same process |
| 7 | A new settings file is linked into place, never replacing one that appeared | yes | confirmed | `run-restore.ts:298-310` (`linkSync`, EEXIST → kept); `linkSync` onto an existing file → `EEXIST`, content unchanged. Test gap: `rmSync(envFile); linkSync(…)` still passes (the test's file appears before the existence check) |
| 8 | Windows paths: storage keys written with the platform's separators | no | can't check here | `restore.ts:295`; needs task 7's Windows server check in CI |
| 9 | `rmk-server restore` refuses while a real service runs | no | can't check here | Only the mocked test here; needs task 7's server checks |

**Overall:** not met: the Done when holds on the four databases, and both gaps of the 01:01 re-check are closed with tests that fail without the fixes; rows 8–9 wait for task 7's CI. Low: no test covers the settings link window. Remark: a missing backup.json or manifest.json is noticed at the end, after the rows commit (the spec's "stops it" holds; the target must be emptied). Stale note (PLAN, Values bullet: "a Date … toDbDate") — since fixed.

### Adversarial re-check

Witnessed: 2026-10-13 01:27 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (19 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests pass on all four databases | yes | confirmed | SQLite 40 passed, 2 skipped; PG, MySQL, MariaDB 41/1 each; packages/server 124 |
| 2 | Cross-kind restores keep every value (real scripts) | yes | confirmed | `env -i … TZ=America/New_York`: SQLite (40,007 rows) → PG → MariaDB → MySQL → new SQLite, all exit 0; md5 of audit_log, user, account, workspaces, workspace_members, catalogue_revision identical to the source; the artifact identical, mode 600 |
| 3 | Timestamps exact at year boundaries and outside 1970–2038, every kind and time zone | yes | confirmed | 19 values (0001-01-01 … 9999-12-31T23:59:59.999, DST days) into each kind, read back as server text: 0 mismatches on SQLite, PG, MySQL, MariaDB under UTC, America/New_York, Africa/Monrovia (SQLite also Asia/Kathmandu); out of PG and back: 0 |
| 4 | Timestamps survive the trip out of a MySQL/MariaDB archive | no | partly | MySQL/MariaDB → SQLite: `0001-01-01` → `2001-01-01`, `0050-06-15` → `1950-06-15`, `0099-12-31` → `1999-12-31`, `0000-01-01` → `2000-01-01`, no error: the values are right in MySQL, backup's dump (mysql2's Date parsing) moves them. Years from 0100 exact; the app can't write such years |
| 5 | SQLite `_at` text columns checked as timestamps; the guard keeps the naming true | yes | confirmed | `2026-02-30…`, `2026-10-12 15:31:02`, `1728000000000` into SQLite → "…column created_at: not an ISO 8601 UTC timestamp"; `_at` → `text` in a scratch copy → the test fails; the guard checks both directions on the servers (it sees the latest schema only) |
| 6 | `backup.json` and `manifest.json` must come again; nothing else takes their branch | yes | confirmed | Swapped in `onLocked` on SQLite and PG: without either → "…went missing…"; extra `database/zzz.txt`, extra `zzz` after the manifest, a renamed part → "…changed…"; twice → "…is in the archive twice"; restoring `restore.ts:366` → the swap test fails |
| 7 | Any change to the archive between the reads stops it | no | partly | backup.json moved after manifest.json → `RESOLVED {"rows":7,"files":1}`, `.env` written (order not checked on the second read; no data lost). An unknown table's part → refused but "Cannot read properties of undefined (reading 'columns')" |
| 8 | SQLite: restore's own lock keeps others out; the `onLocked` test guards it | yes | confirmed | Without the exclusive mode → the test fails; 3 × 3 concurrent real restores into one file: one restored each time, the others "isn't empty…" or "in use… Nothing was changed."; integrity ok |
| 9 | The settings file is read again at the end | yes | confirmed | Rewritten → warning; removed → said, none written; appeared → kept byte-identical; a dangling symlink at `.env` → treated as appeared |
| 10 | A new settings file is linked into place, never replacing one, with sound failure paths | yes | partly | APFS `--with-settings` → 600, targets merged. But a leftover `.env.restore-<pid>` at 0644 → `.env` 644 with AUTH_SECRET (no chmod, no `wx`); a symlink at that temporary path → its target overwritten; on FAT32 `linkSync` → ENOTSUP ("couldn't be written"), where setup's rename works |
| 11 | SQLite URLs compared by file | yes | confirmed | `file:./x/../t.db` vs `file:<abs>/t.db` → no warning |
| 12 | Refusals change nothing | no | confirmed | db tests on all four; real: into the restored PG → refused; byte 5000 altered → refused, 0 tables, no `.env` |
| 13 | `instance.restored` recorded, no secrets | no | confirmed | 4 rows on the final SQLite; the password in no log; 46 related unit tests pass |
| 14 | Real services and Windows paths | no | can't check here | Task 7's CI |

**Overall:** not met: cross-kind restores, timestamps in every era and zone, the `_at` check and guard, the required JSON entries, SQLite's lock, the settings re-read and the refusals hold; open: a reordered archive restores (no data lost); the settings file's creation follows a leftover or symlinked temporary file and fails without hard links; MySQL/MariaDB archives move years 0000–0099 (backup's dump); real services and Windows wait for task 7. Minor: year 0000 into PostgreSQL fails without part, line and column.

### Adversarial re-check

Witnessed: 2026-10-13 01:39 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (21 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests pass on all four; the full suites pass on MySQL and MariaDB | yes | confirmed | SQLite set → 40 passed, 2 skipped; PG set with create-db → 43/2; full `test:db:mysql` and `test:db:mariadb` alone → 108 files, 979 passed, 1 skipped each (a first run failed only from the witness's own concurrent core rebuild); packages/server 124 |
| 2 | `readDatetime` reads every valid DATETIME exactly, leaves other types as mysql2 read them | yes | confirmed | MySQL 8.4 and MariaDB 10.11: datetime(0/3/6), years 0001, 0004-02-29, 0050, 0099, 0100, 1969, 2038, 9999, 1–6 fraction digits exact; NULL → null; `max()`, `now(3)`, `cast`, `convert_tz` → Dates; TIMESTAMP, DATE, TIME, YEAR, JSON, BIGINT, DECIMAL, tinyint, text, blob as before (DATE still through mysql2; no schema column is DATE) |
| 3 | `readDatetime` never turns a stored value into another date | yes | not met | `0000-00-00 00:00:00` → `-000001-11-30T00:00:00.000Z`, `2026-00-15` → `2025-12-15` (mysql2 gave Invalid Date). MariaDB's default `sql_mode` accepts `2026-00-15 10:00:00` in `audit_log.created_at`: backup exits 0, `--verify` passes, restore into SQLite exits 0 with 2025-12-15. Before, backup refused both (`dump.ts:32`) |
| 4 | MySQL/MariaDB archives keep years 0000–0099 | yes | confirmed | MariaDB `0050-06-15 12:34:56.789` → archive → SQLite exact; the chain keeps 0001, 0050, 9999, 1883 |
| 5 | Cross-kind restores keep every value (real scripts) | yes | confirmed | `TZ=America/New_York`, 25,003 rows and a 300 KB file: SQLite → PG → MySQL → MariaDB → SQLite; md5 of user, workspaces, catalogue_revision identical; audit_log identical but the source's later `instance.backup_made`; the blob identical |
| 6 | The second read checks the format's order; an unknown table's part is "changed" | yes | confirmed | backup.json last, settings.env before storage, manifest among the parts, `database/zzz/000001.jsonl` first or last → refused as changed or missing; unchanged order → resolved. Test gap: no test of the unknown table |
| 7 | The second read refuses every order the first refuses | yes | partly | Parts interleaved (`audit_log/1, catalogue_revision/1, audit_log/2`) or reversed (`000003…000001`): `--verify` refuses them, but swapped between the reads both resolve (no data lost). A child table before its parent → refused, worded "FOREIGN KEY constraint failed" |
| 8 | Year 0000 refused, with part, line and column, into PostgreSQL too | yes | confirmed | MariaDB `0000-01-01` → restore into PG → "database/audit_log/000001.jsonl, line 4, column created_at: not an ISO 8601 UTC timestamp" |
| 9 | The settings file created exclusively, 0600, no temporary file, any file system | yes | confirmed | `run-restore.ts:302-310`; a dangling symlink → "appeared… kept", its target not created; umask 000 → `-rw-------`; a FAT32 image → written; read-only folder → EACCES |
| 10 | SQLite: concurrent restores leave one restored, the others told nothing changed | yes | confirmed | 3 rounds of 3 → 1 each; integrity ok |
| 11 | Real services and Windows paths | no | can't check here | Task 7's CI |

**Overall:** not met: the Done when on the four databases, years 0000–0099 out of MySQL/MariaDB, cross-kind values outside UTC, the order check, the unknown-table refusal, year 0000, the exclusive settings create and SQLite's lock hold. Missing: `readDatetime` turns zero and out-of-range dates into other real dates (backup now moves `2026-00-15` to 2025-12-15 where it refused); the second read accepts parts in an order the first refuses (no data lost). Test gap: the unknown table.

### Adversarial re-check

Witnessed: 2026-10-13 02:25 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (21 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when's db tests pass on all four databases | yes | confirmed | SQLite (backup set + create-db) → 43 passed, 3 skipped; PG → 44/2; full `test:db:mariadb` → 980 passed, 1 skipped; MySQL `restore.db.test.ts` alone → 13/13 |
| 2 | The full database suites pass on MySQL and MariaDB | yes | partly | MariaDB passes. Full `test:db:mysql` failed 3 of 3 runs on this machine with 30 s timeouts in `restore.db.test.ts` (the file took 119–142 s); 7–8 sessions waited in `get_lock` at once: Kysely's MySQL lock is one name for the whole server (`mysql-adapter.js:4`), and restore holds it for its whole run (`run-restore.ts:202`) |
| 3 | `readDatetime` never turns a stored value into another date | yes | confirmed | MariaDB (default `sql_mode`) `2026-00-15`, `2026-01-00`, `0000-00-00`, and with ALLOW_INVALID_DATES `2026-02-30`, `2026-04-31 23:59:59.999` → backup "…holds an invalid date…", exit 1; the same on MySQL with `sql_mode=''`; 18 odd strings → Invalid; NULL → null; TIMESTAMP → `next()`; the mutation → the create-db test fails |
| 4 | Valid DATETIMEs, years 0001–0099 included, read back exactly | yes | confirmed | `0004-02-29 12:00:00.5` → `0004-02-29T12:00:00.500Z`; `0050-06-15 12:34:56.789`, `9999-12-31 23:59:59.999` exact; 4,000 fraction strings exact |
| 5 | The second read must see exactly verify's parts, in order | yes | confirmed | 25,000 audit rows (3 parts) changed between the reads: interleaved, reversed, contents swapped between names, an extra `000004`, `zzz` first, `.JSONL` → "…changed…", 0 rows; dropped or moved → "…went missing", 0 rows; unchanged → restored |
| 6 | A test covers moved parts and an unknown table's part | yes | confirmed | `restore.db.test.ts:719`; removing the `partOrder` comparison → it fails. The `byName` check is now redundant |
| 7 | Cross-kind restores keep every value outside UTC | yes | confirmed | `TZ=America/New_York`: MariaDB → PG → MySQL → SQLite; 0001-01-01, 0099-12-31T23:59:59.999, 1850, a DST day, 9999-12-31T23:59:59.999 exact; metadata hex identical; `.env` 0600 |
| 8 | Year 0000 refused, with part, line and column | yes | confirmed | MariaDB `0000-01-01` → backup exit 0, `--verify` exit 0 → restore: "…line 1, column created_at: not an ISO 8601 UTC timestamp". Remark: backup and verify accept an archive no restore takes |
| 9 | Refusals change nothing | yes | confirmed | Into the restored PG → refused, still 7 audit rows, no `.env`; a byte changed at 3000 → "padding is damaged. Nothing was changed."; the db test on all four |
| 10 | A change after the rows commit still stops the restore | yes | confirmed | `settings.env` dropped or `manifest.json` moved before it → refused, no `.env`; rows stay with "partly restored… empty both" (the known remark) |
| 11 | SQLite's lock, the exclusive settings create, `instance.restored` | yes | confirmed | Their tests pass; real chain: 3 `instance.restored` rows, no secrets; `.env` `-rw-------` |
| 12 | `packages/server` tests | no | confirmed | 124 passed |
| 13 | Real services and Windows paths | no | can't check here | Task 7's CI |

**Overall:** not met: both gaps of 01:39 are closed (invalid DATETIMEs refused by backup on MariaDB and MySQL; any part order but verify's refused, with a test). Open: the full MySQL suite times out here while restores wait on Kysely's server-wide `get_lock` — in production a restore on a shared MySQL or MariaDB server blocks other instances' migrations for its whole run; real services and Windows wait for task 7. Low: year 0000 backs up and verifies but can't be restored.

### Adversarial re-check

Witnessed: 2026-10-13 02:50 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (23 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when's db tests pass on SQLite and PostgreSQL | yes | confirmed | SQLite 43 passed, 4 skipped; PG 44/3 |
| 2 | The full database suites pass on MySQL, MariaDB and PostgreSQL | yes | confirmed | Each alone: MySQL 981 passed, 1 skipped, 162 s, no timeouts; MariaDB 981/1, 144 s; PG 979/3, 111 s |
| 3 | On one database, the migration lock keeps the other paths out | yes | confirmed | MySQL 8.4 and MariaDB 10.11, a restore holding 4 s: a `migrateToLatest` on the same database waited (4,854 / 4,401 ms, applied 0); a second restore waited, then "isn't empty… Nothing was changed."; a backup's snapshot wait waited; 4 concurrent server starts → `[24,0,0,0]`, no errors |
| 4 | Different databases now run independently | yes | confirmed | A restore into `rc5_r2` while `rc5_r1` was held → 929 / 400 ms; migrate B 841 / 319 ms; snapshot B 3–5 ms; PostgreSQL: another database's advisory lock in 15 ms, the same database refused |
| 5 | Inside a restore, migrating on its own session doesn't wait for itself | yes | confirmed | Acquire twice, release once → still held; again → free, both servers; restores report `newer: []` |
| 6 | The lock name works for unusual database names | no | confirmed | `rc5 ü-x`, a 64-character name → 56-character names, the same hash on both. Remarks: with no database selected, MySQL errors but MariaDB's `get_lock(NULL)` returns NULL silently (unreachable: `url.ts:43` requires a database); names differing only in case on case-insensitive hosts not tried |
| 7 | Nothing still uses Kysely's server-wide lock | no | confirmed | Only `create-db.ts` makes a MySQL dialect; while the new lock is held, `is_used_lock('ea586330-…')` → null. Remark: an older Ronne's lock doesn't exclude the new one during an upgrade |
| 8 | A test guards the per-database lock | yes | confirmed | `create-db.db.test.ts:80-114` |
| 9 | The dump refuses timestamps before year 1 | yes | partly | Refused on MariaDB and MySQL `0000-01-01`, PG `0001-01-01 BC` and `0002-06-01 BC`. A SQLite source with `audit_log.created_at` = `0000-01-01T00:00:00.000Z` or `-000001-01-01T00:00:00.000Z` → backed up; restore then refuses ("…partly restored… empty both") |
| 10 | The real restore script works and refuses a second time | no | confirmed | Into MariaDB → exit 0, 24 migrations, `instance.restored`, `.env` 0600; again → "isn't empty… Nothing was changed.", exit 1 |
| 11 | `packages/server` tests | no | confirmed | 124 passed |
| 12 | Real OS services and Windows paths | no | can't check here | Task 7's CI |

**Overall:** not met: the per-database lock holds on every path and the three full suites pass. Open: a SQLite source backs up a timestamp before year 1 that restore refuses (low); real services and Windows wait for task 7. Remarks: an older Ronne isn't excluded during an upgrade; `get_lock`'s result (a timeout) is ignored, as in Kysely's adapter; case-insensitive database names not tried.

### Adversarial re-check

Witnessed: 2026-10-13 03:11 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (24 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when's db tests pass on all four databases | yes | confirmed | SQLite `--project db` → 968 passed, 14 skipped; the server suites include `restore.db.test.ts`'s cross-kind, older-migration and refusal tests |
| 2 | The full database suites pass on MySQL, MariaDB and PostgreSQL | yes | confirmed | One at a time: MySQL 981/1, 168 s; MariaDB 981/1, 122 s; PG 979/3, 124 s; no timeouts |
| 3 | What the app writes into SQLite `_at` columns still backs up | no | confirmed | A real instance (setup, sign-in, token exchange through Better Auth): its 20 `_at` values are all `YYYY-MM-DDTHH:MM:SS.mmmZ`, backup exits 0; Better Auth 1.7.5–1.7.7 writes `toISOString` on SQLite (`factory.mjs:130`); migrations write only `toDbDate`, no `CURRENT_TIMESTAMP` |
| 4 | The dump refuses SQLite `_at` text no restore takes, keeps what restore takes | yes | confirmed | `0000-…`, `-000001-…`, `+010000-…`, a space form, epoch ms, Feb 30, 4 fraction digits, `T24:00`, `+00:00`, a trailing LF, fullwidth digits → refused, partial archive removed; `…53Z`, `…53.8Z`, `0001-01-01…`, `9999-12-31…999Z` back up and restore unchanged; disabling the check or `startsWith("0000")` → `dump.test.ts` fails |
| 5 | No backup holds a timestamp no restore takes | yes | partly | (a) a SQLite `_at` blob (the bytes of a valid ISO string) → backup and `--verify` exit 0, restore refuses after migrating; (b) a PostgreSQL `created_at = '10000-01-01'` → `+010000-01-01T…`, backup and verify pass, restore refuses. `infinity` refused at backup. The app writes neither (low) |
| 6 | The MySQL/MariaDB lock throws unless `GET_LOCK` answers 1 | yes | confirmed | The real adapter with a fake connection: 1 and `"1"` take it; 0, NULL, 2, no row throw. MariaDB: `KILL QUERY` on a waiting restore's `get_lock` → NULL → exit 1, nothing written; MySQL: "Query execution was interrupted" → exit 1. Remarks: no test; the message says "held it for an hour" after a killed wait, and "If anything was written, empty it" when nothing was |
| 7 | Cross-kind restores keep every value (real scripts) | yes | confirmed | `TZ=America/New_York`: SQLite → MariaDB → MySQL → PG → SQLite, all exit 0, `.env` 0600; md5 of user, session, account, access_tokens, workspaces, workspace_members identical; 4 `instance.restored` |
| 8 | Refusals change nothing | yes | confirmed | Into the restored PG → "isn't empty… Nothing was changed."; a header byte or a part byte changed → checksum refusal, 0 tables, no `.env` |
| 9 | SQLite's lock: concurrent restores | yes | confirmed | 3 rounds of 3 → 1 restored per round; integrity ok |
| 10 | Settings: `--with-settings` and a kept file | yes | confirmed | The backup's file written 0600; a kept `.env` unchanged with its warnings |
| 11 | `instance.restored` | yes | confirmed | `{"via":"cli","from":{…},"rows":N,"files":0}`, no secrets |
| 12 | `packages/server` tests | no | confirmed | 124 passed |
| 13 | Real OS services and Windows paths | no | can't check here | Task 7's CI |

**Overall:** not met: invalid SQLite timestamps are refused at backup while everything the app writes backs up; the lock's failure path stops restores before writing; the four suites, cross-kind restores, refusals, SQLite's lock, settings and the audit event hold. Open: a SQLite `_at` blob or a PostgreSQL year past 9999 backs up and verifies but no restore takes it (low); real services and Windows wait for task 7. Wording: the lock-failure and "If anything was written" messages; no test of the lock's failure path.

**Owner's decision (2026-10-13):** the two rows no pass can check here — writing storage files with Windows paths, and `rmk-server restore` refusing while a real service (systemd, launchd, Windows) runs — are closed by task 7's CI: its backup → restore runs in the Windows, macOS and Ubuntu server checks, which install and stop the real services. Task 6 stays unticked until those pass on the pull request and a re-check records it.

### Adversarial re-check

Witnessed: 2026-10-13 08:30 EDT, by a fresh agent (adversarial). Commit: 611afdbb + working tree (24 modified, 6 untracked: restore.ts, run-restore.ts, scripts/restore.ts, both restore db tests, db/testing/sqlite-files.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when's db tests pass on all four databases | yes | confirmed | SQLite `--project db` → 968 passed, 15 skipped; `restore.db.test.ts` (`:226` cross-kind, `:270` into SQLite, `:285` older set, `:330` refusals) in every server suite |
| 2 | The full suites pass on PostgreSQL, MySQL and MariaDB; `packages/server` passes | yes | confirmed | One at a time: PG 979/4, MySQL 982/1, MariaDB 982/1, no timeouts; packages/server 124 |
| 3 | A SQLite `_at` value that isn't text stops the backup | yes | confirmed | Real `pnpm run backup`: a blob → "…holds a value that isn't text, which isn't a timestamp a restore takes. The partial archive was removed"; an integer → refused |
| 4 | Every Date outside 1–9999 stops the backup, and everything it lets through restores | yes | confirmed | PG `10000-01-01`, `275000-01-01`, `0001-01-01 BC` → refused, no archive; 29 `encodeRow` probes refused as expected; everything accepted passes `convertValue` for sqlite, postgres, mysql |
| 5 | A lock failure stops the restore before writing, saying "Nothing was changed" | yes | confirmed | Real script, `KILL QUERY` on its waiting `get_lock`: MariaDB → "…The migration lock couldn't be taken… Nothing was changed.", MySQL → "…Query execution was interrupted. Nothing was changed."; 0 tables, no `.env` |
| 6 | A test covers the lock's failure path | yes | confirmed | `create-db.db.test.ts:122` passes on MariaDB; with the result check removed it fails on MariaDB (on MySQL the killed wait errors, so it passes either way; CI runs MariaDB) |
| 7 | A failure after writing started tells the user to empty the target | no | confirmed | A PG role without CREATE on `public` → "…Migration (before any migration) failed: permission denied for schema public. If anything was written, empty it before trying again.", 0 tables. Remark: nothing was written there, and the message doesn't say what was left (low) |
| 8 | Cross-kind restores keep every value (real scripts) | yes | confirmed | `TZ=Asia/Kolkata`: SQLite → PG → MySQL 8.4 → MariaDB 10.11 → new SQLite, each exit 0; final rows' hex identical; 4 `instance.restored`; `.env` 0600 |
| 9 | Non-empty target, newer backup, altered archive refused, nothing changed | no | confirmed | Into the restored PG → refused, 4 audit rows kept; a part's byte changed → checksum refusal, 0 tables; `9999_future` → "comes from a newer Ronne… Nothing was changed.", 0 tables |
| 10 | An older migration set restores, then the newer migrations run | no | confirmed | `restore.db.test.ts:285` in all four suites |
| 11 | Real OS services and Windows paths | yes | can't check here | Task 7's CI, per the owner's decision of 2026-10-13 |

**Overall:** not met only for row 11, which the owner's decision closes by task 7's CI: the five gaps of 03:11 are closed (SQLite `_at` blobs and numbers and dates outside 1–9999 refused at backup; a lock failure stops before writing with "Nothing was changed"; a test kills a waiting `GET_LOCK`), with no regressions. Low remarks: a failed first migration says "If anything was written…" though nothing was; the lock-failure test guards the result check on MariaDB only.

## Task 7 — The restore test in CI

Witnessed: 2026-10-13 15:25 EDT, by a fresh agent (blind). Commit: c637a6de + working tree (8 files modified, uncommitted). Machine: macOS 27.0.1 (arm64), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `server-probe.js` backs up, restores into a new data folder, starts a server on it | no | confirmed | `pnpm build:server`, pack, install into the scratchpad, `env -i … server-probe.js <prefix>/bin/rmk-server` → exit 0 with the three restore steps; the restored `.env` names `restored/`, not `data/` |
| 2 | A token made before the backup works after the restore | no | confirmed | `server-probe.js:259-260`; the restored db → `kept-through-restore|0` |
| 3 | A token revoked before the backup stays revoked | no | confirmed | `:263-265`; with the DELETE removed → "✗ the token revoked before the backup got 200, not 401"; restored db → `revoked-before-backup|1` |
| 4 | `/api/v1/me` names the same account | no | confirmed | `:261-262` compares the JSON |
| 5 | A stored file comes back byte for byte | no | confirmed | 300 KiB compared with `Buffer.equals`; a flipped byte after the backup → "✗ the stored file came back different"; restored file mode 600 |
| 6 | The probe runs in `server-checks.yml` on Ubuntu, macOS and Windows | no | confirmed | The matrix and `:48`; `ciScope(["packages/repo-tools/src/server-probe.js"])` → server. Linux and Windows need CI |
| 7 | The bundle smoke test runs the restore check | no | confirmed | `bundle.js` → darwin-arm64 archive; `bundle-smoke.js <archive>` → exit 0 with the restore lines |
| 8 | The image's smoke test runs backup → restore → start with the same checks | no | partly | `scripts-probe.sh ronne-web:t7` → exit 0, but it checks only the kept token: no revoked token, no `/me` comparison, 0 stored files |
| 9 | Linux and macOS service tests: backup as the service's account (600), restore refused while running | no | can't check here | systemd/launchd with sudo: CI. The texts match `control.ts:229` and `run-restore.ts:156`; `bash -n` ok |
| 10 | Windows service test | no | can't check here | Windows and WinSW: CI |
| 11 | With RONNE_DATA_DIR set, the default backups folder is `$RONNE_DATA_DIR/backups` | no | confirmed | `run-backup.ts:255-261`; the probe's `backups/` check passes; the image says "Wrote /app/data/backups/…" |
| 12 | *Done when:* the workflows pass on a pull request | no | can't check here | Not pushed; `ciScope` would run server and image for these files |

**Overall:** not met: the probe's four checks hold locally (npm install and bundle) and catch planted faults; the image smoke test is thinner (row 8); the service tests, Windows and the PR's workflows need CI (rows 9, 10, 12). Remarks: the image probe leaked the first container's anonymous volume (`docker rm -f` without `-v`, older than this change); the service tests' `rmk backup | grep -q` under pipefail is the broken-pipe pattern removed from the image probe (not reproduced); a PR changing only backup or restore code ran neither suite.

**Since this pass:** the image probe now checks a revoked token, `/me` and a stored file's sha256 too (run here: all pass), and removes its containers with `-v` (no volume left); the service tests capture backup's output instead of piping it; `ci-scope.js` runs the image and server suites for `apps/web/src/server/backup/` and the backup and restore scripts (tested). **Owner's decision (2026-10-13):** tasks 3, 6 and 7 are ticked once the pull request's workflows pass and a re-check records them.

## Tasks 3, 6 and 7 — CI on pull request #180

Witnessed: 2026-10-13 20:30 EDT, by a fresh agent (blind). Commit: 241d6d3. Machine: macOS 27.0.1, Node v24.0.0 (local; the checks themselves ran on GitHub runners).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The CI runs checked are PR #180's runs on head 241d6d34 | no | confirmed | `gh pr view 180 --json headRefOid` → `241d6d341dd5…`; runs `38489664964` (Server package) and `38489664909` (Image) → `"event":"pull_request","headSha":"241d6d34…"`, success. Each job log: `HEAD is now at 65e5338 Merge 241d6d34… into 7487ada…` (the PR's merge ref) |
| 2 | Task 3: on macOS the server probe's `backup --out <data>/STORAGE/b` is refused | no | confirmed | `server-probe.js:170-183` (win32/darwin only; requires "inside the storage folder" and no `b` left). Install and run (macos-latest, Node 22) …/runs/38489664964/job/115612796914 and (Node 24) …/job/115612796864 → `✓ backup --out STORAGE/b: refused as inside storage (case-insensitive disk)` |
| 3 | Task 3: the same on Windows | no | confirmed | (windows-latest, Node 22) …/job/115612796868 and (Node 24) …/job/115612796848 → the same line. Ubuntu leaves it out, as intended |
| 4 | Task 6: on Windows a restore writes storage files with Windows paths, starts, and the stored file is identical | no | confirmed | job/115612796868 and job/115612796848 → `Saved C:\Users\RUNNER~1\…\data\.env`, `✓ restore into a new data folder`, `✓ the restored instance: 200, the token works, the revoked one doesn't, the file is the same`; the win32-x64 and win32-arm64 bundle jobs show the same |
| 5 | Task 6: `rmk-server restore` refused while the systemd service runs | no | confirmed | `test-linux-service.sh:100-104`. Service on Linux (systemd) …/job/115612796743 → `✓ sudo rmk-server backup as rmk-server (600); restore refused while running, and once stopped stops at its own emptiness check` |
| 6 | Task 6: the same under launchd | no | confirmed | `test-macos-service.sh:86-90`. Service on macOS (launchd) …/job/115612796683 → the same line with `_rmkserver` |
| 7 | Task 6: the same under WinSW | no | confirmed | `test-windows-service.ps1:139-143`. Service on Windows (WinSW) …/job/115612796730 → `✓ backup to the service's backups/; restore refused while running, and once stopped stops at its own emptiness check` |
| 8 | Task 7: server-checks.yml runs backup → restore → start with the four checks on Ubuntu, macOS and Windows, and passes | no | confirmed | All 6 Install and run jobs pass and log `✓ before the restore: two tokens (one revoked), a stored file, a backup`, `✓ restore into a new data folder`, `✓ the restored instance: 200, the token works, the revoked one doesn't, the file is the same`; `server-probe.js:259-267` |
| 9 | Task 7: the bundle smoke test runs the same and passes | no | confirmed | All 6 bundles jobs (darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64) → `✓ no Node.js on PATH`, the restore lines, `✓ rmk-server-0.3.2-<target> runs with its own Node.js, none on PATH` |
| 10 | Task 7: the image's smoke test runs backup → restore → start with the four checks and passes | no | confirmed | Image (amd64) …/runs/38489664909/job/115611669293 → `Restored 18 rows in 25 tables and 1 stored file from in.tar … into the SQLite database.`, `OK: backup, pnpm run restore on a new volume, start: 200, the token works, the revoked one doesn't, the account and the stored file are the same`; the gate job → `Image builds: success` |

**Overall:** met: on PR #180's CI for 241d6d34 (merge ref 65e5338), the case-insensitive `STORAGE/b` refusal ran on macOS and Windows, the Windows restore round trip and the refusal under each of the three services passed, and backup → restore → start with all four checks passed in server-checks (3 systems × 2 Node versions), all 6 bundle smoke tests and the image probe. Notes: the jobs ran on the PR's merge commit, as `pull_request` runs do; the image probe ran on amd64 only in this run. These close the rows the owner's decisions left to CI (task 3's case-insensitive check; task 6's Windows paths and running-service refusal).

## Tasks 3 and 6 — adversarial re-check after CI

Witnessed: 2026-10-13 20:44 EDT, by a fresh agent (adversarial). Commit: 241d6d34. Machine: macOS 27.0.1 (APFS, case- and normalization-insensitive), Node v24.0.0.

Safety record, the same before and after: `md5 apps/web/.env` → b9eb4577b627e856bf865342d88e9368; `git -C apps/web status --short --ignored .env data` → `!! .env`, `!! data/`. Every server database made was dropped; no containers or volumes.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The archive is complete: `backup.json` first, database, storage, `settings.env` byte for byte, `manifest.json` last | no | confirmed | A real SQLite instance backed up; `tar -tf` in that order; a CRLF `.env` archived byte for byte (`cmp`); restored and compared per table → equal except audit_log's `instance.restored` row |
| 2 | The partial file, and folders it made, are removed on failure | no | confirmed | `vitest --project db src/server/backup` → 35 passed, 2 skipped; removing `unlink(partial)` → 1 test fails, `removeMade()` → 2; real SIGINT/SIGTERM mid 1.5 GiB → removed, exit 130/143; SIGHUP to the group → removed, 129 |
| 3 | The disk-full failure is tested with a mock writer | no | confirmed | `run-backup.db.test.ts:373` (ENOSPC); the partial-removal mutation fails it |
| 4 | `--out` makes folders 0700 and the archive 0600 | no | confirmed | `umask 000`, `--out out1/n1/n2` → `drwx------` ×3, `-rw-------`; mutating the modes → 2 tests fail |
| 5 | An `--out` inside storage is refused, whatever its spelling | no | confirmed | storage itself, a subfolder, `STORAGE`, `A/Data/Storage`, `..`, links into storage, NFD vs NFC, NFD+case before storage exists (refused after mkdir, folders removed) → all refused, storage unchanged; a dangling link → ENOENT, nothing written; Windows CI job 115612796848 → "refused as inside storage". Remark: the pre-check alone can be mutated away and the tests pass, since the post-mkdir check catches every case |
| 6 | `--no-settings`; environment-only settings named without values | no | confirmed | No `settings.env`; manifest `{'included': False, 'environmentOnly': ['AUTH_SECRET','TRUST_PROXY']}`; the output names them; mutation → 1 test fails |
| 7 | `--keep` is 1–10,000, counts only real archives, never removes the new one | no | confirmed | `0`, `10001`, `-1`, `1.5`, `1e3`, `abc`, `""` → exit 2; with decoys (`.partial`, other names, a folder, a symlink) `--keep 2` removed only the 3 oldest real archives; each mutation fails a test |
| 8 | Audited as `instance.backup_made` | no | confirmed | The audit row's summary has counts, `encrypted`, `settings`, no path or passphrase; mutation → 4 tests fail |
| 9 | Wired into `pnpm run`, tsdown, `SCRIPTS`, help, `scriptForService` and the image | no | confirmed | `package.json:29-30`, `apps/web/package.json:19-20`, `tsdown.config.ts:20-21`, `packages/server/src/cli.ts`, `control.ts:201-202`, `docker/pnpm`; packages/server → 124 tests pass; the Image job builds `dist-scripts/backup.mjs` and `restore.mjs` |
| 10 | Nothing is written when the settings or the database can't be read or reached | no | confirmed | `.env` mode 000 → EACCES; missing SQLite file → refused, none created; PostgreSQL on a closed port → ECONNREFUSED; a wrong password → 28P01, not shown; `data/` empty each time |
| 11 | Restore verifies first: a cut, altered, newer or out-of-order archive is refused with nothing changed | no | confirmed | "cut short", "header checksum", "comes from a newer Ronne (9.9.9)…Nothing was changed", format 2, "aren't in the order", `storage/../../escape.txt` → "isn't allowed"; targets empty afterwards |
| 12 | A non-empty target database or storage is refused, nothing changed | no | confirmed | SQLite target unchanged (stat+md5, only `-shm`'s mtime); storage unchanged; two restores at once into one new PostgreSQL database → one restored, one "isn't empty", one `instance.restored` row |
| 13 | The migration lock, and SQLite held by another process | no | confirmed | PostgreSQL advisory lock held 8 s → restore waited; MySQL lock per database (another database 1 s, the same 6 s); SQLite held three ways → "in use by another process…Nothing was changed", md5 unchanged; removing the lock or exclusive mode → 9 / 5 tests fail |
| 14 | Restore across all four kinds | no | confirmed | Restore and dump suites on PostgreSQL, MySQL, MariaDB → 46 passed, 1 skipped each; SQLite passes; real CLI SQLite→PG, SQLite→MySQL, encrypted PG→MariaDB and →SQLite; a wrong passphrase refused; CI on PR #180: `restore.db.test.ts` 13 passed on each server |
| 15 | An older archive restores, then gets the newer migrations | no | confirmed | `restore.db.test.ts:285` on all four; mutating `migrateToLatest` → 1 test fails |
| 16 | The settings step and `instance.restored` | no | confirmed | New `.env` at 0600 with a new AUTH_SECRET; `--with-settings` without `--database-url` → the backup's own non-empty database refused, md5 unchanged; no URL password shown (5 bad URLs); the audit row's summary has `from`, rows, files |
| 17 | The service tests back up as the service's account; restore refused while it runs | no | confirmed | PR #180 CI: Linux 115612796743, macOS 115612796683, Windows 115612796730 → the step passed (not run here) |

**Overall:** met: every claim held; refusals changed nothing, the locks held on the three servers and SQLite, and no `--out` spelling got inside storage. Low remarks outside the *Done when*: (1) a closed stdout (`| head -1`) crashes `backup` and `restore` with an unhandled EPIPE after they finished, so the exit is non-zero for a complete archive (`scripts/backup.ts:26`, `scripts/restore.ts:62`); (2) SIGHUP to tsx's parent alone, in a clone, orphans the backup (tsx's relay; a terminal hang-up signals the group, which works); (3) storage keys differing only by case can't restore onto a case-insensitive disk: it fails after the rows commit with an honest "partly restored" message; (4) with `RONNE_DATA_DIR` or `RONNE_ENV_FILE` set, `scriptForService` skips the running-service refusal (`control.ts:222`); the emptiness check and the locks still stop a restore into a set-up instance.

## Follow-up: the adversarial re-check's remarks (after #180)

Witnessed: 2026-10-14 07:28 EDT, by a fresh agent (adversarial, focused on the last fixes, the owner's choice). Commit: 227ebda7 + the working tree. Machine: macOS 27.0.1, Node v24.0.0.

Safety record, the same before and after: `md5 apps/web/.env` → b9eb4577b627e856bf865342d88e9368; `git -C apps/web status --short --ignored .env data` → `!! .env`, `!! data/`; `grep -l fu-adv7 node_modules/.bin/*` → nothing. Disk images detached and deleted; no containers started.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1a | `checkStorageNames` removes the files and folders it made, and nothing already there | no | confirmed | APFS, HFS+ and exFAT images: clash pairs, file/folder clash, NFC/NFD, merged folder spellings → nothing left; a file another process wrote into the storage folder or a made folder stayed, and `leftover` named the folders |
| 1b | A user's `._x` beside a folder it makes stays (APFS, HFS+); on exFAT the driver changes it | no | confirmed | `._x` md5 unchanged on APFS and HFS+; on exFAT plain `/bin/mkdir x` rewrote `._x` and `/bin/rmdir x` deleted it; removing the guard fails "a ._ file already beside a folder it made stays" |
| 1c | It never removes a file another process writes meanwhile | no | partly | A writer's `s0/._f0.tgz`, `s1/._f1.tgz` and `storage/._s0`, written after the check made `s0`/`f0.tgz`, were deleted; its other files survived |
| 2a | A signal during the check undoes, prints what's left, and exits 130/143/129/131 | no | not met | Random-moment signals: 20 of 60 swallowed on APFS, 11 of 40 on exFAT; aimed at the cleanup, 8 of 8; on a real 20,001-file restore, SIGINT/SIGTERM during the cleanup let it finish ("Restored … 20,001 stored files", exit 0). When handled: the right codes, and an unremovable folder's message printed |
| 2b | Nothing it made is left, at any moment (APFS, exFAT) | no | confirmed | 100 random-signal trials → `left=0`; only runs through the tsx CLI wrapper on SIGHUP/SIGQUIT left the child running, which then emptied the folder (the spec's tsx note) |
| 2c | A test covers a signal | no | confirmed | `storage-names.test.ts` sends SIGINT, expects 130; dropping `process.on` fails it. Not the last stretch |
| 3 | A dangling link or a file on the storage path gets the plain error; a real clash the clash message (APFS, HFS+, exFAT) | no | confirmed | "can't be written … (EEXIST)" / "(ENOTDIR)"; a case-sensitive backup's `a.tgz`/`A.tgz` → "are one name in the storage folder…" on all three, nothing left; restores on case-sensitive APFS; mutation `madeHere = true` fails the test |
| 4 | The closed-output script test asserts the restore's `.env` | no | confirmed | `scripts/backup.db.test.ts:172`; a mutation writing `.env` only on a TTY fails it |
| 5 | SPEC step 4 says the above and nothing untrue | no | partly | The exit-code promise (row 2a) and "nothing else" (row 1c) were untrue |
| 6 | No regression | no | confirmed | `vitest run src/server/backup` → 63 passed, 2 skipped; `--project db src/server/backup scripts` → 69 passed, 3 skipped (×4; the first cold run in a fresh copy had 3 failures that didn't recur); `test:db:postgres -- src/server/backup` → 36 passed, 1 skipped |
| 7 | Windows | no | can't check here | The pull request's CI |

**Overall:** not met: nothing is ever left behind, but a signal in the check's last stretch or cleanup could be lost (the restore went on), the cleanup removed `._name` files another process wrote into folders it made, and the spec promised neither happens.

**Since this pass** (the owner's decision: this focused pass, then the pull request; nothing further unless a real safety problem): the check lets the event loop in once more before its handlers go, so a pending signal is handled (40 SIGINTs aimed at the end of a 20,000-file check: all exit 130, nothing left; before, about a third lost), and it removes a `._name` only when it appeared as the check made `name`. The spec says both. Windows is checked by the pull request's CI.

## Task 8 — The backup runbook

Witnessed: 2026-10-14 09:22 EDT, by a fresh agent (blind). Commit: fac4c78d. Machine: macOS 27.0.1 (Apple M1 Max), Node v24.0.0; Docker 29.7.2 (image `ronne-web:t8` from this commit, project `-p t8witness`); a Debian container (node:24-trixie-slim) with a simulated installed Linux service.

Safety record, the same before and after: `md5 apps/web/.env` → b9eb4577b627e856bf865342d88e9368; `git -C apps/web status --short --ignored .env data` → `!! .env`, `!! data/`; `grep -l t8-blind node_modules/.bin/*` → nothing. Projects, container, image and database removed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The runbook covers every topic the task lists | yes | confirmed | `backup.md`: the table, cron, systemd, launchd, Task Scheduler, Docker host, off machine, restoring, another machine, another database, Caddy, encryption at rest, vacuum, timings |
| 2 | The table's paths and commands match the code | no | confirmed | `layout.ts`, `run-backup.ts:260-261`, `docker/pnpm`, `package.json:29-30`, `Dockerfile:62-64` |
| 3 | `install.md`'s "Back up" points to it | yes | confirmed | `install.md:288-291` |
| 4 | npm `rmk-server backup` while running: the output, 0700 folder, 0600 archive | yes | confirmed | The packed 0.3.2 under `env -i` → "Wrote …", the warning; `drwx------`, `-rw-------` |
| 5 | `--keep` removes only older archives | yes | confirmed | 3 archives, a `.partial`, `notes.txt`; `--keep 2` → "Removed 2 older archives", the others left |
| 6 | `--encrypt` with `RONNE_BACKUP_PASSPHRASE` or `--passphrase-file` | yes | confirmed | `.tar.enc`; `--verify --passphrase-file` → complete; a wrong one → exit 1 |
| 7 | `--verify` as the sample | yes | confirmed | Plain archive → "…is complete…", exit 0; in Docker too |
| 8 | `--no-settings` | yes | confirmed | No `settings.env` in the tar |
| 9 | Docker backup to `/app/data/backups/`, names TRUST_PROXY | yes | confirmed | "Wrote /app/data/backups/… ! TRUST_PROXY comes from the environment…" |
| 10 | `docker compose cp web:/app/data/backups/. ./ronne-backups/` keeps 0600 | yes | confirmed | 3 files, `-rw-------` |
| 11 | The Docker in-place restore | yes | confirmed | "Restored 23 rows … 4 stored files … Next, start the server: docker compose up -d."; health ok |
| 12 | The Docker restore on another machine | yes | confirmed | Restored; health ok; `backups/` 0755 from `mkdir -p` (not 0700) |
| 13 | Caddy's `caddy-data` save and put back | yes | confirmed | The same `instance.uuid` in both projects |
| 14 | npm restore into PostgreSQL writes that URL | yes | confirmed | `t8w_restore` (dropped after); the server started on it |
| 15 | The Docker bundled-PostgreSQL restore as written | yes | partly | With `RONNE_DB_PASSWORD` only in `.env`, the literal `$RONNE_DB_PASSWORD` → "client password must be a string", exit 1 |
| 16 | npm, no service: move aside, encrypted restore, start | yes | confirmed | Restored; the second restore refused (not empty) |
| 17 | `sudo rmk-server backup` runs as the service's account | no | confirmed | Simulated install → "…, as rmk-server: Wrote …", `backups/` the account's, 0700 |
| 18 | The service in-place restore (`mv /var/lib/rmk-server …`) | yes | not met | → `EACCES … mkdir '/var/lib/rmk-server'` with a stack trace: the account can't make the folder in `/var/lib` |
| 19 | The cron lines work under cron | yes | partly | npm's `rmk-server` under cron's `PATH` → `env: node: No such file or directory`, 127; the packages' launcher has its own Node |
| 20 | The Docker-host cron lines | yes | confirmed | Both exit 0, `.tar` and `.tar.enc` |
| 21 | The systemd units | yes | can't check here | No systemd; by reading, `ExecStart` is the package's launcher |
| 22 | The launchd plist | yes | partly | `plutil -lint` OK; npm's `rmk-server` needs `node` on launchd's short `PATH` (row 19) |
| 23 | Task Scheduler | no | can't check here | Needs Windows |
| 24 | `rsync … --exclude '*.partial'` | yes | confirmed | The archives copied, not the `.partial` |
| 25 | `rclone`, `aws s3 cp` | no | can't check here | Not installed; no remote |
| 26 | `sqlite3 ronne.db ".backup copy.db"` | yes | confirmed | Exit 0 |
| 27 | The service's Caddy folder paths | no | confirmed | `layout.ts`; macOS's not named |
| 28 | Encryption at rest matches the code and spec | no | confirmed | `crypto.ts:1-5` |
| 29 | The vacuum note matches the snapshot | no | confirmed | `db/snapshot.ts:19-20` |
| 30 | The timings come from CI | yes | not met | Measured on an M1 Max; no benchmark in CI; reproduced here |
| 31 | Troubleshooting messages are the code's | no | confirmed | `run-restore.ts`, `verify.ts`, `control.ts`, `run-backup.ts` |
| 32 | After a Docker restore, `docker compose up -d` | yes | confirmed | Rows 11, 12, 15 |
| 33 | *Done when:* each command run, written in the notes | yes | partly | Rows 15, 18, 19 fail as written; systemd, launchd, Windows, MySQL, rclone, aws not run |

**Overall:** not met: backup, `--keep`, `--encrypt`, `--verify` and both Docker restores work as written; the service in-place restore fails with EACCES, the Docker bundled-PostgreSQL restore needs the password in the shell, cron and launchd need `node` on the scheduler's `PATH` for npm installs, and the timings aren't from CI.

**Since this pass:** the service in-place restore moves the database and storage aside inside the data folder (which stays), and restores from `backups/` there, run in a simulated Linux service (Debian, the account, `/etc/rmk-server` as `service install` makes it): restored as the account, the stored file identical; the old form now gets "the data folder … isn't there and couldn't be made (EACCES). Make it, owned by the account that runs Ronne" instead of a stack trace (`run.ts`). The bundled-PostgreSQL URL takes the password written in (from `.env`), as run on 2026-10-14 earlier. Cron gets a `PATH` line (run: 127 without it, 0 with it) and the plist an `EnvironmentVariables` `PATH` (`plutil -lint` OK); the packages' launcher needs neither. The Docker copy-in makes `backups/` 0700. macOS's paths are named. Windows is gone from the runbook (owner's decision, 2026-10-14: no Windows server in the next release, 121).

## Task 8 — The backup runbook (re-check)

Witnessed: 2026-10-14 09:45 EDT, by a fresh agent (blind). Commit: b1608cf3. Machine: macOS 27.0.1 (Apple M1 Max), Node v24.0.0 (containers: node:24-trixie-slim, debian:13). It saw the diff's "After the witness" note before its verdicts (the rest of the notes only after).

Safety record, the same before and after: `md5 apps/web/.env` → b9eb4577b627e856bf865342d88e9368; `git -C apps/web status --short --ignored .env data` → `!! .env`, `!! data/`; `grep -l t8-recheck node_modules/.bin/*` → nothing. Containers ran with `--rm`; the `t8b` project `down -v`; the image removed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The service in-place restore works on a simulated Linux service | yes | confirmed | Debian, the account, `/etc/rmk-server` and `/var/lib/rmk-server` as install makes them; setup, a 300 KiB file, backup; the runbook's `mv` and `restore` → "Restored 7 rows … 1 stored file", exit 0; the file's sha256 matches; `--verify` complete |
| 2 | Moving the data folder away gives one line, not a stack trace | yes | confirmed | `backup` and `restore` → "rmk-server: the data folder /var/lib/rmk-server isn't there and couldn't be made (EACCES). …", exit 1 (`run.ts:123-132`) |
| 3 | The cron lines with the `PATH` line work for npm, as cron runs them | yes | confirmed | Plain and encrypted → exit 0; "Wrote …tar" and "…tar.enc"; `--keep 2` left 2 |
| 4 | Without the `PATH` line, 127 | yes | confirmed | "env: 'node': No such file or directory" |
| 5 | The plist lints and its `PATH` finds node | yes | confirmed | `plutil -lint` OK (both variants); `/opt/homebrew/bin/node` found. Remark: with both Homebrew and /usr/local nodes, launchd uses Homebrew's |
| 6 | The systemd units pass `systemd-analyze verify` | yes | confirmed | debian:13, systemd 257 → exit 0 (also with `EnvironmentFile=`); negative controls exit 1 |
| 7 | Docker copy-in makes `backups/` 0700 node's; restore works | yes | confirmed | `drwx------ node:node`, archive 0600; restored; `/` → `/sign-in`; sha256 matches |
| 8 | Bundled-PostgreSQL restore with the password in the URL | yes | confirmed | "into the PostgreSQL database"; `psql` shows root@example.com; sha256 matches |
| 9 | No Windows left in the runbook | yes | confirmed | Only line 69 (WSL 2 or a VM) |
| 10 | Timings from the benchmark on a named machine, matching | yes | confirmed | Re-run on M1 Max: SQLite 0.07/0.18 s, PostgreSQL 0.14/0.36 s, held 1.5/16.7 MiB |
| 11 | The spec's edge case matches the decision | yes | confirmed | `SPEC.md:265-267` |
| 12 | The spec and task match the runbook after no-Windows | no | partly | `SPEC.md:24-25` Task Scheduler, `:250` a Windows service row, `:257` BitLocker; the task's first line Task Scheduler; 121 not in `docs/features` |
| 13 | The rest of the runbook matches the code | no | confirmed | Every quoted message and flag found; macOS paths match `layout.ts:111-125` |

**Overall:** not met: every command re-run holds; the spec and the task text still describe Windows for the runbook (row 12).

**Since this pass:** the spec's runbook scope, table and encryption-at-rest line, and the task's first line, have no Windows (with "no Windows server, 121"); the stale "not run here" note says Windows was since removed; 121's spec and index row are on this branch.

## Task 8 — The backup runbook (re-check of the documents)

Witnessed: 2026-10-14 09:34 EDT, by a fresh agent (blind, read-only). Commit: dab6ae65. Machine: macOS 27.0.1, Node v24.0.0. (It notes the re-check before it reads 09:45 EDT, later than its clock: that time was mistyped.)

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The spec's runbook scope lists no Windows scheduler | no | confirmed | `SPEC.md:24-26`; `backup.md:64-200` |
| 2 | The spec's table has no Windows row | no | confirmed | `SPEC.md:245-250`; the row removed in the diff |
| 3 | Encryption at rest matches, without BitLocker | no | confirmed | `SPEC.md:257-260`; `backup.md:350-359` |
| 4 | Task 8's text has no Windows | no | confirmed | `PLAN.md:64-72` |
| 5 | Remaining Windows mentions are code or history and don't contradict the runbook | no | confirmed | SPEC:194, 207, 292, 319; PLAN's task 7 text and notes; the runbook's only mention is WSL 2 or a VM |
| 6 | 121's SPEC.md and PLAN.md exist | no | confirmed | Both present |
| 7 | 121 says the next release has no Windows server | no | confirmed | `121/SPEC.md:127-132`, `121/PLAN.md:10` |
| 8 | 121's index row agrees with its spec | no | partly | `README.md:246` still described a migration from 0.3.x and "owner's open questions first" |
| 9 | *Done when*: each command run, written in the notes | no | confirmed | The notes, and the earlier passes' rows (fixes confirmed by the re-check) |
| 10 | Schedules checked without being installed | no | confirmed | Cron with and without `PATH`, Docker-host cron, `systemd-analyze verify`, `plutil -lint` |
| 11 | `rclone`, `aws s3 cp`, bundled MySQL unrun by decision | no | confirmed | `backup.md:211-212`, `:308-309`; `PLAN.md:69-72` |
| 12 | Timings from the benchmark on a named machine | no | confirmed | `PLAN.md:67-68`; the re-check's row 10 |
| 13 | The first pass's Windows rows no longer apply | no | confirmed | No Task Scheduler, BitLocker or PowerShell in the runbook |
| 14 | The records pass the checker | no | confirmed | `pnpm witness:check` → no errors |

**Overall:** not met: task 8's documents agree on no Windows and every *Done when* claim is confirmed or covered by the owner's decisions; 121's index row contradicted its spec (row 8). Remarks: 099's acceptance criterion naming Windows server checks (met on #180) goes out of date with 121; `install.md`'s Windows parts are 121's task 5.

**Since this pass:** 121's index row says the next release, with 099, and no migration; status "specified".

## Task 8 — The backup runbook (final check)

Witnessed: 2026-10-14 09:36 EDT, by a fresh agent (blind, read-only). Commit: 6027c918. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | 121's index row says no migration | no | confirmed | `README.md:246`; `121/SPEC.md:132-133` |
| 2 | It says the next release, with 099 | no | confirmed | `README.md:246`; `121/SPEC.md:127,132`; `121/PLAN.md:10` |
| 3 | Its status agrees | no | confirmed | "specified"; all six tasks open |
| 4 | Its *Depends on* agrees with the spec | no | partly | Row "081, 082, 084, 086"; `121/SPEC.md:3` still "…, 099" |
| 5 | Only the row and WITNESS.md changed since dab6ae65 | no | partly | Also `topics.ts` (7557c69f, task 9's) |
| 6 | Task 8's files unchanged, so earlier confirmations stand | no | confirmed | Empty diff for the runbook, SPEC.md and PLAN.md |
| 7 | *Done when*: the topics | no | confirmed | First pass rows 1, 2, 26-29, 31; re-check row 9; documents re-check rows 1-3, 13 |
| 8 | `install.md` points to it | no | confirmed | `install.md:291` |
| 9 | Each command run, written in the notes | no | confirmed | First pass rows 4-20, 24, 26, 32; its failures fixed and confirmed by the re-check's rows 1-4, 7, 8 |
| 10 | Schedules checked, not installed | no | confirmed | Re-check rows 3-6; first pass row 20 |
| 11 | `rclone`, `aws s3 cp`, bundled MySQL unrun by decision | no | confirmed | Documents re-check row 11 |
| 12 | Timings from the benchmark on a named machine | no | confirmed | Re-check row 10; documents re-check row 12 |
| 13 | The spec and task agree with the runbook | no | confirmed | Documents re-check rows 1-5 |
| 14 | `pnpm witness:check` passes | no | confirmed | Exit 0 |

**Overall:** not met: every claim of task 8's *Done when* is confirmed across the passes; 121's row and spec disagreed on 099 as a dependency (row 4); the `topics.ts` change is task 9's (row 5).

**Since this pass:** 121's spec header drops 099 too (they land together), and the spec's Goal gets the owner's words and the clients' paragraph, which an earlier edit meant to add but didn't save.
