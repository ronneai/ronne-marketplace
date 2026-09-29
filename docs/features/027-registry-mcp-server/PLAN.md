# 027 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The library entry.** `@ronneai/rmk/lib`: the install pipeline as functions (targets,
  resolve, fetch, render, plan, apply, report) with no terminal in them.
  *Done when:* the CLI's commands use it and its tests still pass.

- [ ] **2. The server and the read tools.** `packages/mcp` over the chosen protocol library
  (through the dependency checklist), the config and token as `rmk` reads them, and
  `search_items`, `get_item`, `list_installed`, `check_outdated`.
  *Done when:* a test client lists the tools and gets the same answers as `rmk` from a fake registry.

- [ ] **3. Plans.** `plan_install`, `plan_update`, `plan_remove` and `apply_plan`, with expiry,
  staleness and conflicts.
  *Done when:* tests cover a plan that writes nothing, an apply that writes it, and expired, stale
  and conflicting plans refused.

- [ ] **4. `rmk mcp-setup`.** Registering and removing the server through the renderers and the
  state file.
  *Done when:* tests cover setup and `--remove` for Claude Code, leaving other entries alone.

- [ ] **5. End to end and documentation.** The built server driven by an MCP client against the
  Playwright instance, and the Documentation section and helpers.
  *Done when:* it passes in CI, and the docs render tests cover the new section.

## Notes

- Task 1: `packages/cli/src/operations.ts` holds `rmk install`, `update` and `remove` as
  `planOperation` (writes nothing) and `applyOperation`; the commands run both, and the server will
  run them one call apart. `installResolved` became `prepareInstall` + `commitInstall`, registry
  access moved to `connect.ts`, and `outdated`'s calculation to `outdatedItems`. `@ronneai/rmk/lib`
  (`src/lib.ts`) exports them; the package's `exports` now lists only `./lib` and `./package.json`.
- Moving the code found a bug: `rmk install --scope user` read `rmk.lock` from `~/.config/rmk/`
  instead of `user.lock`, so a second user-scope install forgot the first one's items. The shared
  `projectState` reads the right file; a test covers it.

