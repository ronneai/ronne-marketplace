# 187 — Documentation for new contributors

> Milestone: none (the repository, not the product) · Depends on: none · Design: none · Contracts: none

## Goal

Someone who finds the repository and wants to help should learn, from one page written for people,
how to set up, what the project's rules are, which checks to run and how a pull request gets in.
Today that is spread between the README's Development and Contributing sections and `CLAUDE.md`,
which is written for an AI agent; several rules (arrow functions only, screen text in messages,
the witness records, the Documentation on the website) appear nowhere a person would look first,
and the two command tables have drifted apart (owner, 2026-11-18, from a review of the
contributor documentation).

## Scope

**In:**
- **`CONTRIBUTING.md`** at the root, for people: requirements and setup, how to pick work, the
  code rules in one line each with a link to the note that explains them, tests and CI, the one
  full table of commands, commits and pull requests, features and issues, the witness rule for
  outside contributors, the Documentation rule for outside contributors, and where security
  reports go.
- **The witness rule for outside contributors** (owner, 2026-11-18, option A): a pull request
  from outside the project leaves PLAN.md's tasks unticked and says in its description which
  tasks it does; the owner runs the [state witness](../../knowledge/state-witness.md) on the branch,
  adds the record and ticks the tasks before merging. `pnpm witness:check` already passes an
  unticked task, so the checker doesn't change. The rule is also stated in
  [`docs/features/README.md`](../README.md), [`docs/issues/README.md`](../../issues/README.md),
  [`state-witness.md`](../../knowledge/state-witness.md) and `CLAUDE.md`.
- **The Documentation rule for outside contributors** (owner, 2026-11-18): the website's source,
  `../ronne-web`, is private. A contributor fills in the spec's Documentation section and says in
  the pull request what the website should say; the owner updates the website for the release.
  In-app helpers (`apps/web/src/components/help/`) are in this repository and change in the pull
  request as before.
- **One commands table.** `CONTRIBUTING.md` holds the full table of the root `package.json`
  scripts, development first, with the operator commands (backup, restore, secrets, sign-in
  recovery) pointing to the runbooks. The README and `CLAUDE.md` link to it instead of keeping
  their own. The docs check (below) fails when a root script isn't named in `CONTRIBUTING.md`.
- **The README for people using Ronne:** a status line that doesn't go stale (it points to the
  features index instead of naming milestones), the Layout table with `packages/server`, and a
  short Development and Contributing section that links to `CONTRIBUTING.md`. "Setting up without
  the browser" stays in the README, under From source, because operators need it.
- **`CLAUDE.md`:** its Commands section links to `CONTRIBUTING.md` and keeps only what an agent
  needs beyond it; MVP.md is described as the MVP design (M0–M6), with the roadmap since in the
  features index; the witness rule for outside contributors.
- **`AGENTS.md`:** besides Turborepo's managed block, a line telling Codex, Cursor and other agents
  to read `CLAUDE.md` and `CONTRIBUTING.md` for the project's rules.
- **GitHub templates:** a pull request template (title format, what it does, the feature or issue,
  the checks run, tasks left unticked for the owner's witness, what the Documentation should say)
  and issue forms for a bug and a feature request, with a `config.yml` that sends security reports
  to private advisories ([SECURITY.md](../../../SECURITY.md)) and turns off blank issues.
- **`CODE_OF_CONDUCT.md`:** the Contributor Covenant 2.1, with `conduct@ronne.ai` as the contact
  (owner, 2026-11-18).
- **`docs/knowledge/README.md`:** an index of the knowledge notes, one line each; the docs check
  fails when a note isn't listed or a listed note doesn't exist.
- **The docs check, `pnpm docs:check`** (`packages/repo-tools/src/check-docs-index.js`, its rules in
  `docs-index.js`): the two rules above. Both read only Markdown and `package.json`, and a pull
  request that changes only Markdown skips the tests, so the check runs as the witness check does:
  the pre-commit hook runs it before deciding whether to skip, and CI runs it in the witness job on
  every pull request. Otherwise a pull request that only adds a note would pass and break the next
  run on `main`.

**Out** (and where it goes instead):
- GitHub labels such as `good first issue`, and turning on private vulnerability reporting: settings
  on GitHub, made by the owner.
- An architecture overview between the README and MVP.md: a later feature, if the owner wants it.
- `docs/bugfixes/`, an older one-off record from before `docs/issues/`: left as it is.
- The Documentation website: nothing in it changes.

## Behaviour

A new contributor reads the README, follows its link to `CONTRIBUTING.md`, and from there:

1. Installs Node.js 24 and pnpm (not through Corepack), clones, runs `pnpm install`,
   `pnpm hooks:install` and `pnpm dev`.
2. Opens an issue before a feature or a large change, so the owner can say whether it fits and
   which feature folder it belongs to; a small fix can go straight to a pull request.
3. Follows the feature's `SPEC.md` and `PLAN.md`, leaving the tasks unticked.
4. Runs the checks the pre-commit hook runs, and the database servers only for database code.
5. Opens a pull request whose title follows the format; the template asks for the rest.

`pnpm docs:check` keeps it true, on every commit and pull request: every root `package.json`
script is named in `CONTRIBUTING.md`, and every note in `docs/knowledge/` is listed in its README
(and nothing else is).

## Edge cases

- A script added to the root `package.json` without a row in `CONTRIBUTING.md` fails the docs
  check, so the table can't drift again.
- A note added to `docs/knowledge/` without a line in its README fails the same way, even in a
  commit or pull request that changes only Markdown; the README itself isn't a note.
- An outside contributor who does run the witness and ticks a task: the owner re-runs the witness
  before merging; the contributor's record is kept only if the owner's pass agrees.
- Turborepo re-adds its managed block to `AGENTS.md`; the project's line sits outside the block so
  it survives.

## Documentation

None on the website or in the in-app helpers: this feature changes how people work on the
repository, not what people see or do in Ronne. The repository's own documents change as listed
under Scope.

## Acceptance criteria

- [ ] `CONTRIBUTING.md` covers every point under Scope, and every command, path and rule in it
  matches the repository (the scripts in `package.json`, the hooks, the CI workflows).
- [ ] `pnpm docs:check` fails when a root script isn't named in `CONTRIBUTING.md`, and passes now.
- [ ] The pre-commit hook and CI's witness job run `pnpm docs:check`'s script, documentation-only
  changes included.
- [ ] The README links to `CONTRIBUTING.md`, has no command table of its own, lists
  `packages/server`, and its status line names no milestone.
- [ ] `CLAUDE.md`, `docs/features/README.md`, `docs/issues/README.md` and `state-witness.md` state
  the witness rule for outside contributors; `CLAUDE.md` links to `CONTRIBUTING.md` for commands.
- [ ] `AGENTS.md` points to `CLAUDE.md` and `CONTRIBUTING.md` outside the managed block.
- [ ] The pull request template and the two issue forms exist, the forms are valid issue-form YAML,
  and `config.yml` links to private vulnerability reporting.
- [ ] `CODE_OF_CONDUCT.md` is the Contributor Covenant 2.1 with `conduct@ronne.ai`.
- [ ] `docs/knowledge/README.md` lists every note, and `pnpm docs:check` keeps it complete.
- [ ] Every relative link in the new and changed Markdown files lands on a file that exists.

## Open questions

- None.
