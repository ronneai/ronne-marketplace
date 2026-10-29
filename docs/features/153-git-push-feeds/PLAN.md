# 153 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - 078's spec says what it built and what 153 takes over; `docs/spec/plugin-feeds.md`'s "The git
    mirror" says the instance or `rmk feed build` writes it, with `skills/`, the folder and
    `README.md`.
  - `docs/features/README.md` lists 153 in M25.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The tree planner in core.**
  - Move the planning out of `packages/cli/src/feed-build.ts` into `@ronneai/core/plugins`: from the
    marketplaces and zips, the current files and `.rmk-feed.json`, the files to write and delete or
    the conflicts (078's rules), with the `skills/` tree and a folder prefix. `rmk feed build` keeps
    the folder and the API and calls it.
  - *Done when:* `feed-build.test.ts` passes unchanged; new core unit tests cover an empty tree, no
    change (no writes), a new version, a yanked one, each conflict kind, unsafe names, a symbolic
    link in the tree, the folder prefix, the `skills/` tree, and deterministic output (golden files).

- [ ] **3. Tables and settings.** [risky]
  - The `git_feeds` and `git_feed_workspaces` migration.
  - The service: a feed's settings (root), including and excluding a private workspace (its admins
    and root only), audit; personal workspaces refused.
  - *Done when:* db tests on the four databases cover each setting, who may include a workspace (a
    member who isn't admin, a moderator, an outsider refused), personal workspaces refused, and the
    audit events.

- [ ] **4. The push job.** [risky]
  - The scheduler's job, under its lease: feeds behind the catalogue revision or changed, the
    visibility from the included workspaces, 079's cached marketplaces, a shallow clone, the builder,
    one commit, a fast-forward push, one retry from a moved head; the status and reasons; Push now.
  - *Done when:* tests against the local git server cover the first push, no change, a release, a
    yank, a private workspace before and after inclusion, a personal one never, a conflict, a moved
    remote, a protected branch, a refused token, and two processes ticking at once (one push).

- [ ] **5. The screens.**
  - The feed in the repository's dialog (tools, folder, workspaces with their state, On, Push now,
    status); Git repositories on a private workspace's page for its admins; messages in the three
    languages.
  - *Done when:* component tests cover each state; an end-to-end test sets up a feed, releases an
    item and sees the commit on the local git server; the phone sweep passes.

- [ ] **6. Manual checks in the tools.**
  - Codex, Claude Code and `npx skills add` against a test repository on GitHub, filled once by the
    instance's push and once by `rmk feed build` (this is also 078's open task 6); the owner checks
    the Cursor import.
  - *Done when:* the results, with each tool's version and the date, are in this plan's notes, and
    078's notes link them.

- [ ] **7. Documentation.** The topics, sections and helpers in the spec's Documentation section,
  in ronne-web's `feat/153-git-push-feeds` branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
