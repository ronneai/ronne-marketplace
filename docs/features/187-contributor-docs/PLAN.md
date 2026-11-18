# 187 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

The files that link to others come after the files they link to: the knowledge index and the code
of conduct first, then `CONTRIBUTING.md`, then what points to it.

## Tasks

- [x] **1. The knowledge index and the docs check.** `docs/knowledge/README.md` with one line per
  note; `packages/repo-tools/src/docs-index.js` with the rule (every note listed, every listed file
  a note) and its tests; `check-docs-index.js` and the root script `pnpm docs:check`; the
  pre-commit hook runs it next to the witness check, and CI's witness job as a second step.
  *Done when:* `pnpm docs:check` and `pnpm --filter @ronneai/repo-tools test` pass; adding an
  unlisted note or listing a missing one makes the check fail; a documentation-only commit still
  runs it; each line's summary matches its note.

- [x] **2. GitHub templates and the code of conduct.** `.github/pull_request_template.md`,
  `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml` and `config.yml`, and `CODE_OF_CONDUCT.md`.
  *Done when:* the forms parse as YAML with the keys GitHub's issue forms require (`name`,
  `description`, `body` with typed elements, unique `id`s); `config.yml` turns off blank issues and
  links to private vulnerability reporting; the code of conduct is the Contributor Covenant 2.1
  with `conduct@ronne.ai`.

- [ ] **3. `CONTRIBUTING.md` and its commands rule.** Write `CONTRIBUTING.md` as the spec's Scope
  says, with the one full commands table, and add the rule to the docs check: every root
  `package.json` script is named in it.
  *Done when:* `pnpm docs:check` and the repo-tools tests pass; removing a script's row makes the
  check fail; every command, path, link and rule in the file matches the repository.

- [ ] **4. The README, `CLAUDE.md`, `AGENTS.md` and the witness rule.** The README's status line,
  Layout, Development and Contributing as the spec says; `CLAUDE.md`'s Commands section links to
  `CONTRIBUTING.md`, MVP.md's description is fixed, and the witness rule for outside contributors
  is stated there and in `docs/features/README.md`, `docs/issues/README.md` and
  `docs/knowledge/state-witness.md`; `AGENTS.md` points to both files outside the managed block.
  *Done when:* the README has no command table and links to `CONTRIBUTING.md`; the five files
  state the rule; `pnpm witness:check` passes; every relative link in the changed files resolves.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
