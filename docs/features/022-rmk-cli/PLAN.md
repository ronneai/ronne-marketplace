# 022 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Foundations.** Argument parsing, the user config (mode `0600`, env overrides), the API
  client with its errors, `--json` output and exit codes; `login`, `logout`, `whoami`.
  *Done when:* unit tests cover the config file's permissions, env overrides and parsing; and tests
  against a stub server cover login by password and by token, logout offline, and API errors.

- [x] **2. Reading the registry.** `search`, `info`, `list`, `platforms`.
  *Done when:* tests against a stub server cover each, in text and `--json`.

- [x] **3. The applier.** Planning changes against the state file and the disk, conflicts and
  `--force`, JSON key editing, sections, atomic writes, and the state file itself.
  *Done when:* unit tests over a temporary folder cover every change kind created, replaced,
  removed, edited by the user (conflict) and missing, plus unmanaged content left alone.

- [x] **4. Install.** Targets, resolution, downloads with the cache and checksums, rendering, and
  writing `rmk.config.json` and `rmk.lock`.
  *Done when:* tests cover a fresh install, a reinstall from the lockfile, a checksum mismatch, an
  unsupported type's warning, missing env vars, and user scope.

- [x] **5. Update, outdated and remove.**
  *Done when:* tests cover updating within a range, a yanked locked version, outdated's columns, and
  removing an item with dependencies still needed by another.

- [x] **6. End to end.** Against a built instance with a published item: install into a temporary
  project with the reference renderer, update after a new release, remove.
  *Done when:* it passes in CI.
- [x] **7. Documentation.** The rewritten Installing with rmk topic, the item page's helper, and the
  Deprecate or yank section.
  *Done when:* the docs render tests cover the new sections, and no page still says `rmk` isn't
  released.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 022 without answering the
  spec's open questions: a download cache keyed by sha256, and `install <item>` records `latest`.
  Resolution goes through `POST /resolve` (020's answer).
- **Task 1 (2026-09-28): foundations.** `packages/cli` now depends on `@ronneai/core`
  (`workspace:^`). `io.ts` is everything outside rmk's code (env, home, cwd, fetch, prompts), so
  tests run against `testing.ts`'s fake registry and temporary folders. `config.ts`: the user
  config (0700 folder, 0600 file, refused when other users can read it, `RMK_TOKEN` and
  `RMK_REGISTRY` over it). `api.ts`: the client with `ApiError` (the registry's code and message,
  or `unreachable`), `User-Agent: rmk/<version>`, and `checkRegistryUrl` (http only for localhost
  or `--insecure`). `output.ts`: sentences, or one JSON object with `--json`; exit codes 1, 2, 3
  through `RmkError`. `cli.ts`: `login` (password prompt with echo off, or `--token` checked with
  `GET /me`; the first registry becomes the default), `logout` (revokes on the server when it can,
  removes the token either way), `whoami`. The password prompt is Node's own readline, so the CLI
  still has no dependency beyond core.
- **Task 2 (2026-09-28): reading the registry.** `project.ts` reads and writes `rmk.config.json`
  and `rmk.lock` (sorted keys, two spaces, a trailing newline, written through a rename) and splits
  `@scope/name@version`. `registry-commands.ts`: `search` (019's `/items`, with `--type` and
  `--scope`, marks for risk, deprecation, yanked and uninstallable), `info` (the item, its tags
  and versions, and the latest or asked-for version's dependencies and risk flags), `list` (the
  config's dependencies, or `--installed` from the lockfile) and `platforms` (021's `RENDERERS`
  with what each supports).
- **Task 3 (2026-09-28): the applier.** `apply.ts`: `planChanges` compares every wanted change
  with `.rmk/state.json` and the disk (`diskHash`, per kind) before anything is written: create,
  replace, unchanged, remove, `gone` (the user removed it: dropped, and rendered again only when
  wanted) or a conflict (`unmanaged`, or `edited` since rmk wrote it), which `--force` overrides.
  An identical change from two targets becomes one entry with both targets; different content for
  one place is `name_clash`. `applyPlan` writes through a temporary file and a rename, edits JSON
  key by key keeping the file's other keys and indentation, appends and removes array elements by
  their canonical hash, and fences sections; an object left empty by its last key is removed.
  `toml-key` waits for the Codex renderer (024). A section change now carries the body only and
  rmk adds the fences (021's spec updated), so the state file's hash of "the text between the
  fences" is what the renderer's change hashes too.
- **Task 4 (2026-09-28): install.** `install.ts`: the targets come from `--target` (ids, or
  `all`), else the config's `targets`, else each renderer's `detect()` over the project (one match
  wins; several ask at a terminal; none fails with `no_target`, except that with one renderer built
  in and a terminal it says so and uses it). Resolution is one `POST /resolve` with the config's
  dependencies and the lockfile's versions as `locked`; with no arguments and a lockfile, that
  installs exactly the lockfile. Artifacts come from `~/.cache/rmk/artifacts/<sha256>.tgz` or are
  downloaded and checked against the resolution's sha256 (and the `X-Checksum-Sha256` header): a
  mismatch stops before anything is written. Each item is unpacked and rendered for every target;
  a type a target can't take is a warning. The applier plans everything, and only with no
  conflicts are the files, `.rmk/state.json`, `rmk.lock` and `rmk.config.json` written (a bare
  `install <item>` records `latest`; `--target` is saved as the config's `targets`). Conflicts exit
  with 3. User scope writes under the home folder, with `user.lock` (carrying the direct
  dependencies) and `user-state.json` under `~/.config/rmk`. Core gains `isVersionRange`. The
  registry never sees who installs what: only downloads are counted (019).
- **Task 5 (2026-09-28): update, outdated and remove.** `manage.ts`, over the install pipeline:
  `update` re-resolves with the named items unlocked (all, when none are named) and says what
  moved; `outdated` resolves once with no locks for "wanted" and reads each item for "latest";
  `remove` re-resolves without the items and lets the applier delete what the resolution no longer
  holds, dependencies nothing else needs included, then rewrites the config. The fake registry in
  `testing.ts` is shared by the install and manage tests.
- **Task 7 (2026-09-28): documentation.** Installing with rmk is rewritten as built: What rmk
  does, Logging in, Installing (target, resolve, download and check, write), Keeping items up to
  date, The files it writes (which to commit), Your own edits (conflicts, exit 3, `--force`), then
  Tokens and the API and Claude Code. "When it arrives" is gone, and the overview's install step
  links to Installing. The item page has "How do I install it?" by the install commands, and
  Deprecate or yank says what rmk prints and that a pinned yanked version still installs.
- **Task 6 (2026-09-28): end to end.** `apps/web/e2e/rmk.e2e.ts` runs the built CLI
  (`packages/cli/dist/bin.js`; `pnpm test:e2e` now builds it) against the Playwright instance:
  a token from `POST /api/v1/auth/token`, then `install` of a seeded agent (which brings the skill
  and MCP server it needs, and lists the env var to set), `install` of a hook pinned at 1.0.0,
  `outdated`, `update` to 1.1.0, and `remove` of both, with a file and a setting of the user's
  left untouched. It's also 023's end-to-end criterion (skill, agent, hook, MCP server). It caught
  one bug: updating an item whose setting is an array element added the new element without
  removing the old one; `planChanges` now removes a changed element before the new one is written.
  The skill's version isn't asserted exactly, since another test releases a newer one first.
- **Getting rmk (2026-09-28, owner's question).** The Documentation now says how to get `rmk`
  itself: not on npm yet, so built from the repository (`pnpm build`, then
  `node packages/cli/dist/bin.js`, or `npm link` in `packages/cli`), with the npm command it will
  have once published. Publishing is the release chore after M4 (spec, Out).
- **The sign-in page's terminal guide (2026-09-28, owner's request).** The "CLI authentication"
  box was too small and said nothing about getting `rmk`. It's now "Use rmk from the terminal",
  beside the sign-in card on wide screens and below it on phones, as three numbered steps with
  copyable commands: get rmk (the repository's commands, since it isn't on npm yet, with a link to
  the README), sign in (`rmk login --registry <this instance's URL>`, or with a token), then
  `rmk whoami` and `rmk install`. `CopyableCommand` gained `wrap`, so long commands wrap instead of
  clipping. The same panel is on the Access tokens page. The README's `rmk` section and status
  line say the same.
