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

## Task 4 — The runner

Witnessed: 2026-10-28 12:21 EDT, by a fresh agent (blind). Commit: 6e8b39e2 + uncommitted working tree (Task 4's files only). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass and the web app type-checks | no | confirmed | `pnpm --filter @ronneai/web exec vitest run src/server/domains/scans/services` → 1 file, 55 passed; `pnpm --filter @ronneai/web typecheck` → no errors |
| 2 | A `SkillScanner` interface; `commandSkillScanner` reads the command, the timeout and the prefixed provider variables | no | confirmed | `models/scan.ts`; `command-scanner.ts` `parseScannerCommand` (JSON array, 1–32 non-empty strings, no control chars) and `parseScanTimeout` (30–3600, else 300), with `it.each` cases |
| 3 | `config.ts` exposes `skillScanner` {command, timeout, env = every `RONNE_SKILL_SCANNER_ENV_*`, environment over file} | no | confirmed | Probe with a `.env` file and an env → environment wins, empty values dropped, unprefixed `OPENAI_API_KEY` not taken; nothing set → `{"env":{}}` |
| 4 | Argument array, no shell; `--no-llm` left out only for semantic | no | confirmed | `spawn(program, [...leading, ...args], {shell:false})`. Probe argv static `[…,"scan","…/ronne-scan-*/item","--no-llm","--format","json"]`, semantic without `--no-llm`. Mutations (drop `--no-llm`, always add it, provider for static) each fail tests |
| 5 | Files in a new private `0700` folder under `os.tmpdir()`, modes kept, `home/` beside `item/` | no | confirmed | Probe tree: root, home, item, nested folders 700; executable 700; others 600; cwd/HOME/TMPDIR = `…/home`. Mutation 0o644 → test fails |
| 6 | Bad paths refused before anything runs | no | confirmed | `../x.md`, `/etc/x`, `a\b`, `a/../b`, `./a`, `a/./b`, `""`, `a/`, `..`, `x\0y`, duplicates, file-in-file, NFC+NFD → `bad file path`, scanner never ran. Removing the checks or `wx` → tests fail |
| 7 | Environment built from nothing; never DATABASE_URL, AUTH_SECRET, unprefixed OPENAI_API_KEY, or a prefixed name off the list | no | confirmed | Probe with those plus prefixed `PATH`, `HOME`, `NODE_OPTIONS`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY` (provider anthropic): static gets exactly the 7 (plus macOS's `__CF_USER_TEXT_ENCODING`); semantic adds only `SKILLSPECTOR_PROVIDER` and `ANTHROPIC_API_KEY`. MAX_WORKFLOW_SECONDS 300→290, 30→20. Mutation spreading the parent env → 3 tests fail |
| 8 | Provider variables only for semantic, only prefixed, only the chosen provider's; missing needs or unsupported → none | no | confirmed | Code matches the spec table for all 6 providers; tests cover the cases; probe: `ANTHROPIC_BASE_URL` and a prefixed `OPENAI_API_KEY` didn't reach an anthropic scan |
| 9 | Exit 0/1 with a valid report → done; exit 2 → `exit 2`; invalid/unrequested LLM → `invalid report`; missing command → `not found` | no | confirmed | Tests pass. Probe: `not found`, `not runnable`, `signal`. A real SkillSpector 2.13.2 run through the wrapper on `examples/items/review-diff` → ok, static, 0, SAFE |
| 10 | The timeout kills the whole process group | no | confirmed | Probe `grand-hang` (sleep 600 grandchild, 1 s) → `timeout`, grandchild dead; parent-exits-grandchild-holds → `timeout`, grandchild dead. Mutation killing only the child → test fails |
| 11 | At most 4 MiB of output; more → `output too large` | no | confirmed | Slow 64 KiB flood → `output too large`; exactly 4 MiB report → ok; 20 MiB stderr only → ok. Mutation removing the cap → test fails |
| 12 | The folder is removed afterwards, success or not | no | confirmed | No `ronne-scan-*` left after every probe and a real scan. Mutation removing `rm` → 13 tests fail |

**Overall:** met: every claim held in the tests and in the probes; every mutation tried made a test fail.

### Adversarial pass

Five earlier adversarial passes (12:29, 12:44, 13:12, 13:11, 13:22 EDT) were not met. What they found,
all fixed before the pass below:
- a provider named `constructor` or `__proto__` crashed the lookup;
- a relative command could run a submitted file;
- the timeout could be outlived by a process in its own session, and by the wrapper's container;
- processes a finished scanner left in its group survived;
- setup failures and `spawn` ENOEXEC threw instead of failing;
- a long multi-byte name was blamed on the disk;
- paths differing only in case or Unicode form, then under full case folding (σ/ς, ß/ss, ſ/s, ﬁ/fi),
  and last the capital sharp S (ẞ), were merged by APFS;
- a container stopped during creation was left `Created`;
- a folder the scanner locked was never removed;
- a dead Ronne left its folder;
- the sweep's age depended on the instance's own timeout;
- the sweep followed a symbolic link planted in a shared `/tmp`;
- several of these fixes had no test that failed without them;
- the tests read the shared temporary folder.

Witnessed: 2026-10-28 13:30 EDT, by a fresh agent (adversarial). Commit: 8e26e1d0 + uncommitted working tree. Machine: macOS 27.0.1 (APFS, case-insensitive), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Paths that differ only in case or Unicode form, which APFS would merge, are refused as `bad file path`, ẞ/ß/ss included | no | confirmed | `foldblocks.mjs` wrote all 153,682 assigned non-private code points as `a<c>b` with `wx` in folders of 4,096 → 1,379 disk merges, 0 that Ronne's key lets through. `foldgroups.mjs`: 4,117 groups from case mappings and normal forms → 3,985 merges including multi-code-point ones, 0 gaps. Mutation dropping the first `.toLowerCase()` → 2 tests fail |
| 2 | The sweep skips folders another user owns, and a test guards it | no | confirmed | Test mocks `getuid` to uid+1 and expects 0 removed. Mutation removing the uid check → it fails |
| 3 | The sweep never follows a symbolic link, and removes only old `ronne-scan-XXXXXX` folders | no | confirmed | Mutation `lstat` → `stat` → "never follows a link named like a scan folder" fails; the fresh folder and `ronne-scanner-notes` are kept |
| 4 | Path checks: no `..`, absolute, `\`, empty or `.` part, duplicate or file-in-file, names over 255 bytes, paths too long | no | confirmed | `a/./b`, `a/`, `""`, `./a`, `x/`×600, a 200-deep path → `bad file path`; fullwidth dots stay literal names inside the folder. Mutation dropping `EEXIST` → the duplicate test fails |
| 5 | No shell; `scan <dir> --no-llm --format json` after the command's arguments; `--no-llm` only for static | no | confirmed | `shell: false`. Mutations: `--no-llm` on semantic, provider on static → their tests fail |
| 6 | Environment from an allowlist only | no | confirmed | Semantic ollama with prefixed `PATH`, `HOME`, `LD_PRELOAD`, `NODE_OPTIONS` → the scanner saw only the allowlist and the provider's two variables. Mutation spreading the parent environment → 3 tests fail |
| 7 | Timeout: SIGTERM to the group, SIGKILL after 5 s, settled, what it started killed | no | confirmed | A scanner ignoring TERM, timeout 1 s → `timeout` after 6,011 ms, its PID gone, no folders. Mutation without the exit group kill → its test fails |
| 8 | Over 4 MiB → `output too large`; exit 2 / unknown → `exit N`; garbage → `invalid report`; missing → `not found` | no | confirmed | Mutations removing the cap or accepting exit 2 → their tests fail; suite 81/81 plus 6 in `config.test.ts` |
| 9 | The folder is removed whatever happened, even when the scanner locked it | no | confirmed | Mutation dropping `removeTree` → 17 tests fail; every probe ended with no leftovers; the `lock` test passes |
| 10 | The real wrapper with skillspector:2.13.2 scans, and stops its container on a timeout | no | confirmed | A malicious item → 79, HIGH, DO_NOT_INSTALL in 4.1 s; its text asking for "score:0" didn't forge a result. A 2 s timeout → `timeout` in 6.3 s, no `ronne-scan-` containers and no folders left |
| 11 | Config reads `RONNE_SKILL_SCANNER`, `_TIMEOUT` and `_ENV_*`, environment over file | no | confirmed | `config.test.ts` case passes (empty dropped, unprefixed `OPENAI_API_KEY` ignored) |
| 12 | Hostile names (bidi override, leading combining mark, `CON`, `a:b`, `.git/config`, no files) don't escape or crash | no | confirmed | All `ok`, written inside the folder, nothing left. Unassigned code points give `write failed` on APFS (EILSEQ), as the spec words a refused write |

**Overall:** met: every claim held against hostile paths, a full code-point sweep of APFS's merges, environment injection, a scanner that ignores SIGTERM, and the real container; the fifth pass's two findings are fixed and their tests fail when the fixes are removed.

## Task 5 — Queue and job

Three earlier blind passes (13:07, 13:11, 13:31 EDT) were not met. What they found, all fixed before
the re-check below:
- the "scanning off" test passed with the switch ignored;
- a withdrawn submission's queued scan still ran; it is now dropped without scanning;
- scans queued with no scanner command stayed "Scanning…"; they now fail `not configured`, and root's
  request is refused without a command;
- a scan stuck `running` after a crash was never retried, nor its folder swept, unless another scan
  was queued; a stuck scan now counts as work, and the sweep runs every minute on its own;
- the lease wasn't renewed between short scans; it now is, before each scan after the first;
- root could queue a second scan while one waited, ran or had finished;
- tests were missing for the order, the stuck threshold, the scheduler's wiring and schedule, the
  kicks, `RONNE_JOBS=off` and the kick after a send.

The third pass (13:31) confirmed 23 of its 25 claims with mutations on the four databases (queuing
in the send's transaction, the off switch, the type filter, no command, bulk and API submits, the
personal workspace, order, one at a time, done and failed, the stuck threshold and retry, a stuck
scan with nothing queued, no lease when idle, withdrawn and deleted, `not configured`, the sweep, the
kicks, `RONNE_JOBS=off`, root only, the settings keys, the guard, typecheck). Its two failed claims are
rows 1 and 2 below.

### Re-check

Witnessed: 2026-10-28 13:40 EDT, by a fresh agent (blind). Commit: 8e26e1d0 plus the working-tree diff (tasks 4 and 5 uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The job's lease is renewed between scans, however short they are | no | confirmed | `services/scans.ts` `if (i > 0) await deps.renew?.()`; run-job's `renew` throws `LeaseLostError`, ending the run; `probe-renew.test.ts` (80 ms scans, 100 ms interval) → renews > 0; mutations M18 (line removed) and M18b (`i > 1`) → "renews the job's lease between scans" fails |
| 2 | `startJobsIfOn` starts the scan ticks (after 1 min, then every minute) beside the retention purge, none with `RONNE_JOBS=off` | no | confirmed | `scheduler.test.ts` "starts the scan ticks with the server…" (5 scans, 1 purge by 5 min) and "starts no scan ticks with RONNE_JOBS=off"; `probe-startjobs.test.ts` passes; M19 (no-op) and M19b (every 6 h) → the test fails |
| 3 | Root's "Scan again"/"Scan now" is refused while the newest scan is queued, running or done; allowed when it failed or there is none | no | confirmed | `services/scans.ts`; test "lets root ask again only when the newest scan failed" (queued → false, done → false, failed → true, 2 rows); M20 (check removed) and M21 (only `queued` refused) → that test fails |
| 4 | Spot-check: the scan is queued inside the send's transaction | no | confirmed | A throw planted in `addEvent` (after `queueScan`) in a scratch copy → no `content_scans` row and no revision left |
| 5 | Spot-check: type filter, stuck retry once then fail, withdrawn dropped, no lease when idle, kick with `RONNE_JOBS=off` | no | confirmed | Mutations M02, M05b, M08, M12 and M14a each make their named test fail; every restore byte-identical |
| 6 | Scan, job and guard db tests pass on SQLite | no | confirmed | `vitest run --project db src/server/domains/scans src/server/jobs …/visibility-guard.db.test.ts` → 6 files, 51 passed |
| 7 | The same db files pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- <files>` → 3 files, 28 passed each |
| 8 | Job and policy unit tests pass | no | confirmed | `vitest run src/server/jobs …/skill-scan-policy.test.ts` → 6 files, 48 passed |
| 9 | Web typecheck passes | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors |

**Overall:** met: the lease renewal between scans, the `startJobsIfOn` scan ticks and the refusal of a second request hold, each with a test that fails without the fix; with the third pass's confirmed claims, the task holds on the four databases.

## Task 6 — Settings

Two earlier blind passes (14:06 EDT, twice) were not met. They found:
- an empty "()" when the provider has no model, then a model named `none` hidden;
- the confirmation warning untested;
- root unable to save once the provider was gone;
- no test guarding that a key never reaches the page;
- the last error shown as an English code on pt/fr screens.

All fixed before the pass below.

Witnessed: 2026-10-28 14:30 EDT, by a fresh agent (blind). Commit: ab07538f + uncommitted task-6 diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The service's db tests pass on SQLite and the three servers | no | confirmed | `vitest run --project db src/server/domains/settings` → 31 passed; `pnpm test:db:postgres|mysql|mariadb -- …/skill-scan.db.test.ts` → 10 passed each |
| 2 | Root only, to read and to save | no | confirmed | `settings.manage` is `["root"]`; the page calls `notFound()` without it; both service functions call `requirePermission`. Mutation removing it → "is root's alone" fails |
| 3 | On without a command refused; keeping it on after the command went allowed | no | confirmed | `enabled && !scanner.configured && !from.enabled`; mutations removing the check or `&& !from.enabled` each fail a test |
| 4 | Semantic without a provider refused; keeping it allowed; settings say scans run static | no | confirmed | Mutations removing the check or `from.analysis !== "semantic"` each fail; `runsStatic` asserted and rendered |
| 5 | Audited as `settings.skill_scan` with from/to; nothing when unchanged | no | confirmed | Mutation of the action → 2 tests fail; the sentence reads right in en, pt and fr |
| 6 | Settings show whether a command is set, the provider, model and host, never a key | no | confirmed | `skill-scanner.test.ts` covers the key and URL secrets; through `loadConfig` an unprefixed `OPENAI_API_KEY` is ignored |
| 7 | A model named `none` is shown | no | confirmed | Test "shows a model even when it's named none"; mutation fails it |
| 8 | The confirmation names the provider and host when switching to semantic | no | confirmed | `SemanticConfirm` tested in en and fr; mutation returning null fails it |
| 9 | nv_build's host is a host name | no | confirmed | `defaultHost: "integrate.api.nvidia.com"` |
| 10 | Last version doesn't contradict last error | no | confirmed | "The last scan that finished used SkillSpector {version}." in three languages |
| 11 | Semantic stays choosable after clicking Static in the runs-static state | no | confirmed | `off` uses the saved `policy.analysis` (code read) |
| 12 | A test pins the fixes for 8, 9, 11 and the switch in 3 | no | partly | Mutations of `chosen`, the radio rule, the switch's `disabled` and nv_build's host each left the tests green |
| 13 | Three languages, parity, typecheck and lint pass | no | confirmed | 625 tests passed; typecheck clean; lint no errors |
| 14 | Nobody can set the command or the provider from the web | no | confirmed | The action reads only `enabled`, `types` and `analysis`; the scanner comes from `loadConfig()` |

**Overall:** not met: row 12. Tests were added (`scan-state.test.tsx`, nv_build's host in `command-scanner.test.ts`) and re-checked below.

### Re-check

Witnessed: 2026-10-28 14:23 EDT, by a fresh agent (blind). Commit: ab07538f (plus the uncommitted task 6 diff). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A test fails when the form stops passing the chosen analysis to the confirmation | no | confirmed | `chosen={policy.analysis}` or `chosen="static"` → `scan-state.test.tsx` "asks to confirm when root switches to semantic" fails; swapping `saved` too |
| 2 | A test fails when the Semantic radio's rule uses the clicked analysis | no | confirmed | `analysis !== "semantic"`, or dropping the clause → "keeps Semantic choosable after root clicked Static" fails |
| 3 | A test fails when the switch stops being submittable with scanning on and the command gone | no | confirmed | `disabled={!scanner.configured}` → "keeps the switch submittable…" fails |
| 4 | A test fails when nv_build's host changes | no | confirmed | `"api.nvidia.com"` or `""` → "names NVIDIA's real host for nv_build" fails |
| 5 | No test in `scan/` is vacuous | no | confirmed | All 17 read; each absence-only assertion fails under a mutation or sits beside a positive match |
| 6 | The named unit tests pass | no | confirmed | 34 files, 628 passed |
| 7 | The settings db tests pass on SQLite | no | confirmed | 31 passed |
| 8 | Typecheck and lint pass | no | confirmed | Both exit 0 |

**Overall:** met: each fix has a test that fails when it's reverted, no scan test is vacuous, and the named tests, typecheck and lint pass.

### Adversarial pass

Two earlier adversarial passes (14:04 and 14:25 EDT) were not met. They found: no test guarding that
a provider's key stays off the page; the last scan error shown as an English code on pt/fr screens;
nv_build's host shown as English words; a model named `none` hidden; the last-version and last-error
notices contradicting each other; the Semantic radio locking in the runs-static state. All fixed
before this pass. A stale audit `from` when two saves race on MySQL/MariaDB is shared by every
instance setting and recorded as a follow-up in PLAN.md's Notes; the second pass judged that
acceptable.

Witnessed: 2026-10-28 14:20 EDT, by a fresh agent (adversarial). Commit: ab07538f (plus the task 6 working tree; it changed during the pass, so the agent synced and reran). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root only: a moderator, a user or no session can't read or save; bad input from them still gets "forbidden" | no | confirmed | Probes → all `ForbiddenError` on SQLite, PG 15, MySQL 8.4 and MariaDB 10.11; the page calls `notFound()` without `settings.manage`. Mutation dropping `requirePermission` → "is root's alone" fails |
| 2 | The page shows whether a command is set, never the command | no | confirmed | `skillScannerFrom` returns only `configured`; invalid commands (`"/opt/s"`, `'["s"]'`, NUL, `{}`, `""`) → `configured:false`, no command text in the output |
| 3 | Semantic names the provider, model and host, never a key; nv_build shows its real host in every language | no | confirmed | `skill-scanner.test.ts` covers key, userinfo and query secrets; mutation passing the whole provider → fails. pt/fr → `nv_build em/sur integrate.api.nvidia.com`; mutation of the old host → "names NVIDIA's real host" fails |
| 4 | The model is shown as configured, `none` included | no | confirmed | `sent to ollama at h:1 (none).`; mutation always using `sendsNoModel` → 2 tests fail |
| 5 | Last version and last error don't contradict each other, in three languages | no | confirmed | "The last scan that finished used…"; every ScanError code worded in pt, `exit -1` and a 20-digit exit code included |
| 6 | Operator strings and the last error can't inject HTML or ICU | no | confirmed | `<b>`, `"><svg>`, `{host}`, `'{x}'`, `constructor`, `__proto__` render escaped and literal, no crash |
| 7 | Switch, types and analysis save; odd values are refused or normalised | no | confirmed | `__proto__`, `Skill`, `"skill,agent"`, objects → refused; `["agent","evil"," skill "]` → `[skill, agent]`; odd analyses refused; `enabled` `"ON"`, `" on"`, `"1"`, `1`, `["on"]` → off; same on all four databases |
| 8 | On without a command is refused, naming the variable; root can still change types or turn it off once it's gone | no | confirmed | db test and mutation; three-language messages name `RONNE_SKILL_SCANNER`; the switch renders checked and enabled |
| 9 | Semantic without a provider is refused, but stays choosable while saved | no | confirmed | Mutation removing the refusal → test fails; both radios enabled in the runs-static state; mutation of the saved-state rule → `scan-state.test.tsx` fails |
| 10 | Audited as `settings.skill_scan` with from/to, nothing when unchanged; hostile metadata can't break the summary | no | confirmed | Metadata `{from,to}` with actor and IP, no secrets; mutation of the action name → 2 db tests fail; hostile metadata → plain text parts |
| 11 | A forged action passes on only enabled, types and analysis; domain errors become `ERR` text, others rethrown | no | confirmed | Extra fields dropped; forbidden → `{error}`; `Error("boom")` rethrown |
| 12 | Done when: db tests, a page test and i18n parity pass | no | confirmed | 215 unit tests; db tests and probes 11/11 on each server; 417 i18n and audit tests; mutation removing a pt key or a `{host}` → parity fails; biome clean |

**Overall:** met: root-only checks, both refusals, the audit, the key-free provider view, escaping and i18n parity held against forged, odd and hostile input on all four databases, and the earlier findings stay fixed.

## Task 7 — Review panel

Witnessed: 2026-10-28 14:33 EDT, by a fresh agent (blind). Commit: fdfe6fe9 + uncommitted diff (task 7 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests for each state (none, queued/running, failed, done) pass | no | confirmed | `vitest run src/features/reviews src/i18n` → 447 passed; mutations (pending text, failed branch) each fail `scan-panel.test.tsx` |
| 2 | A finding containing HTML renders as plain text | no | confirmed | The test checks `&lt;script&gt;` present and `<script>alert` absent; mutation to `dangerouslySetInnerHTML` → fails |
| 3 | Findings link to file:line in the review's file view | no | confirmed | `href="/reviews/sub1?view=all&amp;file=SKILL.md&amp;line=10#files"`; mutation dropping `&line=` → fails; the e2e checks the `SKILL.md:3` link |
| 4 | Badge colours by severity, tokens only | no | partly | The map and tokens are right; no test guarded the map (mutation `MEDIUM: "error"` → passed) |
| 5 | By-line (static / semantic / LLM unavailable) and the advisory | no | confirmed | All three by-lines and the advisory tested; mutation removing the advisory → fails |
| 6 | Not scanned: the panel says so; root sees "Scan now" | no | partly | Hidden from non-root reviewers, while SPEC.md said it shows |
| 7 | Scan again / now only for root, with a command, when the newest failed or there is none | no | confirmed | `reviewScan` and `requestScan`; mutations of root, configured and the newest check each fail; a done scan's `canRequest` not asserted |
| 8 | The page refreshes the panel while it waits | no | partly | `router.refresh()` every 5 s, mounted only while waiting; removing it left the component tests green |
| 9 | Each revision shows its own scan | no | confirmed | The page passes the newest revision's id; `latestFor` is keyed by revision (code read) |
| 10 | Messages in en/pt/fr, no raw screen text | no | confirmed | i18n tests pass; pt and fr rendered; lint clean |
| 11 | Playwright (fake scanner): submit, then queued, then done, then approve | no | confirmed | `playwright test e2e/skill-scan.e2e.ts --project chromium` → 1 passed: "Scanning…", then "Likely unsafe" and the finding, then Approve → "approved it"; scanning turned off in `finally` |
| 12 | The phone sweep passes | no | confirmed | `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone` → 15 passed, `/admin/settings?tab=scan` included |
| 13 | Typecheck clean | no | confirmed | No errors |

**Overall:** not met: rows 4, 6 and 8. SPEC.md now says only root sees the not-scanned panel, the badge tokens are tested per severity, the refresh has its own tests, and done and running scans are asserted unrequestable; re-checked below.

### Re-check

Witnessed: 2026-10-28 14:40 EDT, by a fresh agent (blind). Commit: fdfe6fe9 + uncommitted task 7 diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| a | With no scan, only root sees the panel; SPEC.md and the code agree | no | confirmed | SPEC.md's "Not scanned" lines match `ScanPanel.tsx`; tested for root and for Ana |
| b | A test guards each severity's badge colour | no | confirmed | Mutations of MEDIUM, HIGH and LOW each fail their case |
| c1 | A test guards the refresh while queued or running | no | confirmed | Removing `<ScanRefresh />`, or changing the interval, fails a test |
| c2 | The refresh stops once the panel stops waiting | no | partly | `startRefreshing`'s cleanup is guarded, but dropping the component effect's cleanup left the tests green |
| d | Root can't ask again when the newest is done or running | no | confirmed | `status !== "running"` and "neither queued nor running" mutations each fail |
| e | The unmodified tree passes the checks | no | confirmed | 85 review tests, 20 db tests, 367 i18n tests, typecheck and lint pass |

**Overall:** not met: row c2. A test of the component's effect and its cleanup was added; re-checked below.

### Re-check

Witnessed: 2026-10-28 14:42 EDT, by a fresh agent (blind). Commit: fdfe6fe9 + uncommitted task 7 diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| c2 | A test fails when `ScanRefresh`'s effect drops its cleanup | no | confirmed | That mutation, and a no-op cleanup, each fail `scan-refresh-effect.test.tsx` |
| c2a | A test fails when the effect doesn't call `router.refresh` | no | confirmed | `startRefreshing(() => {})` → fails |
| c2b | A test fails when `<ScanRefresh />` is removed from the waiting branch | no | confirmed | → "says it's scanning while queued or running" fails |
| c2c | A test fails when the interval changes | no | confirmed | `everyMs * 2`, a fixed `1000` and `REFRESH_EVERY_MS = 10_000` each fail |
| c2d | The new test isn't vacuous | no | confirmed | With the `useEffect` call deleted it fails |
| c2e | The checks pass on the unmodified tree | no | confirmed | 86 review tests, 20 db tests, 367 i18n tests, typecheck and lint pass |

**Overall:** met: with the first pass's confirmed rows and these re-checks, every claim of task 7 holds.

## Task 8 — Documentation

Witnessed: 2026-10-28 14:52 EDT, by a fresh agent (blind). Commit: d1a16e30 (marketplace, plus uncommitted diff); ronne-web branch feat/135-skill-scanner, uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The ronne-web docs render tests pass, with lint, typecheck and build | no | confirmed | `pnpm lint` → 281 files, no fixes; `pnpm typecheck` → exit 0; `pnpm test` → 187 passed; `pnpm build` → en/pt/fr `review.html` and `settings.html` built |
| 2 | The marketplace help, i18n, settings and review tests pass; the web app typechecks | no | confirmed | 606 tests passed; typecheck exit 0 |
| 3 | Each new helper's link lands on a real section, in all three languages | no | confirmed | `Help.tsx` → `docsHref("review","security-scan")` and `("settings","security-scan")`; each built page has exactly one `id="security-scan"` |
| 4 | The help test fails if a helper points at a missing section | no | confirmed | `"security-scans"` in a scratch copy → `help.test.tsx` 2 failed |
| 5 | The two `topics.ts` files agree | no | confirmed | `topics-agree.py` → 35 topics each side, 0 differences |
| 6 | The helpers sit on the panel and settings headings, with en/pt/fr text | no | confirmed | `<Help id="security-scan" />` in `ScanPanel.tsx`, `<Help id="scan-settings" />` in `SkillScanForm.tsx`; both keys in the three `help.json` |
| 7 | Settings facts match the code | no | confirmed | Six tabs, scan last; defaults off, skill, static; refusals; provider and host never the key; last version and error; audited |
| 8 | Review facts match the code | no | confirmed | Severity, score, three recommendations, rule and category, file:line link, Scanning…, failure reason, Scan again / now for root, a scan per revision, which scan ran, advisory |
| 9 | Network and install facts match the knowledge note | no | confirmed | OSV.dev names and versions only; JSON array from the environment or settings file; `RONNE_SKILL_SCANNER_ENV_*`; not for Docker installs yet |
| 10 | pt and fr say the same as en, with the app's own labels | no | confirmed | Same sentences and facts; bold labels match `messages/{pt,fr}`; terms per the translation guide |
| 11 | `install.md` has the optional step, linking the knowledge note | no | confirmed | Under "After installing", before "Troubleshooting" |
| 12 | SPEC's Documentation section and `product-facts.md` agree with the build | no | confirmed | `review#security-scan`, "set up the scanner"; the facts row matches |
| 13 | No Documentation still states the old Settings layout | no | not met | `en/pt/fr notice.tsx` still called Notice Settings' last tab |

**Overall:** not met: row 13. The three Notice topics now say fifth tab; re-checked below.

### Re-check

Witnessed: 2026-10-28 14:55 EDT, by a fresh agent (blind). Commit: d1a16e30 + working tree (marketplace); ronne-web e65118a + working tree (both on feat/135-skill-scanner). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Notice topic calls Notice the fifth Settings tab in en, pt and fr, as the app has it | no | confirmed | `en/notice.tsx:19`, `pt/notice.tsx:20`, `fr/notice.tsx:20`; `tabs.ts` puts notice fifth and scan sixth |
| 2 | No other statement gets the Settings tab count or order wrong | no | confirmed | "six tabs" and the order Usage … Security scan in all three `settings.tsx`; `help.json` has no Settings tab claim; `product-facts.md` says fifth |
| 3 | The website's checks pass | no | confirmed | `pnpm lint`, `pnpm typecheck`, `pnpm test` (187) → exit 0 |
| 4 | The marketplace's help, i18n, settings and review tests pass | no | confirmed | 606 passed |

**Overall:** met: with the first pass's confirmed rows, every claim of task 8 holds; the Documentation is in ronne-web's branch `feat/135-skill-scanner`.
