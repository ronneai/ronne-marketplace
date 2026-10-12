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
