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

- [x] **3. The release workflow.** `release.yml` on a `vX.Y.Z` tag: checks, pack, smoke test,
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
- Task 3: `.github/workflows/release.yml` runs on a pushed `vX.Y.Z` tag, or by hand with a tag and
  "dry run" (the default), which checks and packs without publishing. It checks the tag against
  the shared version (`release-check.js`), that npm is 11.5.1 or later (trusted publishing), runs
  every check plus `packages:check` and `release:smoke`, packs with pnpm (so `workspace:^` becomes a
  real range), then publishes each tarball with npm in dependency order, skipping a version already
  on npm, and creates the GitHub release with the tarballs attached. The tag reaches the shell only
  through an environment variable. The pack and dry-run publish steps were run locally.
- Each package's build now empties `dist/` first: `tsc` never removes output whose source is gone,
  and a stale `dist/testing.js` in the MCP server was caught by `packages:check` locally.
- Still to do for "done when", by the owner after this merges:
  1. GitHub → Settings → Environments: create `npm`, with the owner as required reviewer (and,
     optionally, only `v*` tags allowed to deploy).
  2. npmjs.com: for each of `@ronneai/core`, `@ronneai/rmk` and `@ronneai/mcp`, add a trusted
     publisher: GitHub Actions, `ronneai/ronne-marketplace`, workflow `release.yml`, environment
     `npm`. (A package must exist before its settings do; if npm doesn't allow setting a trusted
     publisher before the first version, the first publish needs a one-off token, then the
     setting "disallow tokens".)
  3. npmjs.com: two-factor authentication on; after the first release, each package set to
     "require two-factor authentication and disallow tokens".
  4. GitHub → Settings → Rules: a tag ruleset so only admins create or delete `v*` tags.
  5. Run the Release workflow by hand with a tag `v0.1.0` and "dry run", then push the tag.
- Task 4, in part: the three packages are at `0.1.0` (`pnpm release:version 0.1.0`), so pushing the
  tag `v0.1.0` after the owner's npmjs.com setup publishes the first release. The rest of task 4
  (the docs saying "npm install") waits for that release to exist, in its own change, since the
  Documentation says only what's true.
- npm offers no trusted publisher for a package that doesn't exist yet (checked with the owner,
  2026-09-29), so `release.yml` passes the `npm` environment's `NPM_TOKEN` secret, when there is
  one, as `NODE_AUTH_TOKEN`: the first release uses a granular token limited to `@ronneai`,
  expiring in 7 days; then each package gets its trusted publisher, the secret is deleted, the
  token revoked, and publishing goes back to OIDC alone.
- The first dry run of `release.yml` (2026-09-29) passed every check and the packing, then failed
  to publish: `npm publish release/x.tgz` reads the path as a GitHub `user/repo` and runs `git
  ls-remote`. The tarball paths start with `./` now. Running the steps locally hadn't caught it
  because that run used absolute paths.

