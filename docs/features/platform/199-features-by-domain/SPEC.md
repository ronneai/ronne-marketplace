# 199 — Features by domain, one file per milestone

> Milestone: outside the milestones · Depends on: 187 · Design: none (repository work) · Contracts: none

## Goal

`docs/features/` holds 173 feature folders side by side, and its index is 73 KB that every feature
starts by reading. Group the folders by their main domain, give each milestone its own file, and
keep the index short, so a feature is easy to find and an agent reads only what the work needs
(owner, 2026-11-22).

## Scope

**In:**
- Every feature folder moves to `docs/features/<domain>/<NNN-slug>/`, with `git mv`, its files
  unchanged except for links. The domain is the feature's main one, from
  [`domains.json`](../../domains.json): the list of domains, a line on each, and the domain of every
  feature ID.
- Each feature keeps its own `SPEC.md`, `PLAN.md` and `WITNESS.md` in its folder.
- `docs/features/milestones/`: one file per milestone (`M00-…` to `M33-…`, `M05b-…`), plus
  `across-the-app.md` and `repository.md` for the two sections outside the milestones, and a
  `README.md` listing them. Each holds the milestone's introduction and its full rows (ID,
  feature, depends on, status), word for word from today's index.
- `docs/features/README.md` keeps how to use it, lists the domains and the milestone files, and has
  a short index: one row per feature with its ID, linked title, domain, milestone and status.
- `pnpm witness:check` finds feature folders one level down, under their domain. A feature folder
  at the top level, or one ID in two folders, is an error.
- `pnpm docs:check` checks that every feature folder has one row in the index and one in a
  milestone file, both linking to its real path with the same status (the index gives it without
  the note in brackets the milestone file may add); that its domain is the one in `domains.json`,
  and each domain's name can be a folder's (lowercase letters, digits and `-`); and that every
  relative link resolves, inline or a reference definition, outside code and HTML comments, in
  `docs/**/*.md`, the root's Markdown pages, `.github` and `.claude`. Two exceptions: a
  `WITNESS.md` isn't read, since it quotes what a check was given, made-up links included; and a
  link to a `WITNESS.md` is fine while its folder exists, since the first pass writes the file.
- Every link and path that names a feature folder, in the repository's docs, code comments and
  GitHub templates, points to the new place.
- CLAUDE.md, `CONTRIBUTING.md` and the state witness's guide say how a new feature is filed (a
  domain, an index row, a milestone row) and what to read: the milestone file, not the whole
  index; `SPEC.md` and `PLAN.md`, and `WITNESS.md` only to add or check a pass.

**Out** (and where it goes instead):
- `docs/issues/`: stays one folder per issue; it's small.
- Splitting or archiving `WITNESS.md` files: each feature keeps its own (owner, 2026-11-22).
- The website: its link to `docs/features/README.md` keeps working, since the index stays there.

## Behaviour

Finding a feature by number: its row in the index links to `<domain>/<NNN-slug>/SPEC.md`. Finding
the work of a milestone: `milestones/<Mxx>-<slug>.md`. A new feature takes the next free ID, picks
a domain from `domains.json` (adding a domain is a change to that file and the README's list),
starts from `_template/`, and gets a row in the index and in its milestone file in the same change.

Sizes to keep: the index at most 30 KB (one short row per feature, about 100 bytes each), each milestone file at most about 15 KB.

## Edge cases

- A feature that spans domains goes under the one whose code or behaviour it changes most; its
  milestone file and the index still list it once.
- `133-languages-signoff/review/` is git-ignored output of `i18n-review.js`; the script and
  `.gitignore` follow the folder.
- Links from old commits and closed pull requests to the old paths break on GitHub; `git log
  --follow` still finds each file's history.

## Documentation

None: nothing people see or do in Ronne changes. The website's link to the features index keeps
its path.

## Acceptance criteria

- [ ] Every feature folder sits under the domain `domains.json` gives it, and none at the top level.
- [ ] `pnpm witness:check` finds the same features and passes as before the move.
- [ ] `pnpm docs:check` passes, and fails on a missing index row, a missing milestone row, a status
  that differs between them, a folder in the wrong domain, one ID in two folders, or a relative
  link that doesn't resolve.
- [ ] `git grep -nE "docs/features/[0-9]{3}-" -- ':!*.test.js' ':!*/WITNESS.md'` finds nothing (the
  tests name such a path on purpose, to see it refused; a witness record quotes the commands it ran).
- [ ] The index is at most 30 KB (from 73 KB: one row of about 100 bytes per feature) and no milestone file is over about 15 KB.
- [ ] CLAUDE.md, `CONTRIBUTING.md` and `docs/knowledge/state-witness.md` describe the new layout.

## Open questions

- None.
