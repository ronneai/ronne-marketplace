# 195 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP §15's "Commit format" row adds the DCO sign-off for outside contributors.
  - `docs/features/README.md` lists 195 under "Outside the milestones".
  - *Done when:* both say what this spec says, and `pnpm witness:check` and `pnpm docs:check` pass.

- [ ] **2. The workflows check.** [risky]
  - `packages/repo-tools/src/workflows.js` and `workflows.test.js`. The rules are in the spec:
    - no `pull_request_target` or `workflow_run`;
    - the repository guard on jobs with environments, write permissions or secrets;
    - the schedule guard;
    - one repository name, the packages' `repository.url`.
  - Written test-first against fixtures: it fails today's workflows on the missing guards, and the
    failures are listed in Notes.
  - *Done when:* the test's fixtures cover each rule, passing and failing, and `pnpm test` runs it.

- [ ] **3. The guards.** [risky]
  - `release.yml`: the guard on the publishing steps and jobs, and the `not-upstream` job.
  - The schedule guard in `nightly.yml`, `codeql.yml` and `database.yml`.
  - `codeql.yml`'s private-repository skip with its message.
  - *Done when:*
    - task 2's check passes on the real workflows;
    - a dry run of the release (`workflow_dispatch`, `dry_run: true`) on a branch passes as before;
    - a tag pushed in a throwaway private fork runs only `not-upstream`, recorded in Notes with the
      run's link.

- [ ] **4. The DCO check.** [risky]
  - `packages/repo-tools/src/dco.js` and its test. Every commit in `base..head` has a
    `Signed-off-by` matching its author's email or GitHub noreply address. Merge commits and bots
    are skipped. The failure says how to fix it.
  - The `dco` job in `pr-title.yml`: `fetch-depth: 0`, the PR's `author_association` passed through
    an env var (never interpolated), and OWNER, MEMBER and COLLABORATOR exempt.
  - *Done when:* `dco.test.js` covers:
    - signed;
    - unsigned;
    - mismatched email;
    - a noreply address;
    - a co-author without their own sign-off;
    - a merge commit;
    - a bot.

    A test pull request from a second account shows the job failing, then passing after
    `--signoff`, recorded in Notes.

- [ ] **5. CONTRIBUTING.md, SECURITY.md and the knowledge note.**
  - The new section (options A and B with their commands, the cost table, security advisories) and
    the DCO in the License section.
  - `SECURITY.md`'s line for private copies.
  - `docs/knowledge/forks-and-ci.md`, listed in the knowledge README.
  - `test-runs.md` on the schedules.
  - *Done when:*
    - `pnpm docs:check` passes;
    - every command in the new section runs as written against a scratch copy (a bare clone,
      `--mirror` into a local bare repository, the `upstream` remote, a cherry-pick onto a branch of
      `upstream/main`).

- [ ] **6. The GitHub settings runbook.**
  - `docs/runbooks/github-settings.md`:
    - Actions approval for all outside contributors;
    - the read-only default token;
    - the three environments;
    - the ruleset's required checks with `dco`;
    - the squash message default.
  - Linked from `release.md`'s checklist.
  - The owner applies the settings.
  - *Done when:* the runbook lists each setting with where it lives, and the owner confirms in Notes
    (with the date) that the repository matches it.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
