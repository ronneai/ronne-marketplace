# 199 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../../knowledge/state-witness.md).

## Task 1 — The spec and the domains

Witnessed: 2026-11-22 17:11 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + working tree (`docs/features/README.md`, untracked `docs/features/199-features-by-domain/`, untracked `docs/features/domains.json`). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `domains.json` is valid JSON with a domain list (each with a line) and a feature map | no | confirmed | `node scratchpad/199-t1-blind/probe.mjs` → top keys `domains`, `features`; 16 domains, none with an empty or non-string line |
| 2 | Every `docs/features/NNN-slug/` folder ID is in `domains.json` | no | confirmed | probe → 173 folders (199 included), 173 entries, `missing: []`, `extra: []` |
| 3 | Each ID appears exactly once (no duplicate keys, which `JSON.parse` would hide) | no | confirmed | probe scans the raw text for `"NNN":` keys → 173 keys, `dup: []`; no two folders share an ID (`dupFolders: []`) |
| 4 | Every feature's domain is a listed domain | no | confirmed | probe → `badDom: []`; every listed domain is also used (`unused: []`) |
| 5 | Owner's change: 052 is under `items` | no | confirmed | probe → `052 items` (`052-bulk-submit`) |
| 6 | Owner's change: `usage` and `feedback` are separate domains, 046 and 047 in usage, 127 in feedback, no combined usage-feedback domain | no | confirmed | `domains.json` has `"usage"` and `"feedback"`, each with its own line; probe → `046 usage`, `047 usage`, `127 feedback`, `combined: []`; counts usage 2, feedback 1 |
| 7 | The owner agreed the mapping | no | confirmed | The request quotes the owner (2026-11-22): "052 to items, keep usage and feedback separated, each has a domain, go ahead". Both changes are in the file (rows 5 and 6). I can't check the conversation itself; the quote is the only source. |
| 8 | SPEC.md follows `_template/SPEC.md` | no | confirmed | `grep '^#'` → same headings in the same order (title, Goal, Scope, Behaviour, Edge cases, Documentation, Acceptance criteria, Open questions); line 3 has the Milestone, Depends on, Design and Contracts header |
| 9 | PLAN.md follows `_template/PLAN.md` | no | confirmed | `199-features-by-domain/PLAN.md:1-12` → the template's title, Spec link and boilerplate paragraph word for word, then `## Tasks` and `## Notes` (line 46); task 1 has a *Done when* |
| 10 | SPEC Scope "In", first bullet, names `domains.json` as the list of domains, a line on each, and every feature's domain | no | confirmed | `SPEC.md` Scope "In", bullet 1 → "the list of domains, a line on each, and the domain of every feature ID", linking `../domains.json` |
| 11 | `docs/features/README.md` has a 199 row | no | confirmed | `git diff docs/features/README.md` → one row added: `\| [199](./199-features-by-domain/SPEC.md) \| Features by domain: … \| 187 \| in progress \|`; `pnpm run docs:check` → exit 0 |

**Overall:** met: every one of the 173 feature folder IDs is in `domains.json` exactly once, under one of 16 listed domains, and the owner's two changes (052 under items; usage and feedback as separate domains) are in the file.

## Task 2 — The witness check under domains

Witnessed: 2026-11-22 17:21 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `witness.js` finds feature folders one level down, under their domain | no | confirmed | `witness.js` `featureFolders` reads `docs/features/<[a-z-]+>/<NNN->`. Probe `scratchpad/199-t23-blind/count.mjs` on the real tree → 0 errors, 173 folders. Their names diffed against `git archive HEAD`'s top-level folders → identical, plus the new `199-features-by-domain`. `node packages/repo-tools/src/check-witness.js` → exit 0 |
| 2 | A feature folder at the top of `docs/features` is an error | no | confirmed | Scratch copy, `cp -R identity/191-… docs/features/` → `docs/features/191-account-creation-rules: a feature folder goes under its domain …`. Removing the `top.map` errors in the copy → the test "refuses a feature folder left at the top" fails (1 failed / 30) |
| 3 | One ID in two folders is an error | no | confirmed | Scratch copy, `cp -R identity/191-… review/191-dup` → `feature 191 has more than one folder: docs/features/identity/191-account-creation-rules, docs/features/review/191-dup`. Changing `where.length > 1` to `false` → the test "refuses one ID in two folders" fails |
| 4 | `docs/issues` is read as before | no | confirmed | Scratch copy, deleted `docs/issues/143-dependency-menu-range/WITNESS.md` → 4 errors `PLAN.md:10…30: task N is ticked but there's no WITNESS.md` |
| 5 | The fixtures that name feature paths are updated (`witness.test.js`, `pre-commit.test.js`, `ci-scope.test.js`) | no | confirmed | `git diff`: `pre-commit.test.js:13` → `docs/features/platform/002-db-layer/…`; `ci-scope.test.js:13` → `docs/features/cli-api/095-…`; `witness.test.js` uses `review/098-x`, `items/097-old`, `review/098-new` and skips `milestones/` and `_template/` |
| 6 | The repo-tools tests pass, with new cases for both errors | no | confirmed | `npx vitest run` in `packages/repo-tools` → 24 files, 243 passed. New cases at `witness.test.js:183`, `:195`, `:203` |

**Overall:** met: folders are found under their domain, both errors fire on real trees and in the tests, and issues are still checked.

## Task 3 — The index check

Witnessed: 2026-11-22 17:21 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the tree | no | confirmed | `node packages/repo-tools/src/check-docs-index.js` → exit 0. Same on a scratch copy of all tracked and untracked files (`git init`, no commits) → exit 0 |
| 2 | It fails on a missing index row | no | confirmed | Scratch: deleted the `[191]` row from `README.md` → `feature 191 has no row in docs/features/README.md`. Mutating `mine.length === 0` → the test at `features-index.test.js:58` fails |
| 3 | It fails on a missing milestone row | no | confirmed | Scratch: deleted the `[191]` row from `M32-open-sign-up-and-email.md` → `feature 191 has no row in a file in docs/features/milestones/` |
| 4 | It fails on a status that differs between the index and the milestone file | no | confirmed | Scratch: index `[191]` set to `in progress` → `feature 191 is "in progress" in docs/features/README.md:277 but "done (the Documentation …)" in …M32…:19`. Mutating the comparison → the test at `:85` fails. The milestone's `(note)` is cut before comparing; a note in the index is not, so the index must give the bare status |
| 5 | Both rows link to the real path | no | confirmed | Scratch: moved 191 to `review/` → `README.md:277: feature 191 links to docs/features/identity/191-…/SPEC.md, not docs/features/review/191-…/SPEC.md`, the same for `M32…:19`. The test at `:95` covers a wrong link and an unlinked row |
| 6 | It fails on a folder in the wrong domain (`domains.json`) | no | confirmed | Same move → `docs/features/review/191-account-creation-rules is under review, but docs/features/domains.json puts 191 under identity`. Mutating `listed !== domain` → the test at `:108` fails. Unknown domain, a folder with no entry, and an entry with no folder are tested at `:108` and `:122` |
| 7 | It fails on a relative link that doesn't resolve, for every relative link in `docs/**/*.md` | no | partly | Inline links work: `[x](./nope.md)` appended to `docs/knowledge/i18n.md` → `i18n.md:240: the link to ./nope.md lands nowhere`, and mutating the `exists` filter → the test at `:176` fails. But three gaps against the spec's wording: (a) every `WITNESS.md` page is skipped, and so is any link to a `WITNESS.md`: `[w](../features/identity/999-ghost/WITNESS.md)` → no error (`features-index.js` `checkLinks`, which the SPEC doesn't mention). (b) Reference-style links (`[r]: ./nope-ref.md`) → no error; none are relative in the docs today. (c) `~~~` fences aren't treated as code: a link inside one is reported (false positive) |
| 8 | The repo-tools tests pass, with a case for each failure the spec lists | no | confirmed | `vitest run src/witness.test.js src/features-index.test.js` → 44 passed. Each of the 5 failures has a case, and each case fails under its mutation |

**Overall:** not met: the list checks hold, but the link check skips `WITNESS.md` pages and links to them, and doesn't read reference-style links, which the spec's "every relative link in `docs/**/*.md`" doesn't allow.

### Re-check 1

Witnessed: 2026-11-22 17:28 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the tree | no | confirmed | `node packages/repo-tools/src/check-docs-index.js` in the repo → exit 0; same in a fresh scratch copy of all tracked and untracked files → exit 0 |
| 7a | A broken reference definition fails | no | confirmed | `recheck.sh`: `[r]: ./nope-ref.md` → `i18n.md:241: the link to ./nope-ref.md lands nowhere`; `  [r2]: <./nope-ref2.md#x>` → reported too. Mutating `if (definition)` → the test "reads reference definitions…" fails |
| 7b | Links in code (fenced with three backticks, `~~~` or a longer fence) are skipped | no | confirmed | `~~~` fence with a broken link → exit 0; a four-backtick fence holding a three-backtick line and a broken link → exit 0. Removing `~{3,}`, or letting a shorter marker close the fence → the same test fails |
| 7c | Links in HTML comments are skipped | no | partly | A multi-line `<!--\n[x](./nope-comment.md)\n-->` → exit 0, and removing the comment branch fails the test. But `<!-- [x](./nope-1line.md) -->` on one line → `i18n.md:241: the link to ./nope-1line.md lands nowhere`, and `Text <!-- start\n[x](./nope-midcomment.md)\n-->` → reported (`features-index.js:162` only opens a comment on a line that starts with `<!--` and has no `-->`). No page has such a comment today, so these are false positives in waiting, not a hole |
| 7d | A `WITNESS.md` isn't read; a link to one is fine only while its folder exists | no | confirmed | A broken link appended to 191's `WITNESS.md` → exit 0; `[w](…/identity/191-account-creation-rules/WITNESS.md)` → exit 0; `[w](…/identity/999-ghost/WITNESS.md)` → `lands nowhere`. Both mutations (the exception off, `WITNESS.md` pages read) fail the test "names each link that lands nowhere, skipping WITNESS.md…" |
| 7e | Section anchors are checked against headings | no | confirmed | `../features/README.md#no-such-section` → `docs/features/README.md has no section #no-such-section`; `#index` and `../../CLAUDE.md#commands` → exit 0. Mutating `!anchorsOf(path).has(section)` → the test "names a link to a section the page doesn't have" fails |
| 7f | It covers `docs/**`, the root's pages, `.github` and `.claude` | no | confirmed | A broken link in `CONTRIBUTING.md`, `.github/pull_request_template.md` and `.claude/agents/state-witness.md` → each reported with `file:line` |
| 9 | docs:check names one ID in two folders | no | confirmed | 191 copied to `review/191-dup` → `feature 191 has more than one folder: docs/features/identity/191-account-creation-rules, docs/features/review/191-dup`. Mutating `folderOf.has(key)` → the test "fails on one ID in two folders, naming both" fails |
| 10 | Domain names are checked (lowercase letters, digits, `-`); witness.js accepts digits | no | confirmed | `"Bad_Name"` in `domains.json` → `"Bad_Name" isn't a domain name…`; `"web3-ui"` → exit 0. 191 moved to `web3-ui/` with its `WITNESS.md` removed → `witness:check` reports `web3-ui/191-…/PLAN.md:12: task 1 is ticked but there's no WITNESS.md`. Mutating `DOMAIN_NAME.test` → the test fails |
| 8 | The repo-tools tests pass, with a case for each failure the spec lists | no | confirmed | `vitest run src/witness.test.js src/features-index.test.js` → 50 passed. All 9 mutations in `mutate.sh` each fail exactly one test |

**Overall:** not met: everything holds except "outside HTML comments", which works only for a comment that opens a line and closes on a later line; a one-line comment, or one opened mid-line, is still read.

### Re-check 2

Witnessed: 2026-11-22 17:31 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the tree | no | confirmed | `node packages/repo-tools/src/check-docs-index.js` in the repo → exit 0. Scratch copy rebuilt from all tracked and untracked files (its `features-index.js` matches the tree byte for byte, `cmp`) → exit 0 |
| 7c | Links in HTML comments are skipped (one-line comments, comments opened mid-line, multi-line comments), and a link after the close is still read | no | confirmed | `recheck2.sh` on `docs/knowledge/i18n.md`: `<!-- [x](./nope-1line.md) -->` → exit 0. `Text <!-- start\n[x](./nope-midcomment.md)\n-->` → exit 0. `<!--\n[x](./nope-comment.md)\n-->` → exit 0. Still reported: `<!-- a --> [x](./nope-after1.md)`, `<!--\nhidden\n--> [x](./nope-after2.md)`, `[x](./nope-before.md) <!-- c`, `<!-- a -->[x](./nope-mid.md)<!-- b -->`. A `<!--` inside a fence doesn't open a comment. The test at `features-index.test.js:163` covers the one-line, mid-line and multi-line cases and the link after the close; three of four comment mutations fail it (the fourth, dropping the whole line where a comment opens, survives: no test has a link before `<!--`) |
| 8 | The repo-tools tests pass, with a case for each failure the spec lists | no | confirmed | `vitest run src/witness.test.js src/features-index.test.js` → 2 files, 50 passed. `mutate.sh`: 8 of its 9 mutations each fail exactly one test; the ninth no longer applies, and `mutate2.sh` replaces it with the 4 comment mutations above |

**Overall:** met: comments on one line, opened mid-line, or running over several lines are skipped, a link after `-->` or before `<!--` is still read, docs:check passes, and the 50 tests pass. Remarks: a `<!--` inside inline code opens a comment (no page has one today); no test has a link before `<!--` on the same line.

## Task 4 — The move

Witnessed: 2026-11-22 17:18 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + working tree (staged renames, unstaged link edits, untracked `docs/features/milestones/`, `features-index.js`, `features-index.test.js`, 199's `WITNESS.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Every feature folder sits under the domain `domains.json` gives it, none at the top level | no | confirmed | `ls docs/features \| grep -E '^[0-9]'` → nothing; `git ls-tree HEAD docs/features/` → 172 NNN folders; `find docs/features -mindepth 2 -maxdepth 2 -name '[0-9][0-9][0-9]-*'` → 173 (172 + 199); a probe comparing each folder with `domains.json` → 173 folders, 0 mismatches, 173 keys |
| 2 | Folders moved with `git mv`, files unchanged except for links | no | confirmed | `git diff --cached -M --name-status` → 430 `R100`, plus 3 `A` (domains.json and 199's two files); `git diff --word-diff=porcelain` on moved files → 1023 changed words, all link targets except 199's own PLAN tick and SPEC sizes |
| 3 | `git grep -nE "docs/features/[0-9]{3}-"` finds nothing | no | not met | It finds 2 lines: `packages/repo-tools/src/witness.test.js:198` (the `098-loose` fixture, which the test needs) and `docs/features/web-ui/122-settings-tabs/WITNESS.md:86` (old evidence `grep -rni axe docs/features/10[5-8]-*/ docs/features/122-*/`). Also: once 199's untracked `WITNESS.md` is committed, its line 12 (`docs/features/199-features-by-domain/`) will match too. Outside git: `docs/private/**` (untracked) still names old paths |
| 4 | Every relative link resolves after the move | no | partly | All file targets resolve: a probe (`links.mjs`) over 671 md files leaves only inline-code examples and template links written for the copied location, and `pnpm docs:check` → exit 0. But 8 section anchors point at headings the index no longer has (`grep -c '^### M' docs/features/README.md` → 0): `docs/MVP/MVP.md:837,962,1020,1022,1027,1030` (`../features/README.md#m14…`, `#m15…`, `#m16…`, `#m17…`, `#m22…`, `#m24…`) and `docs/features/workspaces/093-private-workspaces/SPEC.md:49`, `094-workspace-access-requests/SPEC.md:37` (`../../README.md#m13--workspaces`) |
| 5 | `i18n-review.js` and `.gitignore` follow `133-languages-signoff/review/` | no | confirmed | `.gitignore:34` → `docs/features/web-ui/133-languages-signoff/review/`; `packages/repo-tools/src/i18n-review.js:3,94` → `docs/features/web-ui/133-languages-signoff/review` |
| 6 | `pnpm witness:check` reports what it did before | no | confirmed | 4ca3e4a5 worktree → exit 0, 172 folders, 82 checked, 0 errors; now → exit 0, 173 folders, 83 checked (199 added), 0 errors (`count.mjs`). Mutation in a scratch copy: removing 191's `WITNESS.md` → `identity/191-account-creation-rules/PLAN.md:12: task 1 is ticked but there's no WITNESS.md`; a copy at the top level → `docs/features/142-search-index: a feature folder goes under its domain` |
| 7 | `git log --follow` on a moved `SPEC.md` shows its history | no | confirmed | Scratch clone at 4ca3e4a5, staged and unstaged patches applied and committed (309 renames detected): `git log --follow -- docs/features/identity/191-account-creation-rules/SPEC.md` → probe, 4ca3e4a5, 138207db; `catalogue/018-catalogue/SPEC.md` → back to a9aa53fb |

**Overall:** not met: the stale-path grep still finds 2 lines (3 once 199's WITNESS.md is committed), and 8 anchor links point at index sections that moved to `milestones/`.

### Re-check 1

Witnessed: 2026-11-22 17:28 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 3 | The stale-path grep finds nothing | no | confirmed | `git grep -nE "docs/features/[0-9]{3}-" -- ':!*.test.js' ':!*/WITNESS.md'` → no output, exit 1; with `--untracked` → no output |
| 4 | Every relative link resolves after the move, section anchors included | no | confirmed | `pnpm docs:check` → exit 0, and it now checks anchors (Task 3 row 7e). `MVP.md:962` → `../features/milestones/M15-privacy-and-data-lifecycle.md`; 093 and 094 → `../../milestones/M13-workspaces.md`. `links.mjs` → the same leftovers as before (inline-code examples, template links written for the copy) |
| 2 | Moved files unchanged except for links (re-checked for the new diff) | no | confirmed | `git diff --cached -M --name-status` → 430 `R100`, 3 `A`. A word-diff of the unstaged edits in moved folders, link changes left out, shows only `docs/features/NNN-…` paths rewritten to `<domain>/NNN-…`. The 093/094 diff is link depths and the two anchors |
| 6 | `pnpm witness:check` reports what it did before | no | confirmed | `count.mjs` → 173 folders, 83 checked, 0 errors, `checkAll` 0 (earlier pass: HEAD 172/82/0, plus 199) |

**Overall:** met: the stale-path grep is clean and every link and section anchor resolves. Rows 1, 5 and 7 of the first pass stand; the renames are the same 430.

## Task 5 — The milestone files and the short index

Witnessed: 2026-11-22 17:18 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + working tree (as above). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes | no | confirmed | `pnpm docs:check` → exit 0, no output. Mutations in a scratch clone: deleting row 016 from M03 → `feature 016 has no row in a file in docs/features/milestones/`; changing its status → `feature 016 is "done" in docs/features/README.md:104 but "planned" in …/M03-review-release.md:9` |
| 2 | The index is at most 30 KB | no | confirmed | `wc -c docs/features/README.md` → 26192. `docs:check` doesn't enforce the limit: the index padded to about 31 KB still passed |
| 3 | No milestone file is over about 15 KB | no | confirmed | `wc -c docs/features/milestones/*.md \| sort -n` → largest `README.md` 5289, `M13-workspaces.md` 5132 |
| 4 | Every row of HEAD's index is in exactly one milestone file, unchanged except for its link | no | confirmed | `rows.mjs` (links normalised) → 172 old rows, 173 milestone rows, 0 duplicates, 0 missing; the one apparent diff, row 121, changes only links (`./121…` → `../install/121…`, `../issues/222…` → `../../issues/222…`); the extra row is 199 |
| 5 | Each milestone file holds its introduction word for word | no | confirmed | `intro.mjs`: every prose line after `## Index` in HEAD's index is found in `milestones/*.md` or the new README → 140 lines, 0 missing |
| 6 | The README has how to use it, the domains, the milestone files and a short index (ID, linked title, domain, milestone, status) | no | partly | `docs/features/README.md:22,64,85` → How to use it, Domains (16 rows, from domains.json), Index (173 rows, e.g. `\| [001](platform/001-monorepo-scaffold/SPEC.md) \| … \| platform \| M0 \| done \|`; all links resolve). It doesn't list the milestone files itself (`grep -c 'milestones/M' README.md` → 0); it links to `milestones/README.md`, which lists all 36. The Milestone column is plain text |

**Overall:** not met: everything holds except that the index points to `milestones/README.md` instead of listing the milestone files itself (spec: "lists the domains and the milestone files"); the owner may judge the link enough.

### Re-check 1

Witnessed: 2026-11-22 17:28 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 6 | The README has how to use it, the domains, the milestone files and a short index | no | confirmed | `grep -n '^## ' docs/features/README.md` → How to use it (22), Domains (64), Milestones (85), Index (129). Every one of the 37 `milestones/*.md` files except `README.md` is linked from `README.md`. Minor: `- [Outside the milestones](./milestones/repository.md)` appears twice, at lines 113 and 127 |
| 1 | `pnpm docs:check` passes | no | confirmed | exit 0 (Task 3 row 1) |
| 2 | The index is at most 30 KB | no | confirmed | `wc -c docs/features/README.md` → 28956 |
| 3 | No milestone file is over about 15 KB | no | confirmed | largest: `milestones/README.md` 5289, `M13-workspaces.md` 5132 |
| 4 | Every row of today's index is in exactly one milestone file, unchanged except for its link | no | confirmed | `rows.mjs` → 172 old rows, 173 milestone rows, 0 duplicates; the one "missing" and "extra" pair is 121, which differs only in its links, as in the first pass. The extra row is 199 |
| 5 | Each milestone file holds its introduction word for word | no | confirmed | `intro.mjs` → 140 lines, 0 missing |

**Overall:** met: the index lists the domains and every milestone file itself, within its size limit, and the rows and introductions match the old index.

## Task 6 — The rules and guides

Witnessed: 2026-11-22 17:18 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + working tree (as above). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | CLAUDE.md names the new layout, how a feature is filed and what to read | no | confirmed | `CLAUDE.md:17` → `<domain>/NNN-slug/…`, `domains.json`, `milestones/`, "Read the milestone's file, not the whole index; … `WITNESS.md` only to add or check a pass", rows in the index and the milestone file; line 18 → "set its status in the index and in its milestone's file" |
| 2 | CONTRIBUTING.md names the new layout | no | confirmed | `CONTRIBUTING.md:56` → "one folder per feature under its domain, the index, and one file per milestone"; `:65-66` → `docs/features/<domain>/NNN-slug/`, listed in the index and its milestone's file |
| 3 | `docs/knowledge/state-witness.md` says how a feature is filed and what to read | no | partly | `:127-128` gives only the checker's rule (`docs/features/<domain>/NNN-slug/`, fails on a top-level folder). Nothing on the index or milestone rows, or on what to read (`grep -n milestone` → only line 133, "Once a milestone") |
| 4 | The state witness agent names the new layout | no | not met | `git diff --stat -- .claude` → unchanged; `grep -n "features\|milestone\|domain" .claude/agents/state-witness.md` → only line 3, "one feature task in docs/features" |
| 5 | `_template/` says how a feature is filed | no | not met | `git diff docs/features/_template` → only link depths (`../../` → `../../../`, `../088-…` → `../../web-ui/088-…`); no file in it names `<domain>/`, `domains.json` or a milestone file |
| 6 | No file in the repository describes the old layout | no | not met | `docs/MVP/MVP.md:983` (decision log, Planning) → "One folder per feature, `docs/features/NNN-slug/` …; the index there replaces a separate milestone plan"; `CLAUDE.md:14` → "the whole roadmap is in `docs/features/README.md`" (it's now in `milestones/`); `MVP.md:783-784` → "the index there tracks their status" (now index and milestone files, mild) |

**Overall:** not met: the agent file and the templates are unchanged, the witness guide doesn't say how a feature is filed or what to read, and MVP.md's decision log still describes the old layout.

### Re-check 1

Witnessed: 2026-11-22 17:28 EST, by a fresh agent (blind). Commit: 4ca3e4a5 + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 3 | `docs/knowledge/state-witness.md` says how a feature is filed and what to read | no | confirmed | `state-witness.md:11-17` ("Where things are (199)") → `docs/features/<domain>/NNN-slug/`, `domains.json`, a row in the index and one in the milestone file; read `SPEC.md` and `PLAN.md`, and `WITNESS.md` only for the task's earlier passes, not the whole index; ticking the last task sets the status in both rows |
| 4 | The state witness agent names the new layout | no | confirmed | `git diff .claude/agents/state-witness.md` → a new paragraph: `docs/features/<domain>/NNN-slug/`, `domains.json`, the rows in the index and the milestone file, read the milestone's file not the whole index, `WITNESS.md` only for earlier passes |
| 5 | `_template/` says how a feature is filed | no | confirmed | New `docs/features/_template/README.md` → copy into `docs/features/<domain>/NNN-slug/`, next free ID, a domain from `domains.json`, two rows (index and milestone file, the index's status without the note), links written three folders down from `docs/` |
| 6 | No file in the repository describes the old layout | no | confirmed | `MVP.md:985` (Planning) → `docs/features/<domain>/NNN-slug/` … "was one flat folder", milestone files and a short index; `MVP.md:783-786` → filed under its domain, the index and milestone files track status; `CLAUDE.md:14` → "the whole roadmap is in `docs/features/milestones/`". `git grep --untracked` for `features/README.md`, `the index`, `milestone plan`, `docs/features/NNN` (feature folders, `WITNESS.md`, tests and `docs/private` left out) → every hit describes the new layout or only links to the index |
| 1, 2 | CLAUDE.md and CONTRIBUTING.md name the new layout (re-read after the edits) | no | confirmed | `CLAUDE.md:17`; `CONTRIBUTING.md:56,64-66` → `docs/features/<domain>/NNN-slug/`, the index and the milestone file |

**Overall:** met: the agent file, the template, the witness guide, CLAUDE.md, CONTRIBUTING.md and MVP.md all describe the domain folders, the milestone files and the short index, and no file found still describes the flat layout.
