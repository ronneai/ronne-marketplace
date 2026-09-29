# 034 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Package metadata and contents.** `package.json` fields, READMEs and LICENSE for core,
  rmk and mcp; the `pnpm pack` allowlist check in CI.
  *Done when:* the check passes, and fails on an unexpected file.

- [x] **2. Versions and the smoke test.** `pnpm release:version` and `pnpm release:smoke`, the
  smoke test in CI on Node 22 and 24.
  *Done when:* both run locally and in CI.

- [ ] **3. The release workflow.** `release.yml` on a `vX.Y.Z` tag: checks, pack, smoke test,
  publish in order with provenance, GitHub release; the tag/version check.
  *Done when:* a dry run (`--dry-run` publish) passes in CI on a test tag, and the owner has set up
  trusted publishing.

- [ ] **4. First release and documentation.** `0.1.0` published; every "isn't on npm yet" replaced
  with the npm install.
  *Done when:* `npm install --global @ronneai/rmk @ronneai/mcp` works on a clean machine, and the
  docs render tests cover the new text.

## Notes

- Task 1: each package's `files` is `dist` without `.map` files: the maps point at sources that
  aren't published. `@ronneai/core`'s runtime dependencies were pinned exactly; they're `^` ranges
  now, as the dependency policy wants for published packages (the lockfile keeps the same
  versions). The MCP server's `src/testing.ts` is test-only, so its build leaves it out; `rmk` keeps
  shipping `dist/testing.js` (open question 4, built on the recommendation). `pnpm packages:check`
  (`packages/repo-tools/src/packs.js`) runs `pnpm pack --dry-run --json` per package, checks the
  files against an allowlist, and checks each LICENSE copy against the repository's; CI runs it
  after the build.
- Task 2: `pnpm release:version <version>` (`packages/repo-tools/src/release.js`) rewrites only the
  `"version"` line of the three `package.json` files; `sharedVersion` is what the release workflow
  will use to check a tag. `pnpm release:smoke` packs the three packages with pnpm, installs the
  tarballs into an empty folder with npm, checks no `workspace:` range survived, and runs
  `rmk --version`, `rmk --help` and an MCP `initialize` against `rmk-mcp`; CI runs it on Node 22
  and 24. It found that `rmk --help` exited with 2 (022's usage-error code): it exits 0 now, and
  `rmk` with no command still exits 2.

