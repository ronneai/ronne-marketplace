# 135 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision and policy

Eight earlier blind passes (2026-10-28, 11:41 to 12:25 EDT) were not met. What they found, all fixed
before this pass:
- the Docker wrapper's container user couldn't read Ronne's `0700` folder on Linux, and then didn't
  map right under rootless Docker;
- the wrapper ignored rootless Docker, because Ronne gives the scanner its own `HOME`;
- the install didn't pin the commit or install from `uv.lock`;
- the installed tree had licences outside §1 (now E-11);
- SkillSpector falls back to `OPENAI_*` when a provider's key is missing, so only the chosen
  provider's variables are passed;
- wording: package counts, a provider that doesn't exist, where settings may live, what static
  scans send to OSV.dev, and the list of allowlist tests.

Witnessed: 2026-10-28 12:28 EDT, by a fresh agent (blind). Commit: 6e8b39e2 (plus the uncommitted Task 1 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §12 has a "Security scan" bullet | no | confirmed | `git diff docs/MVP/MVP.md` → "Security scan in review (M20, 135)" under `## 12. Security considerations`: static by default, at most OSV.dev, nothing with `--network none`, semantic only with an operator-set provider plus root's choice, no shell, env allowlist without `DATABASE_URL`/`AUTH_SECRET`, timeout, advisory |
| 2 | MVP.md §15 has a decision-log entry covering the spec's decisions 1–3 | no | confirmed | New "Security scan" row at the end of `## 15. Decision log`: decision 1 (on the server, advisory), 2 (never bundled, operator pins it), 3 (command from `RONNE_SKILL_SCANNER`, never from the web, with the reason); it also matches decision 5 |
| 3 | The dependencies policy lists SkillSpector as an operator-installed tool: Apache-2.0, Python, pinned, not in the pnpm tree or the image | no | confirmed | `dependencies.md:109-116`: "aren't in the pnpm tree, the image or the bundles"; Apache-2.0, Python 3.12+, v2.13.2 at `abd82935…`, `uv sync --frozen`. `ss-src/pyproject.toml:11` → `>=3.12,<3.15`; `git rev-parse HEAD` → `abd82935…`, `git describe` → v2.13.2 |
| 4 | E-11 covers the five non-§1 Python licences and agrees with the note | no | confirmed | E-11 lists certifi, orjson, tqdm, regex, typing_extensions (MPL-2.0 / CNRI-Python / PSF-2.0), allowed (owner, 2026-10-28); same in the note and PLAN Notes; 63 installed / 158 in `uv.lock` everywhere (`grep -c '^\[\[package\]\]' uv.lock` → 158) |
| 5 | docs/features/README.md adds M20 with 135 | no | confirmed | `README.md:362` `### M20 — Security scan`; row 135 depends on 013, 014, 015, 060, 129 (as the SPEC header), "in progress" |
| 6 | Knowledge note: hardening rules | no | confirmed | "The rules Ronne follows" 1–7 match SPEC Behaviour and the acceptance criteria; rule 4's test list matches PLAN task 4 and the SPEC word for word |
| 7 | Knowledge note: pinned install | no | confirmed | Checks out the commit with `--detach`; A is `uv sync --frozen --no-dev --no-editable`, B is `scripts/skill-scanner/Dockerfile` (uv 0.13.0 and the Python base pinned by digest, no git). The pin is the same in the note, policy, Dockerfile header, wrapper `IMAGE=` and `licences.py` |
| 8 | Knowledge note and wrapper: `--network none --read-only --user`, folder mounted read-only | no | confirmed | `sh -n` ok. Wrapper with `RUNTIME=echo`: static → `--network none`, `--user 0:0`, `--read-only`, `-v <dir>:/scan/skill:ro`; semantic with empty `SEMANTIC_NETWORK` → refused, exit 2; with `llmnet` → `--network llmnet`; a non-`scan` call → exit 2 |
| 9 | Knowledge note: semantic analysis | no | confirmed | Matches SPEC Behaviour (prefix, only the chosen provider's variables, only for semantic, the fallback explained, `ANTHROPIC_BASE_URL`/`OPENAI_PROJECT_ID` ignored) and Out; the wrapper's 12 `-e` provider variables are the SPEC table's 12 |
| 10 | Knowledge note: how to upgrade the pin | no | confirmed | "Moving the pin" 1–5; the fixtures README exists |
| 11 | Settings-file statements agree with config.ts | no | confirmed | `config.ts`: the file is `RONNE_ENV_FILE` or `.env`, the environment wins; `run-backup.ts` puts the settings file in the backup, as the note says; `config.ts` reads `RONNE_SKILL_SCANNER`, `_TIMEOUT` and the `_ENV_` prefix |
| 12 | SPEC facts about SkillSpector are right | no | confirmed | `ss-src/README.md:27,409` → 71 patterns in 17 categories; semgrep only in a `pyproject.toml` comment |
| 13 | PLAN, SPEC, MVP, README, policy and note agree | no | confirmed | Static default, semantic opt-in, settings sources, Docker installs out, 63 packages, decisions 1–5, the `instance_settings` keys |
| 14 | Relative links resolve | no | confirmed | `links.mjs` over the six docs → 340 links and anchors; the one flag is pre-existing example text `[words](address)` in backticks at MVP.md:998 |
| 15 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → 0 |

**Overall:** met: the decision, policy row, E-11, M20 entry, knowledge note and scripts are present, agree with each other and with SkillSpector v2.13.2 and config.ts.

## Task 2 — Recorded fixtures and parseSkillScan

Three earlier blind passes (12:21, 12:28, 12:43 EDT) were not met. What they found, all fixed before
the passes below:
- paths with a scheme (`file:`, `https:`) or `~` were kept;
- line numbers past an INTEGER column, and a fractional score, were kept;
- a version longer than its 64-character column was kept;
- a path too long to keep was cut instead of dropped;
- invisible characters survived the cleaning: the right-to-left mark and zero-width characters first,
  then the soft hyphen, variation selectors and tag characters, then unassigned default-ignorables
  and lone surrogates;
- the character class was written with literal bidirectional characters; it now uses escapes only.

Witnessed: 2026-10-28 12:43 EDT, by a fresh agent (blind). Commit: 19a4a00d (plus the uncommitted `packages/core/src/skill-scan/` and `packages/core/src/index.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The fixtures are real SkillSpector v2.13.2 `--no-llm --format json` reports on `examples/items/secure-coding`, `examples/items/github-mcp` and a bad sample skill | no | confirmed | Re-recorded all three with image `skillspector:2.13.2` through the wrapper, using fixtures/README.md's loop → exit 0/0/1, 0 SAFE 0 / 22 CAUTION 2 / 100 DO_NOT_INSTALL 14. `jq -S` diff with the committed reports: only `scanned_at` and the random `finding_id`s differ |
| 2 | Its suite passes on the fixtures and on bad input (missing fields, wrong types, huge strings, 10k findings) | no | confirmed | `vitest run src/skill-scan` → 57 passed (fixtures, 14 refusals, 10,000 findings, 2,000-emoji strings) |
| 3 | Exported from `@ronneai/core`; the package type-checks | no | confirmed | `index.ts` exports `parseSkillScan`, `SKILL_SCAN_*` and 5 types; `typecheck` clean; `biome check` clean |
| 4 | It refuses anything that isn't a report | no | confirmed | "", BOM, a log line first → "not JSON"; scores "50", true, null, 1e400, -0.1, 100.4 → refused; lowercase severity, numeric id, `issues: null` → refused; CRLF JSON → ok |
| 5 | The LLM check, and a semantic scan whose LLM didn't run kept as static | no | confirmed | Static with llm_requested true / "false" / 0 / missing → "not a static scan"; semantic with false or none → "not a semantic scan"; unavailable or errored → `static`, `llmUnavailable: true` |
| 6 | Sorted most severe first, capped at 200, the rest counted | no | confirmed | 10k / 100k / 300k issues → 200 kept, the rest counted. Mutations (no sort, no cap) → tests fail |
| 7 | Only known fields survive | no | confirmed | "SECRET" in extra fields at every level → absent from the output |
| 8 | The cleaning removes what its doc comment says | no | partly | Default-ignorable code points (U+E0080–E0FFF, U+FFF0–FFF8, U+17B4, U+2065) and lone surrogates survived |
| 9 | Paths: relative inside the item, else null | no | confirmed | null for `a/../b`, `..\x`, `..<ZWSP>/x`, `<RLO>/etc`, leading spaces, `C:x`, `\\?\C:\x`, `//host/x`, `~`, 501 characters, non-strings. Mutations of each check → tests fail |
| 10 | What it returns fits the columns | no | confirmed | Version: 64 code points kept, 65 refused; score 99.5 → 100; lines over 2147483647 → null; 200 maxed findings = 523,401 bytes (longtext). Mutations → tests fail |
| 11 | No literal invisible characters in the source | no | confirmed | `LC_ALL=C grep -nP '[^\x09\x0a\x20-\x7e]'` → only the visible `…` and `😀` |
| 12 | The tests cover the behaviour | no | confirmed | 17 mutations in a scratch copy each fail at least one test |

**Overall:** not met: row 8. The cleaning was fixed (`\p{Default_Ignorable_Code_Point}` and `\p{Cs}` added) and re-checked below.

### Re-check

Witnessed: 2026-10-28 12:46 EDT, by a fresh agent (blind). Commit: 19a4a00d (plus the uncommitted Task 2 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Cleaning removes every Cc but tab and newline, plus every Cf, Cs, Default_Ignorable_Code_Point (assigned or not), Zl and Zp, and nothing else | no | confirmed | `sweep.ts` sends all 0x110000 code points through `parseSkillScan` and compares with an independent `\p{…}` check → removed 6,319, kept 1,107,793, mismatches 0 |
| 2 | Lone surrogates are removed; pairs are kept | no | confirmed | `\ud800`, `\udfff`, a reversed pair → removed; `😀` kept |
| 3 | Tabs and newlines are kept | no | confirmed | `"line1\nline2\tcol"` unchanged |
| 4 | Ordinary text is left alone, apart from what the doc comment lists | no | confirmed | Accents, combining accents, CJK, Arabic, Hebrew, Devanagari unchanged; emoji with skin tones and flags intact; ZWJ sequences split, as the comment says |
| 5 | Tests cover the cleaning | no | confirmed | Mutations (no Default_Ignorable, no Cs, no tab/newline lookahead) → tests fail |
| 6 | Core suite and typecheck pass | no | confirmed | `pnpm --filter @ronneai/core test` → 42 files, 447 passed; `typecheck` exit 0 |
| 7 | Spot-check: fixtures, LLM refusal, paths, export | no | confirmed | `spot.ts`: the three fixtures parse as recorded and are refused as semantic; hostile paths → null; `index.ts` exports |

**Overall:** met: with the re-check, every claim holds: real fixtures, the export, refusals, the LLM checks, sorting and caps, field dropping, paths, column fit, and cleaning that matches its doc comment for every code point.

## Task 3 — Migration

Witnessed: 2026-10-28 12:21 EDT, by a fresh agent (blind). Commit: 6e8b39e2 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration's db test passes on SQLite | no | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db src/server/db/migrations/0038_content_scans.db.test.ts` → 1 file, 5 passed |
| 2 | The same on PostgreSQL 15, MySQL 8.4 and MariaDB 10.11 | no | confirmed | `pnpm test:db:postgres -- <file>`, `:mysql`, `:mariadb` (containers already up) → 5 passed on each |
| 3 | The guard test passes, and the FK is table-level, not inline | no | confirmed | `vitest run src/server/db/migrations/migrations.guard.test.ts` → 39 passed. `0038_content_scans.ts` uses `.addForeignKeyConstraint("content_scans_revision_id_fk", …)`. Mutation in a scratch copy (inline `.references(...)`) → guard fails |
| 4 | Columns match the spec's Data section (all 20, nullability; attempts and findings_omitted not null, default 0) | no | confirmed | `information_schema.columns` / `pragma table_info` on all four → id, revision_id, scanner, status, queued_at not null; attempts, findings_omitted not null default 0; 13 others nullable. `complete` boolean/tinyint/INTEGER; `findings` longtext on MySQL/MariaDB; timestamps timestamptz/datetime/TEXT. Insert without `scanner` rejected |
| 5 | revision_id → submission_revisions, ON DELETE CASCADE; unknown revision refused | no | confirmed | db test "goes with its revision" checks `foreignKeys()` = CASCADE and the delete, on all four. Mutation (cascade removed) → that test fails on SQLite. "refuses a scan of a revision that doesn't exist" passes on all four |
| 6 | Indexes on (status, queued_at) and on revision_id | no | confirmed | Probe → `content_scans_status_idx (status, queued_at)` and `content_scans_revision_idx (revision_id, queued_at)` on all four; revision_id leads the composite index, so it covers the spec's "on revision_id" |
| 7 | Several rows per revision allowed, ordered by queued_at | no | confirmed | db test "keeps several scans of one revision" → 2 rows in queued_at order on all four; no unique constraint on revision_id |
| 8 | Findings larger than MySQL's 64 KB `text` are stored whole | no | confirmed | db test stores 200×500-character findings (>65,535) and reads them back exactly on all four. Mutation `longText()` → `text()` → that test fails on MySQL |
| 9 | Registered and safe to re-run | no | confirmed | `migrations/index.ts` adds `"0038_content_scans": contentScans` after 0037. Calling `up()` again on a migrated database → no error, still 3 indexes on all four |
| 10 | `ContentScanTable` matches the columns and is in `Database`; typecheck passes | no | confirmed | All 20 columns with matching nullability, `Generated<number>` for the two defaulted counts, `content_scans: ContentScanTable` in `Database`. `pnpm --filter @ronneai/web typecheck` → exit 0 |

**Overall:** met: table, FK cascade, indexes and types hold on SQLite, PostgreSQL, MySQL and MariaDB; the guard test passes; mutations show the tests catch a missing cascade, MySQL's `text` limit and an inline reference.

### Adversarial pass

An earlier adversarial pass (12:29 EDT) was not met: `scanner_version` (64) and `llm_model` (128) were
narrower than what the parser and `scanProvider` let through. The parser now refuses a version over 64
code points, `scanProvider` cuts the model to 128, and the db test writes the longest values, multi-byte.

Witnessed: 2026-10-28 12:40 EDT, by a fresh agent (adversarial). Commit: 19a4a00d (plus the uncommitted working tree). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration's db test passes on all four databases | no | confirmed | `vitest run --project db …/0038_content_scans.db.test.ts` with `TEST_DATABASE_URL` unset, then PG 15, MySQL 8.4, MariaDB 10.11 → `6 passed (6)` on each |
| 2 | The guard test passes and covers 0038 | no | confirmed | `migrations.guard.test.ts` → 39 passed. Mutation: inline `.references(...)` in 0038 → the guard fails |
| 3 | Every Data-section column exists, and `ContentScanTable` matches | no | confirmed | `diff` of `addColumn` names against `ContentScanTable` keys → match; all 20 columns; `tsc --noEmit` exit 0 |
| 4 | Registered in `migrations/index.ts` | no | confirmed | `index.ts:83`. Mutation removing it → 5 of 6 db tests fail |
| 5 | Cascade to `submission_revisions`; a missing revision refused | no | confirmed | Deleting the submission or the revision removes the scans on all four. Mutation without cascade → "goes with its revision" fails |
| 6 | Everything the real writers produce fits, multi-byte included (`parseSkillScan` → `finish`) | no | confirmed | Probe with the real `parseSkillScan`, `scanProvider` and repository on 1,000 hostile issues (700 😀 ids, quotes, backslashes, 模, 497-character paths, line 2147483647, score 99.5) → 200 findings, 800 omitted, 1,422,201 bytes of JSON read back equal on all four. Mutation `findings` as `text` → fails on MariaDB |
| 7 | `scanner_version` holds the parser's longest (64 code points, astral too) | no | confirmed | 64×😀 round-trips on all four; 65 ASCII → refused on PG, MySQL and MariaDB (strict). Mutation varchar(63) → test fails |
| 8 | `llm_model` (128) and `llm_provider` (32) hold what `scanProvider` writes | no | confirmed | Model of 400×😀 → 128×😀, read back on all four; `openai_compatible` (17) fits; 129 → refused on the servers. Mutation varchar(127) → test fails |
| 9 | `error` (64) holds every `ScanError` | no | confirmed | Every reason, including `exit -1.7976931348623157e+308` (28 characters), stored exactly on all four; the two newer reasons are 19 and 12 characters |
| 10 | Integer and boolean columns round-trip | no | confirmed | `complete` false → false; score 99.5 → 100; `findings_omitted` and `attempts` take 2147483647 on all four |
| 11 | Rerun after a partial failure is safe; both indexes exist | no | confirmed | `up()` again, then with one and both indexes dropped → exactly the two indexes on all four (`mysqlHasIndex` skips existing ones) |
| 12 | Restore naming (`_at` only for timestamps) and newest-last ordering | no | confirmed | `restore.db.test.ts -t naming` passes on PG, MySQL, MariaDB; mutations `finished_at`→`finished` and `llm_note`→`llm_note_at` fail it. Ties on `queued_at` go to the newer ULID on all four |

**Overall:** met: types, cascade, indexes and rerun safety hold on all four databases; every value the writers produce fits, astral characters included; each test fails under its mutation.
