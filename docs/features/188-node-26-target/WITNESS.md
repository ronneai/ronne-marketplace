# 188 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Probe Node.js 26 before changing anything

Witnessed: 2026-11-20 11:31 EST, by a fresh agent (blind). Commit: 788a01c5 (+ uncommitted docs diff). Machine: macOS 27.2 (Darwin 27.2.0, Apple silicon), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The working tree changes only `docs/features/188-node-26-target/SPEC.md`, `PLAN.md` and `docs/features/README.md`, untracked files included | yes | not met | `git status --porcelain --untracked-files=all` → 4 files: `apps/web/AGENTS.md` too (`# This is NOT the Next.js you know` → `## …`, mtime 11:24:24, a minute before the docs edits). Notes say "no repository change". None of the probe commands made this change: after all 11 commands, the scratch clone still showed only the 3 docs files |
| 2 | The probe used the newest Node.js 26, and pnpm installed by npm (not Corepack) | yes | confirmed | nodejs.org `index.json` → newest v26 is v26.13.1; `node --version` → v26.13.1; `bin/pnpm` → `../lib/node_modules/pnpm`, `npm ls -g` → pnpm@12.21.0, which runs the pinned `packageManager` pnpm@12.6.0 |
| 3 | `pnpm install --frozen-lockfile` passes on 26 starting with no `node_modules` | yes | confirmed | fresh `git clone` (no `node_modules`) → exit 0, "Packages: +366 … Done in 1.2s using pnpm v12.6.0". The packages came from the existing store; an empty store wasn't tried |
| 4 | `pnpm lint` passes on 26 | yes | confirmed | exit 0, "Checked 2516 files … Found 43 warnings. Found 4 infos." |
| 5 | `pnpm typecheck` passes on 26 | yes | confirmed | `pnpm typecheck --force` → exit 0, "7 successful, 7 total, Cached: 0 cached" |
| 6 | `pnpm test` passes on 26 | yes | confirmed | `pnpm test --force` → exit 0, 8/8 tasks, 0 cached, 1m21s. Test files: web 523, core 42, rmk 23, repo-tools 21, marketplace 15, mcp 5 (629 in total). Tests: web 6316 passed, 20 skipped |
| 7 | `pnpm build` passes on 26 | yes | confirmed | `pnpm build --force` → exit 0, 5/5 tasks, 0 cached, 12.7 s |
| 8 | `pnpm build:server` passes on 26 | yes | confirmed | exit 0 in 5.0 s, tsdown "Build complete" |
| 9 | `pnpm packages:check` passes on 26 | yes | confirmed | exit 0. core 132, rmk 69, mcp 19, marketplace 2492 files, "all on the allowlist" |
| 10 | `pnpm release:smoke` passes on 26 | yes | confirmed | exit 0. rmk 0.8.0, `--help`, rmk-mcp initialize, "rmk-server 0.8.0 started and answered 503 setup_required" |
| 11 | `pnpm dev` runs on 26 until the first screen loads | yes | confirmed | `pnpm dev` in the fresh clone → "✓ Ready in 199ms"; `curl -L /` → 200 at `/setup`, `<title>Set up · Ronne AI Marketplace</title>`. The notes say `next dev` ran, not `pnpm dev`, and got the sign-in page on an already set-up clone; this run covers `pnpm dev` itself |
| 12 | better-sqlite3 used a prebuilt binary on 26 and didn't build from source | yes | confirmed | its `package.json` has `"gypfile": false` and no install script; the install log has no build step; `probe-native.cjs` → the loaded `.node` file is `better-sqlite3/prebuilds/darwin-arm64.node`; `npm pack better-sqlite3@13.2.0 --dry-run` → the tarball ships 8 `prebuilds/*.node` and no `build/`. A leftover `build/` folder with no `.node` file comes from the pnpm store and isn't loaded |
| 13 | Notes record the Node.js version, the better-sqlite3 result and the scrypt test timings | yes | confirmed | PLAN.md "Node.js v26.13.1"; N-API, `prebuilds/<platform>.node`; "`crypto.test.ts` … 9 passed in 14 s". Witness: 14236 ms inside the full suite, about 12.6 s alone (9 tests). `probe-scrypt.mjs`: maxmem = 256·N·r is enough on 26 at N=2^17 (315 ms) and at the readers' limit N=2^18 (948 ms); v24.0.0 gives 344 / 893 ms |
| 14 | The server's two native modules are better-sqlite3 13.2.0 and @node-rs/argon2 | yes | confirmed | `packages/server/package.json:45-46` → dependencies are only `@node-rs/argon2` 2.2.2 and `better-sqlite3` 13.2.0; `.node` files in `.next/standalone` are only those two packages' binaries |
| 15 | Both are N-API, with one binary per platform for every Node.js version | yes | confirmed | `binding.gyp:21` `NAPI_VERSION=10`; `nm -u` → the better-sqlite3 prebuild has 60 `_napi_` imports and 0 V8 imports, the argon2 binary 48 `_napi_` imports and no V8 or `node::` imports; argon2's `package.json` has a `napi` block with one optional package per target; both load and work on v22.23.2, v24.0.0 and v26.13.1 (`probe-native.cjs`) |
| 16 | better-sqlite3 13.2.0 crashes on Node.js 22.12.0 and 22.13 because it needs N-API 10, which Node.js has only from 22.14.0 | yes | confirmed | official 22.12.0 build: `process.versions.napi` 9, `probe-native.cjs` → exit 139 (segfault); v22.11.0 → 139; v22.23.2 → works. `node_version.h` `NODE_API_SUPPORTED_VERSION_MAX`: 22.12.0 = 9, 22.13.1 = 9, 22.14.0 = 10. No 22.13 build was run here, so 22.13 rests on its header only |

**Overall:** not met: every command passes on Node.js 26.13.1 at 788a01c5 with only the docs diff, and the native-module and N-API claims hold, but the working tree also changes `apps/web/AGENTS.md`, which isn't one of the three docs files and isn't in the notes.

Fixed after this pass: `apps/web/AGENTS.md` reverted (the implementer's `next dev` probe had rewritten Next.js's managed block); the Notes now say what ran (`next dev -p`, on a set-up clone), the `PORT` behaviour of `pnpm dev`, and the rewrite and its revert.

### Re-check — rows 1, 11 and the changed Notes lines

Witnessed: 2026-11-20 11:33 EST, by a fresh agent (blind). Commit: 788a01c5 (+ uncommitted docs diff). Machine: macOS 27.2 (Darwin 27.2.0, Apple silicon), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The working tree changes only `docs/features/188-node-26-target/SPEC.md`, `PLAN.md` and `docs/features/README.md`, untracked files included | yes | confirmed | real repository, `git status --porcelain --untracked-files=all` (twice, at 11:31 and after the probe) → exactly those 3 files; `git diff --stat` → 3 files, 103+/27−; HEAD 788a01c5 |
| 11 | The dev server runs on Node.js 26 until the app's first screen loads | yes | confirmed | first pass: `pnpm dev` in the fresh clone → "Ready in 199ms", `curl -L /` → 200 `/setup`, `<title>Set up · Ronne AI Marketplace</title>`. This pass: `next dev -p 3189` from the clone's `apps/web` → "Ready in 181ms", `curl -L /` → `GET /sign-in 307`, then 200 at `/setup`, same title (the clone has no `.env`) |
| 17 | Notes: `pnpm dev` goes through Turbo, which doesn't pass `PORT` on, so it binds 3000; `next dev -p` picks the port | yes | confirmed | first pass: `PORT=7681 pnpm dev` → log `Network: http://192.168.1.28:3000`, `lsof` → `next-server` listening on 3000; `curl :7681` → 000. This pass: `next dev -p 3189` → `Local: http://localhost:3189`. Seen only with 3000 free, so "always" isn't tested with 3000 busy |
| 18 | Notes: `next dev` rewrites `apps/web/AGENTS.md`'s managed block, first heading `#` → `##` | yes | confirmed | clone clean before; `next dev -p 3189` → log "✓ Generated AGENTS.md for AI agents. Set `agentRules: false` in next.config to disable."; `git diff` → `-# This is NOT the Next.js you know` / `+## …`, index `643577df..af3b7c84`, the same blob the real repository had. The first pass's `pnpm dev` run didn't print that line or change the file |
| 19 | Notes: the rewrite isn't part of any task and was reverted | yes | confirmed | real repository: `apps/web/AGENTS.md` no longer shows in `git status` (row 1) |

**Overall:** met: the tree has only the three docs files, the dev server loads the first screen on Node.js 26, and the new Notes lines match what was reproduced.

## Task 2 — `pnpm test:runtime`

Witnessed: 2026-11-20 11:37 EST, by a fresh agent (blind). Commit: 838fcb43 + working tree (`git diff`: CONTRIBUTING.md, apps/web/vitest.config.ts, PLAN.md, package.json, turbo.json). Machine: macOS 27.2.1 arm64, Node v22.23.2 (test runs) and v26.13.1 (lint, docs:check).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | On Node.js 22, `pnpm test:runtime` passes | yes | confirmed | `pnpm test:runtime --force` on Node v22.23.2 (pnpm 12.6.0) → exit 0, `Tasks: 7 successful, 7 total`, `Cached: 0`. Test files passed: web 383, core 42, marketplace 15, rmk 23, mcp 5. Web: 4702 tests passed, 20 skipped |
| 2 | It runs no `repo-tools` test | yes | confirmed | `package.json:39` has `--filter=!@ronneai/repo-tools`. The run's tasks were core:build, core:test, marketplace:test, mcp:test, rmk:build, rmk:test, web:test; the only `repo-tools` line in the log is the script echo. `list-files.sh` → 0 repo-tools paths in the runtime list |
| 3 | It runs no `*.test.tsx` file | yes | confirmed | `RONNE_TEST_SCOPE=runtime vitest list --filesOnly` in each package → 0 `.test.tsx`. Without the variable, web lists 523 files, 140 of them `.test.tsx`; with it, 383. No `.test.tsx` exists outside `apps/web` (`git ls-files`). Mechanism: `apps/web/vitest.config.ts:18,49` |
| 4 | Every other test file runs, the `*.db.test.ts` SQLite tests included | yes | confirmed | Expected list from `git ls-files` (every `*.test.*` minus repo-tools and `.test.tsx`) → 468 files; the runtime Vitest lists of web, cli, core, mcp and server, merged → 468 files; `diff` → identical. The web runtime list has 199 `[db]` files (all 199 `*.db.test.ts` in git) and 184 `[unit]` files. No `*.db.test.tsx` exists |
| 5 | Vitest's CLI `--exclude` doesn't reach the web projects, so a config setting is needed | yes | confirmed | In `apps/web`, `vitest list --filesOnly --exclude '**/*.test.tsx'` → still 523 files, 140 `.tsx` |
| 6 | Turborepo can't hand a `test:runtime` result to `pnpm test`, or the other way round | yes | confirmed | `turbo.json:14` `env: ["RONNE_TEST_SCOPE"]`. `turbo run test --dry=json`: web#test hashes `b11c361a…` with the variable unset and `e7d3f126…` with `runtime`; after both runs each shows its own entry as HIT. Control: an undeclared `RONNE_UNDECLARED_PROBE=runtime` leaves the hash at `b11c361a…`. `packages/{core,server}/turbo.json` extend `//` and override only `inputs` |
| 7 | `pnpm test` is unchanged without the variable | no | confirmed | `pnpm test --force` on Node 22 → exit 0, `8 successful`. Test files: web 523, repo-tools 21, core 42, marketplace 15, rmk 23, mcp 5 |
| 8 | Notes record its time against `pnpm test` on the same machine | yes | confirmed | `PLAN.md:177-181`: 74 s against 83 s on Node 22.23.2 with `--force`. Witness's runs: 69.3 s and 82.0 s (`/usr/bin/time -p`) |
| 9 | It has a row in CONTRIBUTING.md's commands, and `pnpm docs:check` passes | no | confirmed | `CONTRIBUTING.md:208`; `pnpm docs:check` → exit 0 |
| 10 | The CONTRIBUTING row describes the command as it behaves now | no | partly | The row ends "CI runs it on the oldest supported Node.js", but `grep -rn test:runtime .github/` → no matches: no workflow runs it yet (task 3 adds that). The rest of the row is accurate |
| 11 | Lint passes on the changed files | no | confirmed | `biome check apps/web/vitest.config.ts package.json turbo.json` → exit 0, "Checked 3 files … No fixes applied" (only Biome's schema-version notice) |

**Overall:** not met: the script works on Node 22 and does what the spec says (exactly the 468 expected files, no `.tsx` or repo-tools files, separate cache keys), but the CONTRIBUTING row says CI runs it, and no workflow does yet.

Fixed after this pass: the CONTRIBUTING row drops the CI clause (task 3 adds it back with the job), and the witness's remark that only the unit project excluded `.tsx` is taken: both projects now exclude it through `runtimeExclude`.

### Re-check — rows 3, 4, 6 and 10, plus a planted `*.db.test.tsx`

Witnessed: 2026-11-20 11:41 EST, by a fresh agent (blind). Commit: 838fcb43 + working tree (`git diff`: CONTRIBUTING.md, apps/web/vitest.config.ts, PLAN.md, package.json, turbo.json). Machine: macOS 27.2.1 arm64, Node v22.23.2 (Vitest and turbo probes) and v26.13.1 (lint, docs:check).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | It runs no `*.test.tsx` file | yes | confirmed | `list-files.sh` (`vitest list --filesOnly` per package, Node 22): with `RONNE_TEST_SCOPE=runtime` web lists 383, 0 `.tsx`; without, 523. The exclusion sits in both projects: `exclude: [...dbInclude, ...runtimeExclude]` in unit and `exclude: runtimeExclude` in db |
| 4 | Every other test file runs, the `*.db.test.ts` SQLite tests included | yes | confirmed | Runtime lists of web, cli, core, mcp and server, merged (468) → identical to `expected.txt`. Web has 199 `[db]` files in both scopes. The full lists, repo-tools included, are identical to all 629 test files in git, so the db project's new `exclude: []` drops nothing in the full run |
| 6 | Turborepo can't hand a `test:runtime` result to `pnpm test`, or the other way round | yes | confirmed | `cache-hashes.sh` (`turbo run test --dry=json`): web#test `d51c715a…` with the variable empty, `677b04bf…` with `runtime` (both new, as the config is an input); `env` still `["RONNE_TEST_SCOPE"]`; core#test keeps separate hashes (`ddd5d1f8…`, `1834ae18…`) |
| 10 | The CONTRIBUTING row describes the command as it behaves now | no | confirmed | `CONTRIBUTING.md:208` reads "every suite but the component tests (`*.test.tsx`) and `repo-tools`", with no CI sentence; `grep -rn test:runtime .github/` → 0 matches |
| 12 | A `*.db.test.tsx` is left out by the runtime scope and included in the full run | yes | confirmed | Scratch copy of `apps/web` (config byte-identical by `cmp`) with a planted `src/zz-witness-probe.db.test.tsx`: full → 524 files, including `[db] src/zz-witness-probe.db.test.tsx`; runtime → 383, without it. Mutation: removing `exclude: runtimeExclude,` from the copy's db project → runtime lists 384, the planted file among them. Restored, `cmp` identical |
| 11 | Lint passes on the changed config, and `pnpm docs:check` passes | no | confirmed | `biome check apps/web/vitest.config.ts` → exit 0; `pnpm docs:check` → exit 0 |

**Overall:** met: `test:runtime` leaves out every `.test.tsx` from both web projects (a planted `.db.test.tsx` included) and keeps all 468 other files; the full run still lists all 629; the two runs keep separate cache entries; the CONTRIBUTING row matches what the command does now.
