# 195 — Fork-friendly CI and contributing from a private copy

> Milestone: none (the repository, not the product) · Depends on: 187 · Design: [MVP §15](../../../MVP/MVP.md#15-decision-log) ("Commit format", "Dependencies") · Contracts: none

## Goal

The repository is public, so GitHub keeps every fork of it public. A company that wants Ronne
privately clones it into a repository of its own, which the MIT licence allows. Two things follow
(owner, 2026-11-20).

**Forks and copies should be safe and quiet:**
- a tag pushed in a fork shouldn't start our release;
- a private copy shouldn't run checks that need paid GitHub features;
- no workflow should ever give a stranger's code our secrets.

**People who run Ronne privately should know how to keep up with us and how to give a change back,**
with a sign-off that says they had the right to.

## Scope

**In:**
- **Publishing runs only here.**
  - **The guard:** every job that publishes, pushes, or uses an environment or a secret other than
    `DOCKERHUB_READ_TOKEN` gets `if: github.repository == 'ronneai/ronne-marketplace'`, joined with
    its existing condition. In `release.yml` that is `release`'s publish steps, `image`'s push,
    `manifest`, `github-release` and `bump-version`.
  - **In a fork or a copy:** a tag push runs one `not-upstream` job that prints "This repository
    isn't ronneai/ronne-marketplace: nothing is published", and nothing else. A manual dry run
    (`workflow_dispatch`, `dry_run: true`) still runs the checks, which can be useful there.
- **Our schedules run only here.**
  - **Today:** the nightly run, CodeQL's weekly run and the weekly database run start on a schedule
    (`nightly.yml`, `codeql.yml`, `database.yml`). GitHub keeps them off in a new fork until its
    owner turns Actions on, but then they spend the fork's minutes every night.
  - **The change:** each scheduled start checks the repository
    (`github.event_name != 'schedule' || github.repository == 'ronneai/ronne-marketplace'`). Pushes,
    pull requests and manual runs are unchanged.
- **Private copies skip what needs GitHub Advanced Security.** On a private repository, CodeQL
  needs GitHub's paid Code Security. `codeql.yml`'s `analyze` job runs only when
  `github.event.repository.private` is false, and otherwise prints why. Nothing else in our CI needs
  a paid feature: the database, image and package jobs log in to Docker Hub only when
  `DOCKERHUB_READ_TOKEN` exists, and pull anonymously otherwise
  (`docs/knowledge/docker-hub-pulls.md`).
- **A check on the workflows themselves** (`packages/repo-tools/src/workflows.js` and its test, run
  by `pnpm test`, plain JavaScript with no new dependency). It fails when:
  - any workflow uses `pull_request_target` or `workflow_run`. These run with the base repository's
    secrets on a fork's pull request, the classic way to leak them; ours use `pull_request`, which
    gives a fork's code a read-only token and no secrets;
  - a job that has `environment:`, `contents: write`, `id-token: write` or a `secrets.` other than
    `DOCKERHUB_READ_TOKEN` and `GITHUB_TOKEN` lacks the repository guard;
  - a `schedule:` workflow lacks the schedule guard;
  - the guards don't all name the same repository, the one in the published packages'
    `repository.url` (`packages/core/package.json`).

  It reads the files line by line, as the other repo-tools checks do. If that proves fragile, the
  `yaml` package the web app already has is the fallback, after the dependency policy checklist.
- **The DCO: a sign-off on outside contributions.**
  - **What it asks:** every commit in a pull request from someone who isn't the owner, a member or a
    collaborator carries `Signed-off-by: Name <email>` (the
    [Developer Certificate of Origin 1.1](https://developercertificate.org/)). The email must match
    the commit's author email, or GitHub's noreply address for them.
  - **Who checks it:** a `dco` job in `pr-title.yml`, on `pull_request` with a read-only token,
    running `packages/repo-tools/src/dco.js` over `git log base..head`. Its failure says how to fix
    it (`git commit --amend -s`, or `git rebase --signoff <base>` and a force-push).
  - **What is exempt:** merge commits, and bots (`dependabot[bot]`, `github-actions[bot]`).
  - **The owner's own commits:** not required to sign off, and the local `commit-msg` hook doesn't
    require it. The owner's pull requests are `OWNER` (`author_association`).
  - **Squash merging:** the PR is squash-merged and its title becomes the commit on `main`, so the
    sign-offs are checked on the PR's commits, not on `main`'s. GitHub's squash message keeps the
    commits' trailers when the repository's default squash message includes the commit details; the
    runbook says to keep it so.
  - **Making it required:** the owner makes `dco` a required check in the branch ruleset (the new
    runbook below).
- **`CONTRIBUTING.md`:**
  - **A new section, "Running Ronne privately and contributing back":**
    - **A. Run the releases, keep only configuration private** (the recommended way). Install from
      the published image, server package or bundles (`docs/runbooks/install.md`), and keep
      `compose.yaml` overrides, settings and infrastructure in a private repository. There is no
      code to keep in step with, and contributing is the same as for anyone.
    - **B. A private copy with an `upstream` remote, plus a public fork for pull requests.** The
      commands: a bare clone pushed with `--mirror` into the private repository, then
      `git remote add upstream` and `git fetch upstream` with a merge to keep up. To give a change
      back:
      - fork publicly (an organisation or personal account);
      - branch from `upstream/main`;
      - cherry-pick or re-apply only the general part;
      - sign off, and open the pull request from the fork.

      The section explains why company-specific code should stay in configuration and why a
      private copy can't open a pull request itself (pull requests come from the fork network
      only).
    - **What our CI costs in a private copy.** A table of each workflow:
      - its runners: Linux, Linux arm64, Windows, macOS;
      - what it needs: Docker Hub pulls, Code Security for CodeQL;
      - which to keep: `ci.yml`'s checks, and `database.yml` when database code changes;
      - which to turn off or run by hand: the nightly, the end-to-end tests, Windows and macOS jobs,
        the image and packages.

      Private repositories pay for Actions minutes, at a higher rate on Windows and macOS. The
      table also covers turning Dependabot on or off.
    - **Security fixes:** a private copy gets no alert when we fix a vulnerability. Watch the
      repository's releases and security advisories, and read `SECURITY.md`'s supported versions.
  - **The License section:** adds the DCO sign-off and the `-s` flag.
- **A new runbook, `docs/runbooks/github-settings.md`:** the repository settings our CI and this
  feature rely on, for the owner to keep. Linked from `release.md`'s checklist, as "settings
  unchanged".
  - **Actions:**
    - require approval to run workflows for **all outside contributors**, not only first-time ones
      (so a stranger's pull request can't spend our runners or probe them before the owner looks);
    - the default `GITHUB_TOKEN` permission read-only;
    - fork pull requests never get secrets or write tokens (GitHub's default, kept).
  - **Environments:** `npm`, `dockerhub` and `version-bump`, each with its required reviewer and the
    branches and tags it allows.
  - **The branch ruleset:** its required checks, including `dco`, and its bypass actors.
  - **The squash message default:** title plus commit details.
- **A knowledge note, `docs/knowledge/forks-and-ci.md`:**
  - `pull_request` against `pull_request_target`;
  - what forks and private copies get (no secrets; schedules off until Actions is on);
  - the repository guard, and the workflows check that enforces it.

  Listed in `docs/knowledge/README.md`.
- **`SECURITY.md`:** a line for private copies: watch the advisories.

**Out** (and where it goes instead):
- **A CLA, or relicensing:** MIT with the DCO is enough to accept contributions. A CLA would only
  matter for changing the licence, which isn't planned.
- **Other CI systems** (GitLab, Buildkite): a private copy's own business.
- **GitHub Enterprise's private forks:** they exist only for private or internal upstream
  repositories, not ours.
- **Mirroring to other forges:** nothing in Ronne depends on GitHub except CI and releases.

## Behaviour

**Someone forks the repository and pushes `v9.9.9` by mistake.** Actions is off in a new fork, so
nothing runs. If they turned Actions on, `release.yml` runs only `not-upstream`, which says nothing
is published. Our npm packages and Docker Hub image can't be touched in any case: npm's trusted
publisher is tied to this repository, and the fork has none of our secrets.

**Acme mirrors Ronne into a private repository** and keeps its workflows. Pull requests run
`ci.yml` on Acme's minutes. CodeQL says it is skipped on a private repository, and the nightly
doesn't start by itself. Acme reads the cost table, turns off the end-to-end, Windows and macOS
workflows, and keeps the checks.

**Acme's developer fixes a bug for everyone.** They fork publicly, branch from `upstream/main`,
cherry-pick the fix, commit with `-s` and open a pull request. CI waits for the owner's approval to
run (the outside-contributor setting). Then `dco` passes, and the rest runs without secrets. The
owner witnesses the tasks, if any, and squash-merges.

## Edge cases

- **A fork renamed or under another owner:** `github.repository` differs, so the guard skips. A
  transfer of our own repository changes the packages' `repository.url` and the guards together,
  because the workflows check fails until both match.
- **A contributor's commit made in GitHub's web editor:** the editor's commit can carry a sign-off
  only if they type it. The failure message says how to amend.
- **A pull request with someone else's commits** (a co-author): each commit needs its own author's
  sign-off. `Co-authored-by` trailers don't count.
- **An email hidden by GitHub:** the noreply address `ID+login@users.noreply.github.com` matches.
- **A maintainer added later as a collaborator:** exempt from then on. Earlier pull requests are
  unchanged.
- **Dependabot:** exempt, and its title check is unchanged (`checkLength: false`).
- **A private copy that buys Code Security:** it can remove the condition from its own copy. The
  cost table says so.
- **The owner's own branch pushed to a fork by mistake:** the guards still skip publishing.

## Documentation

- **The website's Documentation:** none. This changes the repository, not the product, and how
  people contribute is in `CONTRIBUTING.md`.
- **In this repository:**
  - `CONTRIBUTING.md` (the new section, the DCO, the cost table);
  - `docs/runbooks/github-settings.md` (new), linked from `release.md`;
  - `docs/knowledge/forks-and-ci.md` (new);
  - `SECURITY.md`;
  - `docs/knowledge/test-runs.md`, where it describes the schedules.
- **Helpers:** none.

## Acceptance criteria

- [ ] Every job that publishes, pushes, or uses an environment or a write permission carries the
  repository guard. A tag push in a fork runs only `not-upstream`, and a dry run still runs the
  checks.
- [ ] The nightly, CodeQL's and the database's schedules start only in this repository, and manual
  runs work anywhere.
- [ ] `codeql.yml` skips `analyze` with a message on a private repository.
- [ ] The workflows check fails on `pull_request_target`, `workflow_run`, a missing guard and a guard
  naming another repository. It passes on today's workflows once the guards are in.
- [ ] The `dco` job fails an outside pull request with an unsigned commit or a mismatched email,
  passes one signed off, and exempts the owner, members, collaborators, bots and merge commits.
- [ ] `CONTRIBUTING.md`, the new runbook, the knowledge note (listed in its README), `SECURITY.md`
  and `test-runs.md` say what this spec says, and `pnpm docs:check` passes.

## Decisions

1. **Guard by repository name, not by whether secrets exist** (Claude): a fork that adds a secret of
   the same name still can't publish under our names, and the intent reads plainly in each job.
2. **Schedules guarded, pushes and pull requests not** (Claude): a fork's own CI should work on its
   own pushes; only what starts by itself is ours.
3. **A DCO for outside contributors, not a CLA** (owner, 2026-11-20, the recommended option): it is
   the lightest way for a company's employee to state they may contribute, and MIT stays MIT.
4. **The owner, members, collaborators and bots are fully exempt** (owner, 2026-11-20): `dco`
   doesn't run for them at all, not even as information.
5. **The workflows check is a test, not a new command** (Claude): `pnpm test` runs it on every
   commit and pull request with no new row in the commands table.

## Open questions

None.
