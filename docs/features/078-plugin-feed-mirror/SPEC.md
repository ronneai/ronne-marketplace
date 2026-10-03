# 078 — Plugin feed git mirror for Codex and Cursor

> Milestone: M11 · Depends on: 076, 077 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md)

## Goal

Codex and Cursor only add plugin marketplaces from a git repository. Cursor also needs a team admin
to import it. `rmk feed build` writes a Ronne instance's feed as a repository tree, and a scheduled
CI job keeps that repository current. Codex users then run `codex plugin marketplace add <repo>`, and
a Cursor team admin imports the repo. Claude Code users without instance tokens can add it too.

## Scope

**In:**
- The 077 routes for `codex` and `cursor`: `GET /api/v1/feeds/{codex,cursor}/marketplace.json` and
  their zips. These marketplaces use the same `archive` entry shape as Claude Code's. Only `rmk`
  reads them.
- `rmk feed build --out <dir> [--tools claude-code,codex,cursor]`.
- `rmk feed build --print-workflow [github|gitlab]`: a ready CI file that runs it on a schedule.
- The Documentation for the mirror.

**Out:**
- Serving git from the instance. No tool can add a plain HTTPS source except Claude Code (077), and
  serving git would mean a git implementation in the web app.
- Pushing. rmk writes the tree; the CI job (or a person) commits and pushes it with the git host's own
  credentials.
- Who can read the repository. That is up to the git host: a private repo and its access rules are
  the access control.

## Behaviour

**`rmk feed build --out <dir>`.**
- Needs a token, like any rmk command. In CI it reads `RMK_TOKEN` and `RMK_REGISTRY`.
- For each tool (all three by default), it fetches `marketplace.json`, downloads each zip whose
  sha256 isn't already in `<dir>/.rmk-feed.json`, checks the sha256, and unpacks it to
  `plugins/<tool>/<plugin>/`.
- It writes each tool's marketplace file with relative `path` sources (076's `marketplaceFor`):
  `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json` and
  `.cursor-plugin/marketplace.json`.
- It deletes plugin folders that `.rmk-feed.json` says it wrote and that aren't listed any more.
- It writes the new `.rmk-feed.json` (registry, tools, plugins with version and sha256).
- **It touches nothing else.** A path under `plugins/` that rmk didn't write stops the build with a
  conflict, unless `--force` is given.
- The output is deterministic: a run with nothing new released leaves the tree unchanged, so CI
  makes no commit.
- `--json` prints what was added, updated and removed.

**The mirror's marketplaces.** Codex also reads `.claude-plugin/marketplace.json`, but Claude Code's
plugin layout isn't Codex's. So the Codex file is written to `.agents/plugins/marketplace.json`,
which Codex reads first.

**The CI workflow.** `--print-workflow github` prints a GitHub Actions workflow that:
- runs daily, and on demand (`workflow_dispatch`);
- installs Node 24 and `rmk` from npm, pinned to the version that printed it;
- runs `rmk feed build --out .` with the `RMK_TOKEN` and `RMK_REGISTRY` secrets;
- commits and pushes when anything changed, as `github-actions[bot]`.

The GitLab variant is the same, as a `.gitlab-ci.yml` job on a schedule. The token should belong to
a dedicated account: the build reads what that account can read.

**Adding it in each tool:**
- Codex: `codex plugin marketplace add <owner>/<repo>` (or a git URL); then `codex plugin` to install.
- Cursor: a team admin (Teams or Enterprise plan), Dashboard › Settings › Plugins › Team
  Marketplaces › Import, with the repository's URL (GitHub, GitLab, Bitbucket or Azure DevOps).
  On a GitHub import, **Enable Auto Refresh** updates the plugins on every push.
- Codex: `codex plugin marketplace upgrade` fetches the mirror again.
- Claude Code: `/plugin marketplace add <owner>/<repo>`.

## Edge cases

- A zip whose sha256 doesn't match the marketplace stops the build, and nothing is written.
- The instance is unreachable, or the token is revoked: the build fails, and the tree is left as
  it was.
- A plugin that moves from one version to the next has its folder replaced as a whole, so no files
  from the old version are left behind.
- `--tools codex` leaves the other tools' folders and marketplace files alone.

## Documentation

- The **Plugin marketplaces** topic (077) gains:
  - *Codex and Cursor (git mirror)*: why a repository; `rmk feed build`; the CI workflow; adding it
    in Codex and in Cursor (team admins only).
  - *Keeping the mirror current*: the schedule; the dedicated account's token; what happens when it
    expires.
- `codex` and `cursor` topics: a *Plugins* section linking to it.
- `rmk` topic: `feed build`.

## Acceptance criteria

- [ ] `rmk feed build` into an empty folder writes the three marketplaces and the plugin folders, and a second run changes nothing.
- [ ] A new release updates only that plugin's folder and its marketplace entries; a yanked version's folder is removed.
- [ ] Files rmk didn't write are untouched, and a foreign path under `plugins/` stops the build without `--force`.
- [ ] A sha256 mismatch fails the build and writes nothing.
- [ ] `--print-workflow github` and `gitlab` print workflows that parse as YAML and match their golden files.
- [ ] Manual: `codex plugin marketplace add` on a test repository lists the items, and a skill installs and works. The Cursor import is checked by the owner (Teams plan). Results are recorded in PLAN.md's notes.
- [ ] The Documentation lists above say what the feature does now.

## Open questions

- Does Codex use the machine's git credentials for private repositories? The docs still don't say
  (re-checked 2026-10-03). The Documentation says Codex clones the repository with git, so a
  private one needs git on that machine to be able to clone it; task 6 checks it with a private
  test repository.
