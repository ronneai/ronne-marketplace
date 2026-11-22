# 187 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../../knowledge/state-witness.md).

## Task 1 — The knowledge index and the docs check

Witnessed: 2026-11-18 09:50 EST, by a fresh agent (blind). Commit: 0e61bcd4 (plus the uncommitted working tree on feat/187-contributor-docs). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:check` exists as a root script and passes on the tree | no | confirmed | `package.json` `"docs:check": "node packages/repo-tools/src/check-docs-index.js"`; `pnpm docs:check` → exit 0, no output |
| 2 | `pnpm --filter @ronneai/repo-tools test` passes, with tests for the rule | no | confirmed | → 21 files, 188 tests passed; `docs-index.test.js` has 5 tests (listedNotes, unlisted note, listed-but-missing, the real repository) |
| 3 | `docs/knowledge/README.md` lists every note, one entry each, and lists nothing else | no | confirmed | 38 `- [` entries, 38 `.md` files other than README in `docs/knowledge/`, no duplicate links, every entry's text matches its target. The check itself doesn't enforce one entry per note: duplicates, or a link only in the intro text, also pass |
| 4 | Adding an unlisted note makes the check fail | no | confirmed | Scratch copy: `echo "# x" > docs/knowledge/new-note.md; node …/check-docs-index.js` → exit 1, "docs/knowledge/new-note.md isn't listed in docs/knowledge/README.md" |
| 5 | Listing a missing note makes the check fail | no | confirmed | Scratch copy: appended `- [ghost.md](ghost.md)` → exit 1, "README.md lists ghost.md, which isn't a note there" |
| 6 | The README itself isn't counted as a note | no | confirmed | `docs-index.js` `checkAll` filters `name !== "README.md"`; the real tree passes without a README entry |
| 7 | The tests cover both halves of the rule | no | confirmed | Mutation in scratch: removing the listed-but-missing branch → "fails on a listed file that isn't a note" fails (1 failed / 4 passed); `!listed.has(note)` → `false` → "fails on a note that isn't listed" fails. Restored; `cmp` with the repo's file → identical |
| 8 | The pre-commit hook runs it next to the witness check, before the documentation-only skip | no | confirmed | `run-pre-commit.js:16-27` loops over check-witness.js and check-docs-index.js before `planChecks`. Scratch git repo with `core.hooksPath=.githooks`: a docs-only commit of an unlisted note → "✗ pre-commit: the docs check failed, so the commit was stopped.", exit 1, no commit; the same with a ghost entry → stopped; a valid docs-only commit → "documentation only, skipping checks.", committed |
| 9 | CI's witness job runs it as a second step, on every pull request | no | confirmed | `ci.yml:89-101`: job `witness` has no `needs` or `if`, and its steps are `check-witness.js` then `check-docs-index.js`; the workflow runs on `pull_request` (opened, synchronize, reopened, ready_for_review) and on pushes to main. Not run on GitHub; the step's exact command ran locally and exited 0 |
| 10 | Each entry's summary matches its note | no | confirmed | Read the title and first paragraph of all 38 notes against their entries (e.g. skill-scanner "the rules Ronne follows" → its `## The rules Ronne follows`; mysql-removed-functions → SHA1/SHA/MD5 gone in 9.6; caddy-proxy-image → scan failures and exceptions E-7 to E-10). No mismatch found |
| 11 | The new code passes lint | no | confirmed | `pnpm exec biome check` on docs-index.js, its test, check-docs-index.js, run-pre-commit.js and package.json → "No fixes applied", no errors |

**Overall:** met: the index is complete, `pnpm docs:check` and the repo-tools tests pass, both kinds of mismatch fail the check (directly, and through the hook on a documentation-only commit), and CI's witness job runs it as a second step.

Findings, not against the task's claims: `listedNotes` missed `./a.md` and `a.md#section` (a false "isn't listed"); duplicates and links inside a code fence pass; an upper-case `.MD` note can't be listed; the message named CONTRIBUTING.md, which this task doesn't check; the hook's header comment and the CI job's name still said only "witness". Fixed after this pass: the parser (a loop, `./` and `#section` read as the note), the message and the hook's comment. The CI job keeps its name, as branch protection may require it by name. Duplicates, code fences and `.MD` are left: they fail safe or can't happen with today's notes.

### Re-check after the fixes (claims 2, 4, 5, 7, 8, plus new claims 12 to 15)

Witnessed: 2026-11-18 09:53 EST, by a fresh agent (blind). Commit: 0e61bcd4 (plus the uncommitted working tree on feat/187-contributor-docs, now with the changes to docs-index.js, docs-index.test.js, check-docs-index.js, .githooks/pre-commit and WITNESS.md). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | `pnpm --filter @ronneai/repo-tools test` passes, with tests for the rule | no | confirmed | → 21 files, 190 tests passed (7 in `docs-index.test.js`); `pnpm docs:check` → exit 0 |
| 4 | Adding an unlisted note makes the check fail | no | confirmed | Scratch git copy with the new files: a docs-only commit of `docs/knowledge/new-note.md` → "new-note.md isn't listed in docs/knowledge/README.md", "✗ pre-commit: the docs check failed", exit 1, no commit |
| 5 | Listing a missing note makes the check fail, in the new link forms too | no | confirmed | Scratch: appended `- [ghost.md](./ghost.md#x)` and committed → "README.md lists ghost.md, which isn't a note there", exit 1, no commit |
| 7 | The tests cover both halves of the rule and the new parsing | no | confirmed | Mutations in the scratch copy, each failing exactly one test (1 failed / 6 passed): the listed-but-missing branch removed; `!listed.has(note)` → `false`; the `./` strip removed; the `#` strip removed; the `!target.includes("/")` guard removed. Restored; `cmp` with the repo's file → identical |
| 8 | The pre-commit hook runs it before the documentation-only skip | no | confirmed | Scratch: claims 4 and 5 stopped at the docs check. A valid docs-only commit (new `y.md` listed as `[y](./y.md#top)`) → "documentation only, skipping checks.", committed |
| 12 | `./a.md` and `a.md#section` count as listed; `../x.md`, `https://…/x.md` and `sub/x.md` don't | no | confirmed | `node …/probe-recheck.mjs`: counted `[a](./a.md)`, `[a](a.md#sec)`, `[a](./a.md#x)` → a.md; not counted (`[]`): `../x.md`, `https://e.com/x.md`, `sub/x.md`, `./sub/x.md`, `#x.md`; a CRLF line still counts |
| 13 | The parser stays linear on adversarial input | no | confirmed | Unclosed `](a.md`×1e5 / ×1e6 → 0.1 / 0.8 ms; `](a.md)`×1e5 / ×1e6 → 10.6 / 81.7 ms; `](##########)`×1e5 / ×1e6 → 4.2 / 40.9 ms. Mutation to the regex `/\]\(([^)]*)\)/g` → "stays fast on a long run of unclosed links" fails (84983 ms) |
| 14 | The failure message and the hook comment describe the check correctly | no | confirmed | `check-docs-index.js:10` → "✗ docs: a list in the contributor documentation isn't complete"; `.githooks/pre-commit:2-3` → "Checks the witness records and the contributor documentation's lists, then runs lint, typecheck, test and build unless the commit only touches documentation." |
| 15 | `pnpm witness:check` passes with the first pass in WITNESS.md and task 1 unticked | no | confirmed | → exit 0; `PLAN.md:15` `- [ ] **1. The knowledge index and the docs check.**` |

**Overall:** met: the new parser counts `./a.md` and `a.md#section`, still rejects other folders and addresses, stays linear (its speed test catches a quadratic regex), the rule and the hook hold with the new code, and the wording is fixed.

Remarks left as they are, as they fail safe: `[x](x.md "title")` and `[x](<x.md>)` aren't counted (a false "isn't listed"); `[x](.md)` reads as a note named `.md`; the speed test's input leaves the loop at once, so it catches a backtracking regex but not a quadratic loop; "one entry per note" isn't enforced.

## Task 2 — GitHub templates and the code of conduct

Witnessed: 2026-11-18 09:58 EST, by a fresh agent (blind). Commit: e9fb219c plus the working tree (untracked `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, `CODE_OF_CONDUCT.md`; modified `SPEC.md`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `bug.yml` and `feature.yml` parse as YAML and have the keys GitHub's issue forms require (`name`, `description`, `body` with typed elements) | no | confirmed | `node scratchpad/187-t2-blind/probe/forms.mjs <repo>` (yaml 2.9.1 with strict and uniqueKeys, plus ajv against SchemaStore's `github-issue-forms.json`) → `bug.yml schema: true`, `feature.yml schema: true`; top keys `name,description,labels,body`. Mutations in scratch copies: removing `name` → `must have required property 'name'`; `type: select` → enum error. GitHub's own rendering wasn't seen: the forms only show once they're on the default branch |
| 2 | The `id`s in each form are unique, every non-markdown element has one, and they use only allowed characters | no | confirmed | Same probe → bug ids `what-happened,expected,steps,version,part,install,environment`, feature ids `problem,proposal,alternatives,contribute`, `unique: true`, `idfmt: true`. Mutation `id: expected`→`steps` → `unique: false` |
| 3 | `config.yml` turns off blank issues | no | confirmed | `config.yml:1` `blank_issues_enabled: false`; validates against SchemaStore `github-issue-config.json` |
| 4 | `config.yml` links to private vulnerability reporting, which is on, and the link matches SECURITY.md | no | confirmed | `config.yml:3-5` → `https://github.com/ronneai/ronne-marketplace/security/advisories/new`; `gh api repos/ronneai/ronne-marketplace/private-vulnerability-reporting` → `{"enabled":true}`; SECURITY.md: Security tab › "Report a vulnerability", the same path `bug.yml:8` names |
| 5 | `CODE_OF_CONDUCT.md` is the Contributor Covenant 2.1, and the only change is the contact `conduct@ronne.ai` | no | confirmed | `curl` EthicalSource/contributor_covenant `release/content/version/2/1/code_of_conduct.md`, front matter removed, `diff` → one changed line (40): `[INSERT CONTACT METHOD]` → `[conduct@ronne.ai](mailto:conduct@ronne.ai)` |
| 6 | The PR template covers the spec's points: title format, what it does, the feature or issue, the checks run, tasks left unticked for the witness, what the Documentation should say | no | confirmed | `pull_request_template.md:1-8` title format, `:10` What it does, `:14-16` Feature or issue with "Leave the tasks unticked: the maintainer runs the state witness", `:18-25` Checks, `:27-29` Documentation |
| 7 | The title format in the PR template matches the checker | no | confirmed | `commit-message.js:4` TYPES `docs, feat, chore, bugfix`; the SUBJECT regex and ID rule `\d{3}\|#\d+` match the template's three forms |
| 8 | The labels the forms apply exist | no | confirmed | `gh label list` (read only) → includes `bug` and `enhancement` (and `good first issue`, `help wanted`) |
| 9 | Where the form says a version is shown is true | no | confirmed | `admin/settings/page.tsx:28` root only, `:57` the `updates` tab; `messages/en/admin.json` "Updates", "You run"; `packages/cli/src/cli.ts:58,285` `--version` |
| 10 | The install methods named in `bug.yml` exist | no | confirmed | `docs/runbooks/install.md`: install script with `compose.yaml`; `apt`/`dnf` packages; `npx @ronneai/marketplace`; `rmk-server service install` |
| 11 | The checks named in the PR template exist, and the pre-commit hook runs the four it says | no | confirmed | `package.json` scripts `lint`, `typecheck`, `test`, `build`, `test:db:up`, `test:db:postgres`, `:mysql`, `:mariadb`; `pre-commit.js:23`; `docs/policies/dependencies.md`; `apps/web/messages/{en,fr,pt}` |
| 12 | The repository checks still pass with the new files | no | confirmed | `pnpm docs:check` → 0; `pnpm witness:check` → no errors; `pnpm exec biome check .github CODE_OF_CONDUCT.md` → "No fixes applied" |
| 13 | Links to CONTRIBUTING.md | no | confirmed | `config.yml:10` uses the absolute main-branch URL; `feature.yml:8` and `pull_request_template.md:6` name the file. It comes in task 3; the URL resolves once it merges |

**Overall:** met: both forms meet the issue-forms schema with unique ids, `config.yml` turns off blank issues and points to private reporting (which is on), the code of conduct is the 2.1 text with only the contact changed, and every fact the templates state matches the repository.

## Task 3 — `CONTRIBUTING.md` and its commands rule

Witnessed: 2026-11-18 10:15 EST, by a fresh agent (blind). Commit: e9093b75 + working tree (new CONTRIBUTING.md; changed packages/repo-tools/src/docs-index.js, docs-index.test.js). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the working tree | no | confirmed | `pnpm docs:check` → exit 0, no output |
| 2 | The repo-tools tests pass, including the repository-wide `checkAll` test | no | confirmed | `pnpm --filter @ronneai/repo-tools test` → 21 files, 193 tests passed; `pnpm exec biome check` on the 3 changed files → clean |
| 3 | A script added to the root `package.json` without a row in `CONTRIBUTING.md` fails the check | no | confirmed | `probe-rows.mjs`: added `new:thing` to a copy of package.json → `checkAll` returns `CONTRIBUTING.md doesn't name the root script "new:thing"` |
| 4 | Removing a script's row makes the check fail | no | partly | `probe-rows.mjs` deleted, one script at a time, every table row that names it: fails for 27 of 41 scripts; still passes for 14 (build, lint, typecheck, test, hooks:install, witness:check, docs:check, licenses:check, setup-code, reset-setup, test:db:up, test:db:down, test:db:postgres, test:e2e), because `checkContributing` accepts any `` `pnpm x` `` anywhere in the file, the prose included |
| 5 | The unit tests catch a broken `checkContributing` | no | confirmed | Scratch copy mutated to always return `[]` → 2 failed / 8 passed |
| 6 | One full commands table: every root script has a row, with development first | no | confirmed | Node probe → 41 scripts, 38 rows, none without a row; `pnpm dev` in "Working on the code", the first group |
| 7 | The operator commands (backup, restore, secrets, sign-in recovery) point to the runbooks | no | partly | backup/restore → backup.md; revoke-access, rotate-secret → incident-response.md. `reset-root-password`, `reset-two-factor`, `disable-sso` have no runbook link; no runbook mentions `reset-two-factor` |
| 8 | Every link in the file resolves | no | confirmed | `probe-links.mjs` → all 29 relative links exist; MVP anchors #92, #93, #94 match headings |
| 9 | Requirements and setup facts | no | confirmed | `.nvmrc` = 24; engines `>=22.12`; packageManager `pnpm@12.6.0`; the setup code is logged at start; `setup-code` and `reset-setup` exist |
| 10 | The "Where things are" table | no | confirmed | `ls packages` → cli, config, core, mcp, repo-tools, server; `ls docs/runbooks` → backup, incident-response, install, release |
| 11 | Code rules: one line each with a link to the note that explains it | no | partly | The facts are right, but arrow functions and "The CLI is `rmk`" have no link (MVP.md:941 explains the rmk name), and most rules run 2–4 lines |
| 12 | Tests section facts | no | confirmed | apps/web vitest: unit and db projects, db on in-memory SQLite unless `TEST_DATABASE_URL`; `-- <paths>` passed on; playwright projects chromium, phone, phone-webkit, tablet |
| 13 | Pre-commit facts | no | confirmed | run-pre-commit.js always runs check-witness and check-docs-index; pre-commit.js skips the rest for .md/.mdx/.txt only, adds `install --frozen-lockfile` and `licenses:check` on dependency files |
| 14 | Commit and PR title format, and the examples | no | confirmed | commit-message.js: types docs/feat/chore/bugfix, 72 characters, capital, no full stop; `checkSubject` → all 3 examples valid |
| 15 | Pull request facts (template, squash merge, no closing keywords) | no | confirmed | pull_request_template.md sections and the "closes #N" warning; pr-title.yml exists |
| 16 | CI: "lint, typecheck, the tests and the build on Node 22 and 24" | no | partly | ci.yml:60–63: `pnpm lint` and `pnpm typecheck` run only when `matrix.node == 24`; only test and build run on 22 and 24 |
| 17 | Each command's description matches its script | no | confirmed | All 41 compared with package.json and apps/web/package.json |
| 18 | Witness rule for outside contributors | no | confirmed | CONTRIBUTING.md:80–83 matches option A; witness.js:164 checks only ticked tasks |
| 19 | Documentation rule for outside contributors | no | confirmed | CONTRIBUTING.md:85–96 matches the spec |
| 20 | Where security reports go | no | confirmed | CONTRIBUTING.md:7–8 → SECURITY.md:7–8; config.yml has the advisories link |
| 21 | Every section the spec's Scope lists is present | no | confirmed | All present (CONTRIBUTING.md:7–247) |

**Overall:** not met: rows 4, 7, 11 and 16 are partly.

Fixed after this pass: the rule reads only the first cell of the table rows in `## Commands` (prose, other rows' descriptions and other sections don't count), with tests for each; the three sign-in recovery rows link the incident runbook, which gains `reset-two-factor`; arrow functions link the Biome plugin and `rmk` links MVP §15; the CI line says lint and typecheck, then the tests and build on Node 22 and 24. The spec now says "each short and with a link", not "one line each".

### Re-check of rows 1, 2, 4, 7, 8, 11, 16, 17 and two new claims

Witnessed: 2026-11-18 10:06 EST, by a fresh agent (blind). Commit: e9093b75 + working tree (CONTRIBUTING.md, docs-index.js, docs-index.test.js, incident-response.md, SPEC.md, WITNESS.md). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the working tree | no | confirmed | `pnpm docs:check` → exit 0 |
| 2 | The repo-tools tests pass | no | confirmed | → 21 files, 194 tests passed; `biome check` on docs-index.js and its test → clean |
| 4 | Removing a script's row makes the check fail, and a mention elsewhere doesn't count | no | confirmed | `probe-rows.mjs` → removing a script's rows fails the check for all 41 scripts. `probe-cells.mjs` → a script named only in the prose fails, and one named only in another row's description; a CRLF page → `[]`. Mutations: whole row instead of first cell → 1 of 11 fails; start at line 0 instead of `## Commands` → 3 of 11 fail. Restored, `cmp` matches |
| 7 | The operator commands (backup, restore, secrets, sign-in recovery) point to the runbooks | no | confirmed | CONTRIBUTING.md:235–237: reset-root-password, reset-two-factor and disable-sso link incident-response.md; backup/restore → backup.md; revoke-access/rotate-secret → incident runbook |
| 8 | Every link in the file resolves | no | confirmed | `probe-links.mjs` → 32 relative links OK, including the .grit plugin and `docs/MVP/MVP.md#15-decision-log` |
| 11 | Code rules: each short, with a link to what explains or enforces it | no | confirmed | All 9 rules (CONTRIBUTING.md:102–131) have a link; SPEC.md's Scope line matches |
| 16 | The CI line matches the workflows | no | confirmed | ci.yml runs lint and typecheck on Node 24 only (:60–63), tests and build on 22 and 24, check-docs-index in the witness job (:101). "lint and typecheck on Node 24" would be exact |
| 17 | Each command's description matches its script (rows changed since the last pass) | no | partly | The docs:check row matches. The reset-two-factor row says "ends its sessions"; the command also revokes the account's access tokens (services/root-account.ts:140, setup/reset-two-factor.ts:44, :55) |
| 22 | `pnpm witness:check` passes with task 3 unticked | no | confirmed | → exit 0; PLAN.md:30 `- [ ] **3. …` |
| 23 | The reset-two-factor runbook paragraph matches the script and `rmk-server` | no | partly | `--email`, the `sudo rmk-server` form (cli.ts:148), "asks first; `--yes` doesn't ask" and the lost-phone case match. It leaves out the token revocation, as do the script header (apps/web/scripts/reset-two-factor.ts:1–3) and `RESET_TWO_FACTOR_USAGE` (apps/web/src/server/setup/cli.ts:282), which it copied |

**Overall:** not met: the reset-two-factor wording, in the runbook and the CONTRIBUTING.md row, leaves out that the command also revokes the account's access tokens.

Fixed after this pass: the runbook paragraph and the CONTRIBUTING.md row say it ends the sessions and revokes the access tokens (and the runbook names the audit event `user.two_factor_reset`); the script header and `RESET_TWO_FACTOR_USAGE` say so too; the CI line says "lint and typecheck on Node 24".

### Second re-check of rows 1, 16, 17, 22 and 23 (wording)

Witnessed: 2026-11-18 10:08 EST, by a fresh agent (blind). Commit: e9093b75 + working tree (CONTRIBUTING.md, incident-response.md, apps/web/scripts/reset-two-factor.ts, apps/web/src/server/setup/cli.ts, SPEC.md, WITNESS.md, plus the earlier docs-index changes). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes on the working tree | no | confirmed | `pnpm docs:check` → exit 0 |
| 16 | The CI line matches the workflows | no | confirmed | CONTRIBUTING.md:178 "lint and typecheck on Node 24, the tests and the build on Node 22 and 24, the witness, docs and license checks …"; ci.yml:60–63 and :101 |
| 17 | The reset-two-factor row matches the command | no | confirmed | CONTRIBUTING.md:236 "… ends its sessions and revokes its access tokens"; services/root-account.ts:140, setup/reset-two-factor.ts:44 |
| 22 | `pnpm witness:check` passes with task 3 unticked | no | confirmed | → exit 0; PLAN.md:30 `- [ ] **3. …` |
| 23 | The runbook paragraph, the script header and the usage text match the code, including the audit event | no | confirmed | All say "ends its sessions and revokes its access tokens"; `user.two_factor_reset` matches services/root-account.ts:144 and audit-event.ts:42; `sudo rmk-server reset-two-factor --email` matches packages/server/src/cli.ts:148 |
| 24 | The usage text change breaks no test, and the two .ts files lint clean | no | confirmed | In apps/web, `pnpm exec vitest run src/server/setup` → 19 files, 199 passed, 2 skipped; `biome check` on the two .ts files → "No fixes applied"; no test asserts the old text |

**Overall:** met: the reset-two-factor wording in all four places, the CI line and the audit event name match the code, and the checks and the setup tests pass with task 3 unticked.

Remark: one line of `RESET_TWO_FACTOR_USAGE` ran over 100 characters after the edit. Reflowed after this pass (text unchanged, lines now 98, 95 and 88 characters).

### Third re-check of row 24 (the usage text reflow)

Witnessed: 2026-11-18 10:08 EST, by a fresh agent (blind). Commit: e9093b75 + working tree (apps/web/src/server/setup/cli.ts changed since the second re-check). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 24 | `RESET_TWO_FACTOR_USAGE` is reflowed with the same words, no line is over 100 characters, the setup tests and lint pass, and the witness check passes | no | confirmed | Node probe, whitespace collapsed: the paragraph equals the second re-check's wording. Line lengths 84, 98, 95, 88, 28, 60, 28. `biome check apps/web/src/server/setup/cli.ts` → "No fixes applied". In apps/web, `pnpm exec vitest run src/server/setup` → 19 files, 199 passed, 2 skipped. `pnpm witness:check` → exit 0 |

**Overall:** met: the reflow changed only line breaks, and every check passes.

## Task 4 — The README, `CLAUDE.md`, `AGENTS.md` and the witness rule

Witnessed: 2026-11-18 10:24 EST, by a fresh agent (blind). Commit: 3a3e63b1 plus the working-tree diff (8 files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The README has no command table and no layout table | no | confirmed | `grep -n -E "^#\|^\|" README.md` → the only table is the Docker settings table (README.md:109–117); `## Development` with Requirements, Commands and Layout is gone |
| 2 | The README's status line names no milestone and points to the features index | no | confirmed | README.md:8–9 "in active development, released as 0.x versions", links `docs/features/README.md` and MVP.md; no `M[0-9]` or "milestone"; package.json version 0.8.0 |
| 3 | The README's Contributing section links to CONTRIBUTING.md, the code of conduct and SECURITY.md | no | confirmed | README.md:325–330; all three resolve |
| 4 | "Setting up without the browser" stays in the README, under From source | no | confirmed | README.md:239 `### From source`, :256 the section, :284 the next heading; the text matches the removed block word for word |
| 5 | CLAUDE.md's Commands section links to CONTRIBUTING.md and keeps only what an agent needs beyond it | no | confirmed | The table is removed; CLAUDE.md:44 links `CONTRIBUTING.md#commands` (the anchor exists); four pitfalls and the CI paragraph kept |
| 6 | MVP.md's description in CLAUDE.md matches MVP.md | no | partly | CLAUDE.md:14 "its milestones are the MVP's (M0–M6)", but MVP.md §13 (:778–786) also lists M5b and M7 |
| 7 | The witness rule for outside contributors is stated in all five files | no | confirmed | CLAUDE.md:34; features/README.md:22–24; issues/README.md:14–16; state-witness.md:94–99; CONTRIBUTING.md:74–83 |
| 8 | The Documentation rule (ronne-web is private; the PR says what the website should say; the owner updates it) | no | confirmed | CLAUDE.md:34, features/README.md:31–32, CONTRIBUTING.md:85–96 |
| 9 | Every relative link in the changed files resolves | no | confirmed | `node 187-t4-blind/links.mjs` over the 9 files → "246 relative links, 0 broken", anchors included; a mutated copy's broken links are reported |
| 10 | AGENTS.md points to CLAUDE.md and CONTRIBUTING.md outside Turborepo's managed block | no | confirmed | AGENTS.md:10 END marker, the project section at :12–16 after it. turbo 2.11.10 didn't rewrite the block in a scratch repository, so survival rests on its place, not a run |
| 11 | `pnpm witness:check` passes | no | confirmed | → exit 0; `pnpm docs:check` → 0 |
| 12 | The new facts in CLAUDE.md match the repository | no | confirmed | run-pre-commit.js:16–27; ci.yml:88–101; release-bump.js and release.yml:454–463; playwright.config.ts:56 `phone-webkit`; `docs:check` fails on a deleted `disable-sso` row and an unlisted note in a scratch copy |
| 13 | Nothing a reader needs was lost from the README and CLAUDE.md | no | partly | Lost: `node packages/repo-tools/src/bundle-smoke.js <archive>`; `pnpm bundle`'s `--out DIR` and `--keep`; `reset-setup` asking first or `--yes` and refusing in production and in Docker; minor: `scripts/install/test-install.sh` and `apps/web/e2e` |
| 14 | Nothing else in the repository links to the README's removed `#development` section | no | confirmed | `git grep` for `#development`, `#requirements`, `#layout`, `#commands` → only CLAUDE.md's `CONTRIBUTING.md#commands`; prose mentions remain in finished features' history (034, 036), not links |

**Overall:** not met: rows 6 and 13 are partly.

Fixed after this pass: CLAUDE.md (and the spec) say MVP.md's §13 lists the first milestones (M0–M7) and the whole roadmap is in the features index; CONTRIBUTING.md's rows gain `bundle-smoke.js`, `--out DIR` and `--keep`, `reset-setup`'s `--yes` and refusals, and the paths `scripts/install/test-install.sh` and `apps/web/e2e`. The witness's aside about pnpm 12's built-in `clean` and `start`: `pnpm help clean` says "A `clean` script in `package.json` overrides the built-in command", and `pnpm start` runs the `start` script, so both rows are right.

### Re-check of rows 6, 9, 11 and 13

Witnessed: 2026-11-18 10:31 EST, by a fresh agent (blind). Commit: 3a3e63b1 plus the working-tree diff (10 files, including CONTRIBUTING.md and WITNESS.md). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | MVP.md's description in CLAUDE.md matches MVP.md | no | confirmed | CLAUDE.md:14 "its §13 lists the first milestones (M0–M7), and the whole roadmap is in `docs/features/README.md`"; MVP.md:776–790 → M0 M1 M2 M3 M4 M5 M5b M6 M7, M7 the last; SPEC.md:49–51 the same wording |
| 9 | Every relative link in the changed files resolves | no | confirmed | `links.mjs` on the 9 files → "246 relative links, 0 broken"; WITNESS.md's only hits are probe inputs quoted in inline code; its 3 real links resolve |
| 11 | `pnpm witness:check` passes | no | confirmed | `node packages/repo-tools/src/check-witness.js; echo $?` → 0 |
| 13 | Nothing a reader needs was lost from the README and CLAUDE.md | no | confirmed | `--out DIR`, `--keep`: bundle.js:2, :163–164; `bundle-smoke.js <archive>` with no Node.js on PATH: bundle-smoke.js:2, :4; `reset-setup` asks first or `--yes`, refuses in production and in Docker: scripts/reset-setup.ts:2–3, :48, server/setup/reset-setup.ts:41, reset-setup.test.ts:20–25; `apps/web/e2e`: playwright.config.ts:33; `scripts/install/test-install.sh`: package.json:52 |
| 14 | CONTRIBUTING.md's table still passes `pnpm docs:check` | no | confirmed | → 0; in the scratch copy, deleting the `pnpm bundle <tarball>` row → "has no row for the root script "bundle"" |

**Overall:** met: CLAUDE.md and SPEC.md match MVP.md's M0–M7, every restored detail matches its source, and the links, `witness:check` and `docs:check` pass.

The first pass's `Witnessed:` time was corrected from 10:38 to 10:24 EST, as the witness reported (`date` at its start).
