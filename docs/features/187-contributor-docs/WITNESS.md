# 187 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

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
