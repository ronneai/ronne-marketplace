# 034 — Publishing `rmk` and the MCP server to npm

> Milestone: M6 · Depends on: 022, 027 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) (npm packages), [§15](../../MVP/MVP.md#15-decision-log) (Packages, Package registry) · Policy: [`docs/policies/dependencies.md`](../../policies/dependencies.md)

## Goal

Anyone can install `rmk` and the registry MCP server with one command, `npm install --global
@ronneai/rmk @ronneai/mcp`, instead of building them from a clone. Releases are repeatable,
signed with npm provenance, and checked before they go out, and the app stops saying "isn't on npm
yet".

## Scope

**In:**
- Publishing `@ronneai/core`, `@ronneai/rmk` and `@ronneai/mcp` to npmjs.com under `@ronneai`
  (MVP §15), `rmk` and `rmk-mcp` as their binaries.
- Their `package.json` metadata, what each package contains, and a README and LICENSE in each.
- One version for the three, set by a release command, and a GitHub Actions workflow that
  publishes on a release tag, with provenance.
- Checks before publishing: the packed contents, and a smoke test that installs the tarballs and
  runs both binaries.
- Updating everything that tells people to build from a clone.

**Out** (and where it goes instead):
- `@ronneai/marketplace` (MVP §5's `pnpm dlx @ronneai/marketplace init` installer): a feature of
  its own, since the web app isn't a library.
- The Docker image on a registry: the image is built in CI (005); publishing it is separate.
- A changelog tool or automated version bumps from commit messages: a GitHub release's notes are
  enough for now.

## Behaviour

**Versions.** The three packages share one version, starting at `0.1.0`: `rmk` and the server are
built against the same core, and `workspace:^` becomes `^0.1.0` when pnpm packs them. `pnpm
release:version <semver>` sets it in all three `package.json` files (and nowhere else) and checks
the result with `pnpm install --frozen-lockfile`. `rmk --version` and the MCP server's
`serverInfo.version` already read their own `package.json`.

**Package contents.** Each package gets `repository`, `homepage`, `bugs`, `keywords`, `engines`
(Node 22.12 or later), `publishConfig: { access: "public", provenance: true }`, a README for its
npm page, and the repository's LICENSE. `files` stays `dist` (plus README and LICENSE). What each
package holds is checked in CI with `pnpm pack` against an allowlist: no tests, no sources, no
maps unless decided, and `@ronneai/rmk` ships `testing` (027) only if the open question keeps it.

**The workflow** (`.github/workflows/release.yml`): on a pushed tag `vX.Y.Z` matching the
packages' version, it runs the full checks (lint, typecheck, test, build, licenses, audit), packs
the three packages, runs the smoke test on the tarballs, then publishes them in dependency order
(core, rmk, mcp) with provenance, and creates a GitHub release for the tag. It uses npm's
**trusted publishing** (OpenID Connect from GitHub Actions, no long-lived token), which the
owner sets up once on npmjs.com for each package (see Open questions). A failed step publishes
nothing; a partially published release is finished by re-running, since each `publish` skips a
version that's already there.

**The smoke test** (`pnpm release:smoke`, also run in CI on every pull request that touches the
packages): installs the packed tarballs into an empty folder with npm, as a user would, then runs
`rmk --version`, `rmk --help`, and starts `rmk-mcp` and completes an MCP `initialize` over stdio.

**Pinning.** Published packages keep `^` ranges for their runtime dependencies (dependency policy
§2); the release checks that none of them resolves to a version with a known high or critical
advisory, as CI already does.

**Once published**, the defaults change to match: `rmk mcp-setup` keeps `rmk-mcp` as the command,
which now works after the global install, and every place that says "isn't on npm yet" says how to
install it instead.

## Edge cases

- **The tag doesn't match the packages' version:** the workflow stops before publishing.
- **A version already on npm:** npm refuses to replace it (versions are immutable, as ours are);
  the workflow treats that package as done and carries on with the next.
- **Node 22 on the user's machine:** the smoke test runs on 22 and 24, as CI does.
- **A user who built from a clone and linked it:** still works; the docs mention unlinking before
  installing from npm.

## Documentation

- **Installing with rmk → Getting rmk:** `npm install --global @ronneai/rmk` (and `@ronneai/mcp`
  for the server), with the Node version; building from a clone becomes a note for contributors.
- **Registry MCP server → Setting it up:** the npm install, and `--command` only for a clone.
- **Sign-in page** (the CLI panel's "Get rmk" step) and the **README**: the npm install.
- **Each package's README** on npm: what it is, how to install, and a link to the instance's
  Documentation.

## Acceptance criteria

- [ ] The three packages share a version set by `pnpm release:version`, and the lockfile stays frozen.
- [ ] `pnpm pack` contents match an allowlist in CI; each package has its README, LICENSE and metadata.
- [ ] The smoke test installs the tarballs with npm and runs `rmk` and an MCP `initialize` against `rmk-mcp`, in CI on Node 22 and 24.
- [ ] A tag `vX.Y.Z` publishes core, rmk and mcp with provenance and creates a GitHub release; a mismatched tag publishes nothing.
- [ ] The first release (`0.1.0`) is on npmjs.com, and `npm install --global @ronneai/rmk @ronneai/mcp` gives working `rmk` and `rmk-mcp`.
- [ ] No page, README or helper says "isn't on npm yet"; the Documentation says how to install from npm.

## Open questions

The owner started 034 (2026-09-29) without answering these, so it's built on the recommendations
(trusted publishing, one version, `0.1.0`, `rmk` keeps its `testing` entry); any can still change.

1. **Trusted publishing** (recommended: no token to leak or rotate, and provenance comes with it;
   the owner links each package to this repository's release workflow on npmjs.com once), or an
   `NPM_TOKEN` secret with publish rights.
2. **One version for the three packages** (recommended: they're built and tested together), or a
   version each.
3. **Start at `0.1.0`** (recommended: the MVP isn't finished, and 0.x tells people the API may
   still change), or `1.0.0`.
4. **Keep `@ronneai/rmk/testing` in the published package** (it lets other tools test against
   `rmk`'s fake registry, and is a few KB), or leave it out of the package and have the MCP
   server's tests use the sources.
