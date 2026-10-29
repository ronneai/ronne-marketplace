# 153 — Push the plugin marketplaces to git on every release

> Milestone: M25 · Depends on: 152, 076, 077, 079, 093, 114 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§15](../../MVP/MVP.md#15-decision-log) ("Git export") · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md) ("The git mirror")

> **Takes over from [078](../078-plugin-feed-mirror/SPEC.md) as the recommended way** (owner,
> 2026-10-29). 078 built `rmk feed build`, which writes the tree, and `--print-workflow`, a CI job
> that commits and pushes it (2748f56d). Here the instance pushes the same tree itself, to a
> repository root linked in 152, whenever the catalogue changes: no CI job, no `rmk` on a runner, no
> second token to keep alive. `rmk feed build` stays for a mirror built outside the instance, and
> both use one tree planner, moved from `packages/cli/src/feed-build.ts` into `@ronneai/core/plugins`.

## Goal

A Cursor team, a Codex user or anyone with another harness adds one git repository and gets the
instance's released items as plugins, kept current without anyone running anything (owner,
2026-10-29: "this marketplace can be used for any harness"). Root picks a repository from 152, the
tools and the workspaces, and the instance commits and pushes on every change.

## Scope

**In:**
- **A feed on a `push` repository** (Admin › Settings › Git repositories, the repository's dialog):
  - the **tools**: any of `claude-code`, `codex`, `cursor` (the three marketplaces of 078's tree) and
    `skills`, a plain Agent Skills tree for every other harness (below); all four by default;
  - the **workspaces**: the public workspaces' items always; a **private** workspace's only once one
    of its admins has turned it on for that repository (below); **personal** workspaces (114) never; an item imported with a permission note (154) only once root
    allowed it for that item;
  - the **folder** in the repository: the root by default, or a subfolder (`ronne/`), so a company can
    keep the marketplace beside other files;
  - **On** / **Off**, and **Push now**.
- **The tree**, 078's contract (`docs/spec/plugin-feeds.md`, "The git mirror"), plus `skills/`:
  ```
  .claude-plugin/marketplace.json     sources "./plugins/claude-code/<plugin>"
  .agents/plugins/marketplace.json    sources "./plugins/codex/<plugin>"
  .cursor-plugin/marketplace.json     sources "./plugins/cursor/<plugin>"
  plugins/<tool>/<plugin>/…
  skills/<plugin>/SKILL.md, …         every skill, and every rule or command whose Codex plugin form
                                      is a skill, rendered as an Agent Skills folder
  .rmk-feed.json                      what Ronne wrote: registry, tools, plugins, their sha256 and tree
  README.md                           only when the repository has none: how to add it in each tool
  ```
  The `skills/` tree is what `npx skills add <repo>` (Vercel's `skills` CLI) and any tool that reads
  `SKILL.md` folders find (checked 2026-10-29: the CLI looks in the root, `skills/` and
  `.agents/skills/`, among others).
- **The tree planner in `@ronneai/core/plugins`,** moved out of `rmk feed build`
  (`packages/cli/src/feed-build.ts`, which keeps only reading and writing the folder and calling the
  API): given the tool marketplaces and their zips, the repository's current files and its
  `.rmk-feed.json`, it returns the files to write and delete, or the conflicts. `rmk feed build`
  gains `skills/` from it too. 078's rules, unchanged: only Ronne's own paths are touched; a foreign path under
  `plugins/` or `skills/`, a plugin folder changed since Ronne wrote it, or a marketplace file Ronne
  didn't write is a **conflict**, and nothing is pushed; names must be one folder name; nothing is
  written through a symbolic link; the output is deterministic.
- **When it pushes:** a job (102's scheduler, under its lease, so one replica pushes) looks every
  minute for a feed whose last pushed **catalogue revision** (079) is older than the current one, or
  whose settings changed, and pushes it; plus Push now. A release, a yank, a deprecation, a dist-tag
  move, a rename (113, 118) or a visibility change all move the revision.
- **How it pushes:** a shallow clone of the branch (152's `GitRemote`), the builder, one commit
  (author `Ronne <noreply@<PUBLIC_URL host>>`, message `Update from Ronne: 2 added, 1 updated,
  0 removed`), a fast-forward push. Never a force push. When the remote moved during the run, it
  starts again once from the new head; a second miss waits for the next tick.
- **Nothing to push:** when the tree is unchanged, no commit is made.
- **Its status**, in the list and the dialog: last push (time, commit, the counts), or the last
  failure with a short reason: `conflict` (with the paths), `token refused`, `not found`,
  `unreachable`, `url refused`, `token unreadable`, `too large`, `push rejected` (a protected branch).
- **A private workspace's consent:** on the workspace's page, its admins (and root) see **Git
  repositories**: each push repository root linked, with a switch "Include this workspace's items".
  Turning it on asks first ("Everyone who can read <repository> will see this workspace's items, and
  what was pushed stays in its history"). Turning it off removes the workspace's plugins at the next
  push (the history keeps them; the dialog says so). Each change is audited.
- **Audit:** `git_feed.updated` (tools, workspaces, folder, on or off), `git_feed.workspace_included`
  / `.workspace_excluded`, and `git_feed.pushed` (commit, counts) or `git_feed.failed` (reason).
- **What each tool reads**, in the Documentation (vendor docs checked 2026-10-29):
  - **Cursor:** a team admin (Teams plan: one team marketplace; Enterprise: any number) imports the
    repository in Dashboard › Plugins › Team Marketplaces (GitHub; GitLab, Bitbucket and Azure DevOps
    since June 2026). **Auto Refresh** follows pushes to the tracked branch and needs Cursor's GitHub
    App on the repository; plugins added one by one are refreshed, new ones need the repository
    imported again.
  - **Codex:** `codex plugin marketplace add <owner>/<repo>` or a git URL (`--ref` for a branch);
    a private repository is cloned with the machine's own git credentials; `codex plugin marketplace
    upgrade` fetches it again.
  - **Claude Code:** `/plugin marketplace add <owner>/<repo>`, with the machine's git credentials for
    a private one, or the live feed (077), which needs no repository.
  - **Any other harness:** `npx skills add <repo>` installs from `skills/`, or the tool reads the
    folders directly.

**Out** (and where it goes instead):
- **Removing `rmk feed build` and its CI workflows** (078). They stay, for a mirror built outside the
  instance; the Documentation presents them as the second way.
- **Pull requests instead of pushes.** The instance pushes to its branch; a company that wants review
  on the host protects the branch and points the feed at another one.
- **Who can read the repository.** The git host's access rules; the Documentation says a repository
  that holds a private workspace's items must be private too.
- **One repository per workspace chosen by its admins.** Root links repositories (152).

## Behaviour

**Root sets up a feed.** In a push repository's dialog: the tools, the folder, the workspaces (public
ones listed as included; private ones listed with "Waiting for the workspace's admins" or "Included by
<name>"), On. Saving pushes within a minute.

**Which items.** Exactly the marketplace a caller who sees the public workspaces and the included
private ones would get from 077's routes (`?workspaces=`), built through 079's cache, so the git
repository and the live feed never disagree about an item's contents or sha256.

**Size.** A repository has no 5 MiB limit (that's Claude Code's URL marketplace), but a push larger
than 500 MiB of changes fails `too large` with the counts, so a misconfigured feed can't fill a host.

## Edge cases

- **Somebody edits a plugin folder on the host:** the next push stops with `conflict` and the path;
  root reverts it on the host, or removes the folder so Ronne writes it again.
- **The branch doesn't exist yet:** the first push creates it.
- **A protected branch refuses the push:** `push rejected`, with the host's message.
- **The token was revoked:** `token refused`; nothing is retried until the settings change or Push now.
- **A private workspace turned public later:** its items are in as public ones; its consent row stays
  but no longer matters. **Public turned private:** its items leave at the next push unless its admins
  include it.
- **A workspace renamed** (113) or **a scope moved** (115): the plugin names change; the old folders
  are removed and new ones written, with "Moved from" in the descriptions (`plugin-feeds.md`).
- **The repository removed in 152:** its feed goes with it; nothing is deleted on the host.
- **Replicas** (111): the job's lease keeps one push per repository at a time.

## Data

- A migration:
  - `git_feeds` (`repository_id` primary key, `enabled`, `tools` as JSON text, `folder`,
    `pushed_revision`, `pushed_commit`, `pushed_at`, `last_result`, `last_reason`, `last_paths`
    as JSON text, `updated_at`);
  - `git_feed_workspaces` (`repository_id`, `workspace_id`, `included_by`, `included_at`), only for
    private workspaces.
- `docs/spec/plugin-feeds.md`: "The git mirror" says the instance writes it (153) or `rmk feed
  build` does (078), and adds `skills/`, the folder option and `README.md`.

## Documentation

- **Plugin marketplaces** (`plugins`): *Codex and Cursor (git mirror)* (`plugins#mirror`) is
  rewritten: a repository from Git repositories, the feed's settings, adding it in Cursor (team
  admins), Codex and Claude Code, with `rmk feed build` and its CI workflow kept as the second way
  (a mirror built outside the instance); *Keeping the mirror current* (`plugins#mirror-updates`): pushes on
  every change, the status reasons and what to do about each, conflicts; a new *Any other tool*
  (`plugins#skills`): `skills/` and `npx skills add`.
- **Workspaces** (`workspaces#git`): including a private workspace in a repository, and that the
  history keeps what was pushed.
- **Git repositories** (152): a *Feeds* section linking to the above.
- `codex` and `cursor` topics: their *Plugins* section links to `plugins#mirror`.
- **Helpers:** the feed's "Which tools read this?" → `plugins#mirror`; the workspace page's "What
  does including this workspace do?" → `workspaces#git`.

## Acceptance criteria

- [ ] `rmk feed build`'s tests pass unchanged after its planner moves to core, and it writes the
  same bytes as the instance's push for the same feed.
- [ ] A feed pushes the three marketplaces, the plugin folders and `skills/` to an empty repository
  on the local git server; a second run with nothing new makes no commit.
- [ ] A release, a yank and a deprecation each produce one commit that changes only that plugin's
  folders and the marketplace entries, within a minute.
- [ ] A foreign path under `plugins/` or `skills/`, or a plugin folder changed on the host, stops the
  push with `conflict` and the paths, and nothing is pushed.
- [ ] Only the public workspaces' items are pushed until a private workspace's admin includes it;
  a personal workspace's items never are; a non-admin can't include one (server check); including
  and excluding are audited.
- [ ] The pushed marketplaces' entries and sha256 match what 077's routes answer for the same view.
- [ ] Never a force push: a moved remote is retried once from the new head, then waits.
- [ ] Each failure reason shows in the list and the dialog.
- [ ] Manual: Codex adds the test repository and installs a skill; Claude Code adds it and installs a
  plugin; `npx skills add` installs from `skills/`; the owner checks the Cursor import (Teams plan).
  Results go in PLAN.md's notes.
- [ ] The screens are in English, Portuguese and French, and pass the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **The instance pushes, as well as `rmk feed build`** (owner, 2026-10-29: export to a repository
   with credentials set in Ronne; Claude's design). It becomes the recommended way; 078's stays.
2. **A private workspace goes out only by its admins' choice** (owner, 2026-10-29): root linking a
   repository isn't enough, as the content is theirs and git history can't be taken back.
3. **A `skills/` tree for any harness** (Claude): the Agent Skills format is the one most tools read,
   and Vercel's `skills` CLI installs from it.

## Open questions

- Should root alone be able to include a private workspace (root is a member of none by default)?
- Should a feed be able to target a single scope rather than whole workspaces?
