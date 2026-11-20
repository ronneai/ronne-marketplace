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

## Task 5 — The drift guard and the N-API guard

Witnessed: 2026-11-20 12:01 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (server-checks.yml, PLAN.md, SPEC.md diff; untracked node-versions.js and node-versions.test.js). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass | yes | confirmed | `vitest run` in packages/repo-tools → 22 files, 208 passed; `node-versions.test.js` alone → 14 passed |
| 2 | Setting any one guarded place to another major in the real files makes the guard fail, naming that file | yes | confirmed | `drift-probe.mjs`, each real file edited in a scratch copy then put back (`cmp`): Dockerfile FROM→24, NODE_MAJOR→24, feed `node-version` and `image` →24, ci.yml target→24 and minimum→20, server-checks target→24 and minimum→24, axis→[22, 24], literal `node-version: 24` in release.yml:83 and .github/actions/build-image/action.yml:28, .nvmrc→28 (5 problems): each failed naming its file. Baseline `[]` |
| 3 | Each check has a test that fails without it | yes | confirmed | Mutations in the scratch copy: the Dockerfile, minimum, axis, `node-version:` and N-API checks turned off → 1–2 named tests fail each; not walking optional deps fails "finds the server's native modules". Gap: turning off the "isn't installed" report still passes 14/14 |
| 4 | "Every other `setup-node` reads `.nvmrc` rather than naming a version" | yes | partly | A literal `node-version: N` is caught. Pass with no problems: another workflow with its own `matrix.node: [24]` and `node-version: ${{ matrix.node }}`; flow style `with: { node-version: 24 }`; quoted key `"node-version": 24` |
| 5 | The guard reads the other forms GitHub, YAML or Docker accept for the axis and the base image | yes | partly | A block-list or quoted server-checks axis skips the axis check and passes; a later stage `FROM node:24-trixie-slim AS runtime` passes (only the first `FROM node:` read) |
| 6 | CRLF workflows are read correctly | no | confirmed | server-checks.yml in CRLF → no problems; ci.yml in CRLF with target 24 → reported |
| 7 | The N-API guard finds better-sqlite3's and @node-rs/argon2's binaries in the real tree, with no problems | yes | confirmed | `napi-real.mjs` → `@node-rs/argon2-darwin-arm64/argon2.darwin-arm64.node` and the 8 `better-sqlite3/prebuilds/*.node`; `problems: []` |
| 8 | Real N-API binaries for Linux and Windows pass, and they really export the symbol | yes | confirmed | `nm -g --defined-only` → `napi_register_module_v1` in the darwin, linux and linuxmusl prebuilds; `pe-exports.mjs` on win32-x64/arm64.node → `['napi_register_module_v1']` |
| 9 | It fails on a `.node` file without the export, naming the package and the file | yes | confirmed | The test passes and fails when the check is mutated away; `napi-fixtures.mjs` with a hoisted, scoped, optional transitive dep → named |
| 10 | It doesn't fail a real N-API module ("the entry point every N-API module has") | yes | partly | `@parcel/watcher-darwin-arm64@2.6.0`'s watcher.node imports only `napi_*` and registers through `_napi_module_register`: N-API, but reported as "isn't N-API". The check is a byte search, not an export check |
| 11 | The walk covers dependencies and installed optional ones, not devDependencies | no | confirmed | Non-N-API binaries reachable only through devDependencies → not found; a transitive, hoisted, scoped optional dep is found; a cycle ends. peerDependencies weren't walked |
| 12 | The test isn't vacuous when node_modules is missing or partial | yes | confirmed | packages/server alone with no node_modules → "needs @node-rs/argon2, which isn't installed" and the same for better-sqlite3; the real-tree test asserts both names |
| 13 | server-checks.yml's comment "repo-tools' node-versions test keeps it so" is true | no | confirmed | server-checks.yml:30; the test walks packages/server; `turbo run test` runs it on the target role |
| 14 | Lint passes on the new files | yes | confirmed | `biome check` → no fixes, exit 0 |

**Overall:** not met: every place in today's files is guarded and both native modules are checked, but YAML forms GitHub accepts bypass the setup-node rule and the axis check (rows 4, 5), and the N-API check fails a real N-API module registering with `napi_module_register` (row 10).

Fixed after this pass: the readers became line-based (trimmed lines, `indexOf`, short anchored patterns); only ci.yml and server-checks.yml may use `${{ matrix.node }}` and any other node axis or `node-version` is reported; flow and quoted forms are read; an unreadable axis is reported; every `FROM node:` is checked; N-API means `napi_register_module_v1` or `napi_module_register` without `node_register_module_v`; peers are walked; a test covers the "isn't installed" report.

### Re-check 1 — rows 3, 4, 5, 10 and the fixes since

Witnessed: 2026-11-20 12:08 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (node-versions.js rewritten, node-versions.test.js, SPEC.md and PLAN.md diff). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass and lint is clean | yes | confirmed | 22 files, 214 passed; `biome check` → no fixes |
| 3 | Each check has a test that fails without it | yes | partly | Mutations each fail a named test (only the first FROM, `--flags`, axes elsewhere, `matrix.node` everywhere, flow `}`, quoted key, `}}`, unreadable axis, per-ABI, `napi_module_register`, missing dep). Survive 20/20: peers not walked; installed devDependencies walked |
| 4 | Only ci.yml and server-checks.yml test by version | yes | partly | First-pass bypasses fail. Pass with `[]`, in ci.yml: a second job `matrix: { node: [24] }`; an include `- node: 24` without role or with `name:` between; `- { node: 24, role: target, name: x }`; a second job `matrix: include: - node: 24`. Also `Node-Version: 24`, `? node-version` / `: 24`, an escaped key |
| 5 | Every Dockerfile `FROM node:` is checked, and the axis is read or reported | yes | partly | Second stage, `--platform`, block and quoted axes reported. Pass: `FROM<TAB>node:24…`, `FROM docker.io/library/node:24…`, `ARG IMG` + `FROM ${IMG}`, a `FROM \` continuation, `COPY --from=node:24…` |
| 10 | It doesn't fail a real N-API module, and it rejects one built per Node.js version | yes | confirmed | @parcel/watcher → no problems; all 17 `.node` files in node_modules → N-API; addons compiled against Node 26's headers: `NODE_MODULE` → "has neither…", `NODE_MODULE_INIT` → "registers per Node.js version", `NAPI_MODULE` → N-API; on 22 and 24 only the N-API one loads |
| 15 | No other workflow may use `${{ matrix.node }}` or have a `node` axis | yes | confirmed | `matrix-elsewhere.mjs` → 2 problems naming bundles.yml lines 33 and 49 |
| 16 | `node-version` is read in block and flow style, quoted or not; an expression runs to its `}}` | yes | confirmed | Block, flow, quoted, next-line and `${{ matrix['node'] }}` forms reported; the `}}` mutation fails 9 tests |
| 17 | In the role workflows an axis other than `[N, M]` is reported | yes | partly | Block list, quoted numbers and `fromJSON` axis reported; `matrix: { node: [24] }` not seen |
| 18 | N-API means `napi_register_module_v1` or `napi_module_register`, without `node_register_module_v`; messages and SPEC say so | yes | confirmed | `notNapi`; SPEC matches; real tree `problems: []`; message names package and file |
| 19 | A test covers "isn't installed"; peers are walked when installed | yes | confirmed | The mutation fails the new test; a peer native is now found. The peer walk had no test (row 3) |
| 20 | The minimum is compared by major, and SPEC says so until task 7 | yes | confirmed | SPEC diff; ci.yml minimum→20 → "minimum entry is Node.js 20, but MIN_NODE is 22.12.0" |

**Overall:** not met: the first pass's bypasses are closed and the N-API guard is right on real binaries; role-workflow job and include forms and some Dockerfile forms pass unreported (rows 4, 5, 17), and two walk rules have no test (row 3).

Fixed after this re-check: the Dockerfile reader joins continuations, splits on any space, and checks every `FROM`, `--from=` and mount `from=` (registry-prefixed `node` images allowed; anything that isn't a `node` image, a stage, `scratch` or a number reported); in the role workflows any other `node:` key is reported; any `node:` key elsewhere is reported; `node-version` in any case; explicit `?` keys reported; peer and dev walk tests.

### Re-check 2 — rows 3, 4, 5 and 17, against the new notes

Witnessed: 2026-11-20 12:13 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (node-versions.js and node-versions.test.js changed again, PLAN.md notes rewritten). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass and lint is clean | yes | confirmed | 22 files, 218 passed (24 in node-versions.test.js); `biome check` → no fixes |
| 3 | Each check has a test that fails without it, including the peer and dev-dependency walk rules | yes | partly | `mutate3.mjs`, 14 mutations: 12 fail a named test (peer and dev walks included). Survive 24/24: the mount `from=` reader removed; the "space after the colon" rule removed (minor, it only prevents false positives) |
| 4 | In every other workflow any `node:` key or `node-version` value is reported, and explicit `? key` lines anywhere | yes | partly | Earlier cases fail. A `?` alone on its line, then `node-version`, then `: 24` passes and isn't in "Not read" |
| 5 | The Dockerfile: every `FROM`, `--from=` and mount `from=` is a `node` image of the target, a stage, `scratch` or a number, else reported | yes | confirmed | Tab, registry prefix, `${IMG}`, continuation, lowercase `from`, `COPY --from=node:24`, `FROM node`, `node:lts`, `registry:5000/node:24`, `cimg/node:24.1`, backtick escape and comment-in-continuation are all reported. Only a quoted mount part passes (contrived) |
| 17 | In ci.yml and server-checks.yml any `node:` key that isn't an entry with its role or the axis is reported | yes | partly | Cases a–d fail. Pass with `[]`: `matrix: {"node":[24]}`; `node : [24]`; `Node: [24]`; `matrix: ${{ fromJSON('{"node":[24]}') }}`; a dynamic matrix from another job's output |

**Overall:** not met: the Dockerfile reader is sound and the walk rules have tests, but some `node:` key and `?` key forms pass unreported and unlisted (rows 4, 17), and the mount reader has no test (row 3).

Fixed after this re-check: node keys matched in any case, with spaces before the colon, and quoted keys without a space after it; in the role workflows `matrix: ${{ … }}` and any `fromJSON(` reported; a bare `?` reported; a mount test; "Not read" names escaped keys, anchors and aliases, a quoted mount part, and `container:` / `docker://` images.

### Re-check 3 — rows 3, 4 and 17, against the updated notes

Witnessed: 2026-11-20 12:16 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (node-versions.js and node-versions.test.js changed again, PLAN.md notes updated). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass and lint is clean | yes | confirmed | 22 files, 219 passed (25 in node-versions.test.js); `biome check` → no fixes |
| 3 | Each check has a test that fails without it | yes | partly | The mount `from=` mutation now fails; every other mutation fails a named test. Survives 25/25: dropping the `fromjson(` clause (it alone catches `strategy: ${{ fromJSON(needs.x.outputs.s) }}`) |
| 4 | In every workflow `node-version` in any form and explicit `?` keys are reported; everything else is in "Not read" | yes | partly | Only "Not read" forms pass, plus `?<TAB>node-version` / `: 24` (the `yaml` package parses it as `{"node-version":24}`), neither reported nor listed |
| 17 | In the role workflows every unread `node` key, `matrix: ${{ … }}` and any `fromJSON(` are reported | yes | partly | All earlier forms reported. Passes: `matrix:` with `${{ … }}` on the next line (without `fromJSON`) |

**Overall:** not met: all earlier bypasses are closed or disclosed; left are `?<TAB>`, a matrix expression on the next line, and no test for the `fromJSON(` clause.

Fixed after this re-check: explicit keys match `/^\?(?:\s|$)/`; a role-workflow line that is only an expression is reported; a test for `fromJSON` anywhere.

### Re-check 4 — rows 3, 4 and 17, the three findings of re-check 3

Witnessed: 2026-11-20 12:18 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (node-versions.js and node-versions.test.js changed again, PLAN.md notes). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass and lint is clean | yes | confirmed | 22 files, 220 passed (26 in node-versions.test.js); `biome check` → no fixes |
| 3 | Each of the changed clauses has a test that fails without it | yes | partly | `mutate5.mjs`: explicit keys, the `${{` line and the `fromjson(` clause each fail a named test. Survive 26/26: explicit keys matched on a space only (the bare `?` and `?<TAB>` cases shared one assertion); dropping the inline `/matrix *: *\$\{\{/` (no inline case without `fromJSON` tested) |
| 4 | Explicit keys, including `?<TAB>key`, are reported in every workflow; everything else that passes is in "Not read" | yes | confirmed | `?<tab>node-version` → "bundles.yml:46 has an explicit YAML key (?)". What passes across drift-probe 1–4: `"node-version"`, `container: node:24`, `docker://node:24`, a quoted mount `"from=…"` (all in "Not read"), and `- ? node-version`, which GitHub refuses. Real repository `[]` |
| 17 | In the role workflows a matrix built from an expression is reported: inline, on the next line, or through `fromJSON` anywhere | yes | confirmed | Next-line `${{ needs.plan.outputs.m }}`, `strategy: ${{ fromJson(…) }}`, `'NODE' : [24]` and inline `matrix: ${{ github.event.client_payload }}` are all reported |

**Overall:** not met: every form is reported or disclosed; two test gaps remain (no isolated `?<TAB>` test, no inline matrix expression without `fromJSON`).

Fixed after this re-check: the explicit-key test checks each form in its own `withChange`; the expression test adds an inline `${{ github.event.client_payload }}`.

### Re-check 5 — row 3, the two test gaps

Witnessed: 2026-11-20 12:20 EST, by a fresh agent (blind). Commit: e0bdc406 + working tree (only node-versions.test.js changed since re-check 4; node-versions.js byte-identical, `cmp`). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repo-tools tests pass and lint is clean | yes | confirmed | 22 files, 220 passed (26 in node-versions.test.js); `biome check` → no fixes |
| 3 | Each check has a test that fails without it, including the `?<TAB>` and the inline `matrix: ${{ … }}` clauses | yes | confirmed | `mutate5.mjs`, each mutation failing exactly 1 test (25/26): explicit keys on a space only; explicit keys not reported; the `${{`-line clause removed; the `fromjson(` clause removed; the inline `/matrix *: *\$\{\{/` removed; a bare `?` not reported. `mutate4.mjs` 0, 5, 6, 7 (role-workflow node keys, case, space before the colon, quoted key) each fail 1 test. `drift-probe4.mjs` and `inline-matrix.mjs` still report every form |

**Overall:** met: every claim in rows 3, 4 and 17 is confirmed; every clause of the drift and N-API guards has a test that fails without it.

## Task 6 — The documents

Witnessed: 2026-11-20 12:26 EST, by a fresh agent (blind). Commit: c98d3fa0 + working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:check` passes | no | confirmed | `pnpm docs:check` on Node 26 → exit 0 |
| 2 | The Done-when `git grep` ("Node 24", "Node.js 24", "node:24", "node@24", "node-version: 24") finds only history, test fixtures and the "then the minimum moves to 24" line | yes | partly | Outside old specs, issues and witness records: `image-security-updates.md:16` (dated note); `bundle.test.js`, `node-versions.test.js`, `macos.test.ts` (fixtures); and `packages/server/src/service/macos.ts:8-9`, a comment using `…/Cellar/node@24/24.21.0/bin/node` as an example path: not the target, but not in the Done-when's list |
| 3 | Nothing outside history still calls 24 the target | yes | not met | A wider grep (`node[ @:-]?v?24`, `Active LTS`, `target LTS`) → `docs/MVP/MVP.md:437` (§5): "the target is the newest Node.js Active LTS (24 in September 2026), used for development, CI and the Docker image. The minimum … (22, until April 2027)": not updated, and missed by the Done-when grep's wording |
| 4 | CLAUDE.md: Node.js 26 from `.nvmrc`; CI runs lint, typecheck, test and build on the target and `test:runtime` on the minimum (22), no job between; deps bullet "26 LTS target, 22.12 minimum" | yes | confirmed | `.nvmrc` = `26`; `ci.yml:44-49` `node: 22 role: minimum`, `node: 26 role: target`; `ci.yml:75-98` target-only steps and `test:runtime` on the minimum; `engines` `>=22.12`, `MIN_NODE = "22.12.0"` |
| 5 | CLAUDE.md and the dependency policy say the repo-tools `pnpm test` fails when a place naming the target drifts from `.nvmrc` | yes | confirmed | `node-versions.test.js` → 26 passed; `:85` asserts the real files give `[]`; `drift-probe.mjs` with `.nvmrc` 28 → 5 problems |
| 6 | CONTRIBUTING.md: develop on 26; packages run on 22.12+, `test:runtime` on 22; CI paragraph | yes | confirmed | Matches `ci.yml` and `engines`. Remark: rmk-server crashes on 22.12.0 (the known issue, task 7) |
| 7 | Dependency policy §2: target 26 (dev, CI, Docker, bundles), minimum 22 from 22.12, then 24; versions between untested while native modules are N-API; bundled Node.js row "newest 26 (`NODE_MAJOR`)" | yes | confirmed | `Dockerfile:9` `node:26-trixie-slim@sha256:e6bed…`; `bundle.js:31` `NODE_MAJOR = 26`, `:190` `latestOf(index.json, NODE_MAJOR)`; `bundles.yml:46`, `packages.yml:58` `node-version-file: .nvmrc` |
| 8 | MVP.md Docker and Packages rows, and a §15 entry dated 2026-11-20 | yes | confirmed | `MVP.md:976` `node:26-trixie-slim`; `:999` "Node 26 LTS target…, 22.12 minimum"; the "Node.js versions" row at `:1023` under `## 15. Decision log`, matching ci.yml, server-checks.yml and the guard |
| 9 | test-runs.md has a "Which Node.js version runs what" section with SPEC's table and rule, replacing the Node 22/24 bullets | yes | confirmed | `test-runs.md:87`: the rule; a 5-row table condensing SPEC's 7 rows; the old bullets point to it. `base.json:15` `lib: ["ES2023"]`; `@types/node` 22.20.5; `server-checks.yml:27-36` {ubuntu, macos, windows} × {22 minimum, 26 target}; `test:runtime` script; "about 10%" agrees with task 2's timings |
| 10 | test-runs.md: `.nvmrc` is the one source; the Docker base, `NODE_MAJOR`, the feed workflow and the role matrices must agree; no other workflow names a version | yes | confirmed | Only `ci.yml:65` and `server-checks.yml:47` use `${{ matrix.node }}`; every other `setup-node` uses `node-version-file: .nvmrc`; the guard reads all four places |
| 11 | turbo-test-inputs.md's "Node 22 and 24" is history and rightly unchanged | yes | confirmed | `turbo-test-inputs.md:7-14` under "What happened (2026-10-30)" |
| 12 | release.md: newest `v26.x.y` and "Node.js 26.x.y: … (matches SHASUMS256.txt)"; server-checks on the minimum and target (22 and 26) | yes | confirmed | `bundle.js:199` prints that line; `server-checks.yml:31` `[22, 26]`; services from `.nvmrc` and Homebrew's target; `release.yml:356-358` calls server-checks |
| 13 | threat-model.md's image row says `node:26-trixie-slim@sha256:…` | yes | confirmed | Matches `Dockerfile:9` |
| 14 | backup-format.md: `maxmem = 256·N·r` measured enough for every accepted header on 22, 24 and 26 | yes | confirmed | `crypto.test.ts` on v26.13.1 → 9 passed (12.4 s). `scrypt-maxmem-probe.mjs` at log2N {15, 18} × p {1, 4}: ok on v26.13.1, v24.21.0, v22.23.2, v22.11.0; control `128·N·r` → `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` everywhere |
| 15 | test-runs.md and the MVP §15 row: better-sqlite3 13.2.0 "crashed on Node.js 22.12.0 and 22.13" | yes | partly | v22.11.0 → exit 139; v22.23.2, v26.13.1 → work. No 22.13 build here (download denied); task 1's record ran 22.12.0 but rests 22.13 on its header only |
| 16 | Links and anchors in the changed Markdown resolve | no | confirmed | `link-probe.mjs` (GitHub-style slugs) → 11 links, 0 bad, including `test-runs.md#which-nodejs-version-runs-what` |
| 17 | No other document stating the target or the CI split was missed | yes | not met | `MVP.md:437` (row 3). README, `install.md`, package READMEs, `cli.ts` HELP, `install.sh`, `release.yml:445` state only the 22.12 minimum; `dependabot.yml` comments say "Active LTS" with no number |

**Overall:** not met: the documents in the task's list match the files, but `MVP.md:437` (§5) still calls 24 the target, and two wording gaps remain (rows 2 and 15).

Fixed after this pass: MVP.md §5 names 26, the 22.12 minimum and the CI split, with a link to test-runs.md; `macos.ts`'s example path is `node@26`; an official 22.13.1 build was run (N-API 9, exit 139); PLAN.md's trailing blank line removed.

### Re-check — rows 2, 3, 15, 17 and the trailing blank line

Witnessed: 2026-11-20 12:27 EST, by a fresh agent (blind). Commit: c98d3fa0 + working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The Done-when `git grep` finds only history, test fixtures and the "then the minimum moves to 24" line | yes | confirmed | Outside old specs, issues, witness records and tests → only `image-security-updates.md:16` (dated 2026-11-18). `macos.ts:8-9` now `…/Cellar/node@26/26.13.1/bin/node`, `…/opt/node@26/bin/node`; `macos.test.ts`'s `node@24` fixture passes (12 passed) |
| 3 | Nothing outside history still calls 24 the target | yes | confirmed | Wider grep (`node[ @:-]?v?24\b`, `24 LTS`, `22 and 24`, `Active LTS`, `target LTS`, `LTS target`) → none. `MVP.md:437-441`: "26 since 2026-11-20, [188]…; 24 before", "development, CI, the Docker image and the bundles", "22, from 22.12", CI split matching `ci.yml:44-98`. Leftovers: `MVP.md:978` "24 until 2026-11-20" (dated), `turbo-test-inputs.md:14` (history), sample commit titles at `CLAUDE.md:83`, `CONTRIBUTING.md:167` |
| 15 | better-sqlite3 13.2.0 crashed on Node.js 22.12.0 and 22.13 | yes | confirmed | `scratchpad/node-22.13/node-v22.13.1-darwin-arm64/bin/node` from `apps/web`: `v22.13.1 napi 9`, `require("better-sqlite3")` → exit 139. Tarball SHA-256 `97483ff4…d9d19b89`; the binary is code-signed (TeamIdentifier `HX7739G8FX`). 22.12.0 rests on task 1's record (exit 139 on the official build) |
| 17 | No other document stating the target or the CI split was missed | yes | confirmed | The wider grep found nothing else; `link-probe.mjs` → 13 links, 0 bad, including MVP.md's `../knowledge/test-runs.md#which-nodejs-version-runs-what`; `pnpm docs:check` → exit 0 |
| 18 | The trailing blank line in PLAN.md is gone | no | confirmed | `git diff --check` → no output, exit 0 |
| 19 | `ci.yml`'s comment now points to `test-runs.md` | yes | confirmed | `ci.yml:31-33` "(docs/knowledge/test-runs.md)"; `node-versions.test.js` → 26 passed |

**Overall:** met: every row of the first pass is now confirmed: MVP §5 states 26, the 22.12 minimum and the CI split; the `macos.ts` example no longer names 24; the 22.13 crash was measured; links resolve; `docs:check` and `git diff --check` are clean.
