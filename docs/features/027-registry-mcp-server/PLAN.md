# 027 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The library entry.** `@ronneai/rmk/lib`: the install pipeline as functions (targets,
  resolve, fetch, render, plan, apply, report) with no terminal in them.
  *Done when:* the CLI's commands use it and its tests still pass.

- [x] **2. The server and the read tools.** `packages/mcp` over the chosen protocol library
  (through the dependency checklist), the config and token as `rmk` reads them, and
  `search_items`, `get_item`, `list_installed`, `check_outdated`.
  *Done when:* a test client lists the tools and gets the same answers as `rmk` from a fake registry.

- [x] **3. Plans.** `plan_install`, `plan_update`, `plan_remove` and `apply_plan`, with expiry,
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
- Task 2, the dependency checklist (`docs/policies/dependencies.md` §3), for `@ronneai/mcp`:
  - **`@modelcontextprotocol/sdk` `^1.30.1`.** *Need:* the protocol's reference implementation
    (JSON-RPC over stdio, capability negotiation, schemas); writing it by hand means tracking the
    protocol ourselves. *License:* MIT; the whole tree passes `pnpm licenses:check`. *Health:*
    maintained by the Model Context Protocol organisation, releases every few weeks, very widely
    used. *Advisories:* three on osv.dev, all high, fixed in 1.24.0, 1.25.2 and 1.26.0; none
    affects 1.30.1; `pnpm audit` finds nothing. *Install scripts:* none. *Weight:* the heaviest
    Ronne adds, 82 packages, most for the HTTP transports (express, hono) that the stdio server
    doesn't load. 1.31.0 came out on 2026-09-28, inside `minimumReleaseAge`'s three days, so the
    range starts at 1.30.1 (2026-09-23).
  - **`zod` `^4.6.5`.** The SDK's peer dependency, for the tools' input schemas. MIT, no
    dependencies, one old advisory fixed in 3.22.3, no install scripts.
- `@ronneai/rmk` now ships `dist/testing.js` (the fake registry and I/O, a few KB with no test-only
  dependencies) as `@ronneai/rmk/testing`, so the server's tests use the same fixtures as `rmk`'s,
  and `run` from it, so they compare answers with `rmk`'s own output.
- Task 3: a plan's fingerprint (`operationFingerprint` in `@ronneai/rmk/lib`) hashes the lockfile,
  the state file, the project config and every file or folder the plan writes, removes or keeps;
  `apply_plan` refuses with `plan_stale` when it differs. A plan is applied once, then forgotten.
  A plan with conflicts gets a `planId` too, and `apply_plan` refuses it with `conflicts`. Every
  `plan_*` tool is annotated read-only (it writes nothing to the project; the download cache is
  `rmk`'s own), and `apply_plan` destructive, so it's the call the AI tool asks the person about.
  When several tools look used, the plan answers `no_target` asking for `targets`.

