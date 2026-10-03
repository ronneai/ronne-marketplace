# 082 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it. Start after the owner has chosen the command's name.

## Tasks

- [ ] **1. Spike: what goes in the package.** Pack the standalone build with `collect-native.mjs`'s
  logic and measure its size and install time with npm on macOS, Linux and Windows. Decide between
  a new `packages/server` (a thin package that copies the build in at pack time) and publishing
  `apps/web` itself. Recommended: `packages/server`, so `apps/web` stays private.
  *Done when:* the notes record sizes, times and the choice.

- [ ] **2. The package and its command.** `packages/server` with `bin: rmk-server`, the command
  table, the data folder per system, `RONNE_RUNTIME=npm`, `127.0.0.1:7650` by default, the browser
  on first start, the Node version check. Unit tests for the folder and argument logic.
  *Done when:* tests pass, and `pnpm pack` then `npm i -g ./…tgz` runs it on this machine.

- [ ] **3. Checks and release.** Add it to `packages:check`, `release:smoke`, `release:version` and
  `release.yml` (provenance, trusted publishing).
  *Done when:* a dry-run release packs and smoke-tests all four packages.

- [ ] **4. Three systems.** CI matrix (ubuntu, macos, windows × Node 22, 24): install the packed
  tarball, start, wait for `/api/health` = 503, run `setup --yes` with SQLite, health = 200.
  *Done when:* the matrix passes.

- [ ] **5. Documentation and decisions.** README, the Documentation section, MVP §5 and §15.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
