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

## Task 3 — The CI split by role

Witnessed: 2026-11-20 11:47 EST, by a fresh agent (blind). Commit: 31020b45 + working tree (`git diff`: ci.yml, server-checks.yml, CONTRIBUTING.md, PLAN.md). Machine: macOS 27.2.1, Node v24.0.0 (probe run on v26.13.1).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both workflows parse | yes | confirmed | actionlint isn't installed (not installed by the witness). `probe.mjs` (yaml 2.9.1, `parseDocument` with `uniqueKeys: true`) → no errors for ci.yml or server-checks.yml; jobs `changes, checks, witness, dependencies, e2e, clients-windows, e2e-result` / `install, service-linux, service-macos` |
| 2 | ci.yml's matrix is `include: [{node: 22, role: minimum}, {node: 24 (26 in task 4), role: target}]` and expands to 2 jobs | yes | confirmed | ci.yml:43-49: an include-only matrix that also carries `name`. The probe applies GitHub's include rules → 2 jobs, `{22, minimum}` and `{24, target}`; no third version |
| 3 | The job names are "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)" | yes | confirmed | ci.yml:33 `name: ${{ matrix.name }}`; the probe expands it to exactly these two strings. The job's `if: !cancelled()` is unchanged, so it isn't skipped whole (which would show the name unexpanded) |
| 4 | No `if:` names a Node.js version; steps check `matrix.role` | yes | confirmed | `grep -n "if:" ci.yml server-checks.yml \| grep -E "22\|24\|26\|matrix\.node"` → nothing (exit 1); the probe flags none. Mutation in a scratch copy (one `matrix.role == 'target'` back to `matrix.node == 24`) → the probe prints "IF NAMES VERSION" for every step |
| 5 | The target job has every step the old Node 24 job had | yes | confirmed | The probe evaluates each step's `if:`. Old `{node:24}`: checkout, pnpm setup, setup-node, cache, install, lint, typecheck, test, build, build:server, packages:check, release:smoke. New `{role:target}`: the same 12, in the same order |
| 6 | The minimum runs `pnpm install --frozen-lockfile` and `pnpm test:runtime` (and nothing of the target's) | no | confirmed | Probe, `{role:minimum}`: checkout, pnpm setup, setup-node, cache, install, test:runtime (ci.yml:83). Lint, test, build and packing are gated on `role == 'target'`. `turbo run test --filter=!@ronneai/repo-tools --dry=json` → config, core, marketplace, mcp, rmk, web; `test` dependsOn `^build`, so no separate build step is needed |
| 7 | A documentation-only pull request still skips every step in both jobs, and both still report | no | confirmed | `checks`: 14 steps, 13 with `if: needs.changes.outputs.code != 'false'`, the echo step with `== 'false'`; the job-level `if: ${{ !cancelled() }}` is unchanged |
| 8 | server-checks.yml's install matrix is minimum and target on every OS, each with its role, no middle version, 6 jobs | yes | confirmed | server-checks.yml:27-36: `os` × `node: [22, 24]` + `include` adding `role` per node → 6 jobs, each with a role (e.g. "Install and run (windows-latest, Node 22, minimum)"). Mutation adding `{node: 23, role: target}` → 7 jobs |
| 9 | Turbo cache key stays per Node.js version | no | confirmed | ci.yml:70-71 `key: turbo-${{ runner.os }}-node${{ matrix.node }}-${{ github.sha }}`, restore-keys the same, unchanged from 31020b45 |
| 10 | The comments are updated | no | partly | Old comments naming 22 and 24 replaced (ci.yml:27-31, 74-75; server-checks.yml:29-31). But server-checks.yml:31 says "a repo-tools test keeps it so (188)", and ci.yml:30-31 points to test-runs.md for the N-API reasoning: `git grep -i "n-api\|napi" -- packages/repo-tools docs/knowledge/test-runs.md` → no match. Tasks 5 and 6 would make these true |
| 11 | Nothing else in the repository refers to the old job names | no | confirmed | `git grep -e "Lint, typecheck, test, build" -e "(Node 24)" -e "(Node 22)"` → only ci.yml, 188's SPEC/PLAN (the branch-protection swap) and a historical WITNESS row in feature 100; no workflow `needs:` the job by name. Branch protection itself: on GitHub. Stale CI prose in CLAUDE.md:51, CONTRIBUTING.md:178, test-runs.md:60,70, turbo-test-inputs.md:14, release.md:60 is task 6's |
| 12 | CONTRIBUTING.md's `pnpm test:runtime` row ("CI runs it on the oldest supported Node.js") is true | no | partly | CI runs `node-version: 22` (ci.yml:44, 64), which setup-node resolves to the newest 22.x; the oldest supported version is `MIN_NODE = "22.12.0"`. True for the major only until task 7 pins it |

**Overall:** not met: the CI split holds (parses, 2 role-named jobs, a 6-job install matrix, no version in any `if:`, the target keeps all 12 old steps), but two pieces of wording overstate the present state.

Fixed after this pass: the row says "CI runs it on Node.js 22, the oldest supported line"; server-checks.yml's comment no longer names a test that doesn't exist yet (task 5 adds it back); ci.yml's comment points to 188's SPEC.md instead of test-runs.md (task 6 can repoint it).

### Re-check — rows 10 and 12, and the parse and expansions

Witnessed: 2026-11-20 11:48 EST, by a fresh agent (blind). Commit: 31020b45 + working tree (`git diff`: ci.yml, server-checks.yml, CONTRIBUTING.md, PLAN.md). Machine: macOS 27.2.1, Node v24.0.0 (probe run on v26.13.1).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both workflows still parse, with the same expansions | yes | confirmed | `probe.mjs <repo>` → no parse errors. ci.yml `checks`: "Runtime tests (minimum Node.js)" {22, minimum}: install, test:runtime; "Lint, typecheck, test, build (target Node.js)" {24, target}: the old Node 24 job's 12 steps in order. No `if:` names a version. server-checks.yml `install`: 6 jobs, {ubuntu, macos, windows} × {22 minimum, 24 target} |
| 10 | The comments are updated and true as of this tree | no | confirmed | server-checks.yml:29-31 "native modules (better-sqlite3, @node-rs/argon2) are N-API, one binary for every version (188)": packages/server/package.json:45-46; better-sqlite3 binding.gyp:21 `NAPI_VERSION=10`, `prebuilds/<platform>.node` with no ABI in the name; argon2 package.json:52 `napi` block. ci.yml:27-32 points to `docs/features/188-node-26-target/SPEC.md`, which states it (SPEC.md:57, 90). ci.yml:74-75 "server-package.yml installs and runs the packed server on both roles": through `uses: ./.github/workflows/server-checks.yml` (server-package.yml:90) |
| 12 | CONTRIBUTING.md's `pnpm test:runtime` row is true | no | confirmed | CONTRIBUTING.md:208 "CI runs it on Node.js 22, the oldest supported line"; ci.yml:44 `node: 22, role: minimum`, ci.yml:83 runs `pnpm test:runtime` only when `matrix.role == 'minimum'`; `engines` ">=22.12" |

**Overall:** met: the comments and the `test:runtime` row match the tree, and both workflows parse with the same expansions as the first pass.

## Task 4 — Move the target to 26

Witnessed: 2026-11-20 11:56 EST, by a fresh agent (blind). Commit: ee736a7f + working tree (`git diff`, 14 files). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `.nvmrc` is `26` | no | confirmed | `od -c .nvmrc` → `2 6 \n` (LF, no CR) |
| 2 | `pnpm lint` and `pnpm typecheck` pass on Node.js 26 | no | confirmed | PATH v26.13.1: `pnpm lint` → exit 0, "Checked 2518 files", warnings and infos only; `pnpm typecheck` → exit 0, "7 successful, 0 cached" |
| 3 | `pnpm test` passes on Node.js 26 | no | confirmed | `pnpm test` → exit 0, every package a cache miss: web 523 files / 6316 passed, 20 skipped; core 449; rmk 286; repo-tools 194; marketplace 116; mcp 53 |
| 4 | `pnpm build` passes on Node.js 26 | no | confirmed | `pnpm build` → exit 0, 5/5; core and rmk came from the cache, so rerun: `turbo run build --filter=@ronneai/core --filter=@ronneai/rmk --force` → 2/2, 0 cached |
| 5 | The Dockerfile uses `node:26-trixie-slim` pinned by the real multi-arch index digest, with its comment | yes | confirmed | `docker buildx imagetools inspect node:26-trixie-slim` → MediaType `oci.image.index.v1+json`, Digest `sha256:e6bedef2…20bc` (linux/amd64 + linux/arm64/v8), matches `Dockerfile:9`; `Dockerfile:7` "Node.js 26 LTS on Debian 13 (trixie)" |
| 6 | `docker build .` succeeds, and the image's `node --version` prints v26 | yes | confirmed | `docker build -t ronne-188-t4-blind:witness .` → exit 0, base `node:26-trixie-slim@sha256:e6bedef…`; `docker run --rm --entrypoint node … --version` → `v26.13.1` (arm64 only; amd64 not built) |
| 7 | `NODE_MAJOR` is 26, and `bundle.js` on a packed tarball fetches a Node.js 26 build that matches `SHASUMS256.txt` | yes | confirmed | `bundle.js:31` `NODE_MAJOR = 26`. `pnpm build:server` → `pnpm --dir packages/server pack` → `bundle.js ronneai-marketplace-0.8.0.tgz --out …` → exit 0, "Node.js 26.13.1: node-v26.13.1-darwin-arm64.tar.gz, SHA-256 aec2514e…9735 (matches SHASUMS256.txt)"; `curl nodejs.org/dist/v26.13.1/SHASUMS256.txt` → same hash; `index.json` → newest 26 is v26.13.1 |
| 8 | The bundle runs with its own Node.js 26 (the smoke test's version check follows `NODE_MAJOR`) | yes | confirmed | `bundle-smoke.js rmk-server-0.8.0-darwin-arm64.tar.gz` → exit 0, "✓ … runs with its own Node.js, none on PATH"; `bundle-smoke.js:79` builds its regex from the imported `NODE_MAJOR` |
| 9 | The feed workflow `rmk` writes uses Node.js 26, and its golden tests pass | no | confirmed | `feed-workflow.ts:44` `node-version: 26`, `:78` `image: node:26`; golden files match; `vitest run src/feed-workflow.test.ts` → 5 passed. Mutation in a scratch copy (`node-version: 24`) → 2 failed |
| 10 | The target entries in `ci.yml` and `server-checks.yml` are 26, and no 24 entry is left | no | confirmed | `ci.yml:48` `node: 26` role target; `server-checks.yml:30` `node: [22, 26]`, include 26 → target (3 OS × 2 = 6 jobs) |
| 11 | `bundles.yml` and `packages.yml` read `.nvmrc`, and their sparse checkouts include it | yes | confirmed | `bundles.yml:46`, `packages.yml:58` `node-version-file: .nvmrc`; `/.nvmrc` at `bundles.yml:40`, `packages.yml:54` (non-cone). Probe: `git sparse-checkout set --no-cone packages/repo-tools/src LICENSE /.nvmrc` → `.nvmrc` checked out; without `/.nvmrc` → missing |
| 12 | The Linux service check takes Node.js from `.nvmrc`, and its cone-mode sparse checkout has `.nvmrc` | yes | confirmed | `server-checks.yml:75` `node-version-file: .nvmrc`. Probe: `git sparse-checkout set --cone scripts/service` → root files present, `.nvmrc` among them (the macOS job gets it the same way) |
| 13 | macOS service check: Homebrew's `node@N` if it exists, else `node`, and the job stops when the installed major isn't `.nvmrc`'s | yes | confirmed | Step extracted with the yaml parser, run under a fake `brew` (`brew-probe/probe.sh`): node@26 missing + node=26 → exit 0, installs `node`; node@26 versioned + node=28 → exit 0, installs `node@26`; node@26 missing + node=28 → exit 1 "::error::Homebrew's node is Node.js 28, but .nvmrc says 26"; node=25 → exit 1; a CRLF `.nvmrc` → exit 1 (fails closed). Real brew: `brew --prefix node@26` → `/opt/homebrew/opt/node`, `brew info --formula node@99` → exit 1 |
| 14 | Spec/plan fact: "on 2026-11-20 Homebrew had no `node@26`, and `node` was 26.13.1" | yes | partly | `brew info --formula node@26` → exit 0, "==> node: … stable 26.13.1_2 … Aliases: node.js, node@26, nodejs, npm": no separate formula, but `node@26` is an alias of `node`, so CI takes the `node@N` branch, not the fallback. Same result; only the wording is wrong |
| 15 | Nothing outside history still names 24 as the target in code or workflows | no | confirmed | `git grep` for node/version patterns with 24 outside docs → only `packages/server/src/service/macos.ts:8-9`, an example path in a comment (`…/Cellar/node@24/24.21.0`). Every other `setup-node` (15) uses `.nvmrc` or a matrix. `bundle.test.js`'s 24s are fixtures passed explicitly |

**Overall:** not met: everything the code, workflows, image and bundle must do holds on Node 26, but the spec's and plan's statement that Homebrew has no `node@26` is wrong: it's an alias of `node` (row 14).

Fixed after this pass: SPEC.md, PLAN.md and the workflow comment say `node@N` is used when Homebrew knows the name (today an alias of `node`), plain `node` otherwise; the step reads `.nvmrc` with `tr -d '[:space:]'`, so a CR or space can't produce a confusing mismatch.

### Re-check — rows 13, 14 and the changed comment

Witnessed: 2026-11-20 11:57 EST, by a fresh agent (blind). Commit: ee736a7f + working tree (`git diff`). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | macOS service check: Homebrew's `node@N` when Homebrew knows the name, else `node`; it stops when the installed major isn't `.nvmrc`'s; a CR or space in `.nvmrc` doesn't break it | yes | confirmed | Re-extracted step (`major="$(tr -d '[:space:]' < .nvmrc)"`), `brew-probe/probe.sh` with the fake brew: alias (node@26 known, 26) → exit 0, `node@26`; separate node@26=26 with node=28 → exit 0, `node@26`; name unknown, node=26 → exit 0, `node`; name unknown, node=28 → exit 1 "Homebrew's node is Node.js 28, but .nvmrc says 26"; node@26 gives 25 → exit 1; `.nvmrc` `26\r\n` → exit 0; ` 26 \r\n` (alias) → exit 0 |
| 14 | SPEC.md:33-36 and PLAN.md:62-64: `node@N` when Homebrew knows the name, plain `node` otherwise; on 2026-11-20 `node@26` was an alias of Homebrew's `node`, 26.13.1 | yes | confirmed | `brew info --formula node@26` → exit 0, "==> node: … stable 26.13.1_2", "Aliases: node.js, node@26, nodejs, npm"; `brew --prefix node@26` → `/opt/homebrew/opt/node` |
| 16 | The `server-checks.yml` comment above the macOS step matches what it does | no | confirmed | `server-checks.yml:116-118` matches the probes above and `brew info` |
| 17 | Note: in the image, `better-sqlite3` loads (SQLite 3.54.1) | yes | confirmed | `docker run --rm --entrypoint node ronne-188-t4-blind:witness -e 'require("/app/apps/web/node_modules/better-sqlite3") …'` → `v26.13.1 3.54.1` |
| 18 | Note: a dry run of the step "printed 'would install node' with `.nvmrc` at 26, and at 24 stopped with 'Homebrew's node is Node.js 26, but .nvmrc says 24.'" | yes | partly | Against real Homebrew: at 26, `brew info --formula node@26` exits 0, so the step installs `node@26` (the alias), not `node`; at 24, `brew info --formula node@24` → "node@24: stable 24.22.3 (bottled) [keg-only]", so it installs `node@24` and passes. The note was written before the alias was found |

**Overall:** met: the step, the spec and plan wording, and the comment match what `brew info` shows (rows 13, 14, 16, 17); row 18 is a sentence in the notes, reworded below.

### Re-check — row 18, wording

Witnessed: 2026-11-20 11:58 EST, by a fresh agent (blind). Commit: ee736a7f + working tree (`git diff`). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | PLAN.md task 4 note: with real Homebrew today, `.nvmrc` 26 installs `node@26` (the alias) and 24 installs `node@24` (24.22.3, its own formula), both passing the check; with `brew info` failing, plain `node` is installed, and at 24 the step stops with "Homebrew's node is Node.js 26, but .nvmrc says 24."; the fake-brew probe covers every branch | yes | confirmed | `brew info --formula node@26` → "Aliases: node.js, node@26, nodejs, npm"; `brew info --formula node@24` → "node@24: stable 24.22.3 (bottled) [keg-only]". `probe.sh` on the re-extracted step: 26 with the alias → exit 0, `node@26`; 24 with node@24=24 → exit 0, `node@24`; 26 with `brew info` failing → exit 0, `node`; 24 with `brew info` failing and node=26 → exit 1, "::error::Homebrew's node is Node.js 26, but .nvmrc says 24."; node=28 with the name unknown, and node@26 at 25, also stop |

**Overall:** met: the note's wording matches what `brew info` shows and what the probe does in every branch.
