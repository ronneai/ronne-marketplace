# 199 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

The checks come before the move, so the move is proved by them.

## Tasks

- [x] **1. The spec and the domains.** This spec and plan, and `docs/features/domains.json`: the
  domains with a line each, and the domain of every feature ID; the owner reviews the mapping.
  *Done when:* every feature folder's ID is in `domains.json` exactly once, under a listed domain,
  and the owner has agreed the mapping.

- [x] **2. The witness check under domains.** `packages/repo-tools/src/witness.js` reads feature
  folders one level down; a feature folder at the top level or an ID in two folders is an error;
  `docs/issues` is read as before. Update the tests and the fixtures that name feature paths
  (`witness.test.js`, `pre-commit.test.js`, `ci-scope.test.js`).
  *Done when:* the repo-tools tests pass, including new cases for both errors.

- [x] **3. The index check.** `docs-index.js` checks the index, the milestone files and
  `domains.json` against the folders, and the relative links in the docs, as the spec says.
  *Done when:* the repo-tools tests pass with a case for each failure the spec lists.

- [x] **4. The move.** `git mv` every feature folder into its domain; rewrite every relative link
  and every `docs/features/NNN-slug` path in the repository; `i18n-review.js` and `.gitignore`
  follow `133-languages-signoff/review/`.
  *Done when:* `git grep -nE "docs/features/[0-9]{3}-" -- ':!*.test.js' ':!*/WITNESS.md'` finds nothing, `pnpm witness:check`
  reports what it did before, and `git log --follow` on a moved `SPEC.md` shows its history.

- [x] **5. The milestone files and the short index.** `milestones/*.md` from today's index, word
  for word; `README.md` rewritten with how to use it, the domains, the milestone files and the
  short index.
  *Done when:* `pnpm docs:check` passes; the index is at most 30 KB and no milestone file over
  about 15 KB; every row of today's index is in exactly one milestone file, unchanged except for
  its link.

- [x] **6. The rules and guides.** CLAUDE.md, `CONTRIBUTING.md`, `docs/knowledge/state-witness.md`,
  the state witness agent and `_template/` say how a feature is filed and what to read.
  *Done when:* each names the new layout and no file in the repository describes the old one.

## Notes

- **The move was a one-off script, not committed.** It read every link from where its file was
  before the move, and wrote it again from where the file went. A link that landed nowhere before
  the move was left as it was. Plain `docs/features/NNN-slug` paths in code and docs were rewritten
  the same way. A witness record (`WITNESS.md`) quotes the commands it ran, so its old paths in
  backticks stay; its links were rewritten like any page's.
- **The template's links are written for its copies**, three folders down from `docs/`, so the
  link check reads them from there (`_template/README.md` aside, which stays where it is).
- **The index's status has no note.** A milestone file may say `done (the Documentation in …)`;
  the index says `done`. The check compares the two without the note, which kept the index under
  30 KB.
- **Links into the old index's sections** (`README.md#m13--workspaces`) broke without any file
  going missing; that is why the link check also reads section anchors.
- **Left for later:** the link check reads a `<!--` inside inline code as an opened comment, which
  would hide the links after it; no page has one (task 3's re-check 2).
