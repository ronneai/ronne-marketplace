# A test that reads a file outside its package

Turborepo hashes a task from the files inside its package (and its dependencies' builds). A test
that reads a file **outside** the package, such as `compose.yaml` at the root, is not rerun when that
file changes: Turborepo restores the old pass from its cache.

## What happened (2026-10-30)

Feature 156 added the scanner ports to `compose.yaml` but not to the Caddyfile template in
`packages/server/src/service/caddyfile.ts`. `caddyfile.test.ts` compares the two, and it should have
failed. It didn't: `compose.yaml` isn't an input of `@ronneai/marketplace#test`, so CI kept reusing
a cached pass. The first change to a root file (a Dependabot bump of Biome, changing `package.json`
and the lockfile) invalidated the cache, the test ran, and every later pull request failed on
Node 22 and 24.

## The rule

When a test reads a file outside its package, name the file as an input in that package's
`turbo.json` (`"inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/<file>"]`, with `"extends": ["//"]`).
`packages/server/turbo.json` does this for `compose.yaml`. Put it on the package, not the root
`turbo.json`, so a change to the file doesn't rerun every package's tests.
