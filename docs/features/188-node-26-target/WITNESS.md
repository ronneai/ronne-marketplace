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

## Task 7 — Pin the minimum's jobs to `MIN_NODE`

Witnessed: 2026-11-20 16:11 EST, by a fresh agent (blind). Commit: 86591284 + uncommitted diff (12 files). Machine: macOS 27.2.1 (Apple silicon), Node v26.13.1 (official v22.14.0 and v22.13.1 builds for the minimum runs).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `ci.yml`'s `role: minimum` entry is exactly `MIN_NODE`, and GitHub reads it so | yes | confirmed | `ci.yml:46` `- node: 22.14.0`; yaml@2.9.1 → `"node":"22.14.0"` (a string, not 22.14); `node-version.ts:4` |
| 2 | `server-checks.yml`'s axis and minimum entry are exactly `MIN_NODE`, 6 jobs, no stray include job | yes | confirmed | yaml → `node:["22.14.0",26]`, include values match the axis, so each adds `role` and none is a 7th job |
| 3 | The drift guard passes on the tree | no | confirmed | `vitest run src/node-versions.test.js` → 27 passed; `drift-probe.mjs` "unchanged" → no problems |
| 4 | It fails when a minimum entry is `22` or any version other than `MIN_NODE` | yes | confirmed | `drift-probe.mjs`: `22`, `22.15.0`, `22.13.1`, axis only, CRLF, `22.14` (a float), quoted, `22.x` → each FAILs naming the file; `MIN_NODE` moved to 22.15.0 → both entries fail. Mutation comparing by major → the test fails |
| 5 | It fails when a package's `engines` differs from `^MIN_NODE \|\| >=MIN_NODE_23` | yes | partly | Wrong values FAIL (cli `>=22.14.0`, web `>=22`, `MIN_NODE_23` moved → all five). **A package with `engines` removed passes** (`packages/server`): `node-versions.js` skips `node === undefined` |
| 6 | All five `engines` are `^22.14.0 \|\| >=23.6.0`, and `MIN_NODE`/`MIN_NODE_23` are #315's | yes | confirmed | root, cli, core, mcp, server; web, config, repo-tools none; `git merge-base --is-ancestor bugfix/315-node-22-14-minimum HEAD` → true |
| 7 | On official 22.14.0, `pnpm install --frozen-lockfile` passes | yes | confirmed | Scratch worktree, 22.14.0 first on PATH → pnpm v12.6.0, exit 0 |
| 8 | On 22.14.0, `pnpm test:runtime --force` passes, without `*.test.tsx` or repo-tools | yes | confirmed | "Tasks: 7 successful"; core 449, marketplace 118, mcp 53, rmk 286, web 4700 + 21 skipped (383 files); 0 `.test.tsx` in the log; the `registerHooks` case skipped |
| 9 | On 22.14.0, `better-sqlite3` opens a database | yes | confirmed | `open-db.cjs` → `v22.14.0 OK 3.54.1` |
| 10 | On 22.13.1, opening a database crashes | yes | confirmed | `open-db.cjs` → exit 139 (N-API 9); `checks.db.test.ts` on 22.13.1 → "Worker forks emitted error" |
| 11 | The `start.test.ts` skip is limited to Node.js without `registerHooks`, and no shipped code uses it | yes | confirmed | `start.test.ts:34-37`, one case; 22.14.0/22.13.1 false, 26.13.1 true; `git grep registerHooks` → only this test |
| 12 | CLAUDE.md, CONTRIBUTING.md, MVP.md's row, test-runs.md and the index row match the workflows and code | yes | confirmed | CLAUDE.md:51; CONTRIBUTING.md:24, :180, :210; MVP.md:1025; test-runs.md:108-116; README 188 row; dependencies.md:40 |
| 13 | The branch sits on #315's, and the rebase kept 26 as the target and 22.14 as the minimum | yes | confirmed | 8bcfac9f, ff23d257, 837c9f1d ancestors of HEAD; CLAUDE.md:142, CONTRIBUTING.md:23-24, dependencies.md:40, MVP.md:1025 |
| 14 | The guard compares the target as a major and reads root, `apps/*` and `packages/*` package.json | yes | confirmed | `node-versions.js:219`; probe "target 26.13.1" → FAIL; `readDriftFiles` matches `pnpm-workspace.yaml` |
| 15 | `require("better-sqlite3")` doesn't crash on 22.13; the first `new Database()` does | yes | confirmed | v22.13.1 require → exit 0; opening → 139 |
| 16 | `health.db.test.ts`' deadline missed by 16 ms on one 22.14.0 run | yes | can't check here | Not reproduced: this pass's full 22.14.0 run passed it |

**Overall:** not met: the minimum is pinned exactly, the guard catches every wrong minimum entry, 22.14.0 passes and 22.13.1 crashes, but a package that drops `engines` passes the guard.

Fixed after this pass: the guard requires `engines.node` in the root and in every package that isn't `"private": true` (a private one may leave it out), with tests for a dropped `engines` in the root and the server and a private package without one; the spec's guard bullet and the notes say so.

### Re-check 1 — the engines rule

Witnessed: 2026-11-20 16:20 EST, by a fresh agent (blind). Commit: 86591284 + working tree (only `node-versions.js`, its test and the docs changed since the last pass). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The guard fails when the root `package.json` loses `engines` or `engines.node` | yes | confirmed | `engines-probe.mjs` → FAIL "package.json has no engines.node; it must say ^22.14.0 \|\| >=23.6.0" for `engines` deleted, `{}`, `{npm}` only; also with `private: true` (`node-versions.js:177`) |
| 2 | It fails when a published package loses `engines` or `engines.node` | yes | confirmed | server: deleted, `node` deleted, `"private": false`, `"private": "true"` (a string), `engines` a string, `null`, padded → FAIL; cli, core, mcp deleted → FAIL |
| 3 | A private package may leave `engines` out, but a wrong value there fails | yes | confirmed | config `{}` and repo-tools right value → pass; web `>=22` → FAIL; web without `private` and engines → FAIL |
| 4 | `readDriftFiles` picks up a new package | yes | confirmed | `disk-probe.mjs` on a minimal root: a new `packages/newpkg` → "has no engines.node"; with `"private":true` → `[]` |
| 5 | The test covers the rule | no | confirmed | Scratch copy, `-t engines`: passes; fails under each of three mutants (missing branch never fires, root exemption dropped, private ones required) |
| 6 | The rest of the guard holds | yes | confirmed | `drift-probe.mjs`: "unchanged" passes, all 15 changed cases FAIL naming the file |
| 7 | The minimum entries are exactly `22.14.0` | yes | confirmed | `ci.yml:46`, `server-checks.yml:32,34` |
| 8 | The repo-tools tests and lint pass | no | confirmed | 22 files, 221 passed; `biome check` on the three changed code files → exit 0 |
| 9 | On 22.14.0, install and `test:runtime` pass and a database opens | yes | confirmed | From the last pass, not rerun: only repo-tools' guard and docs changed since |
| 10 | On 22.13.1 opening a database crashes, `require` alone doesn't | yes | confirmed | From the last pass; the code is unchanged |
| 11 | The branch is built on #315 | yes | confirmed | `git merge-base --is-ancestor` → true |
| 12 | `health.db.test.ts` missed its deadline by 16 ms once, under full parallel load | yes | can't check here | A claim about one past run, not rerun |

**Overall:** not met: the engines rule holds and the test catches its mutants; only the note about a past timing can't be checked.

Fixed after this pass: the note names the run's log and the line it shows.

### Re-check 2 — the `health.db.test.ts` deadline note

Witnessed: 2026-11-20 16:18 EST, by a fresh agent (blind). Commit: 86591284 + working tree. Machine: macOS 27.2.1 (arm64), Node v26.13.1 (default), v22.14.0 for the runs below.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Since re-check 1, the working tree changed only that note in PLAN.md | no | confirmed | `git diff` compared with re-check 1's: only PLAN.md's note differs; the same 12 files; `node-versions.js` byte-identical |
| 2 | `188-t7-runtime.log` is a `pnpm test:runtime` run on Node v22.14.0 | yes | confirmed | Line 1 `RONNE_TEST_SCOPE=runtime turbo run test --filter=!@ronneai/repo-tools`; lines 5116 and 5635 `Node.js v22.14.0` |
| 3 | In it, "keeps one deadline…" failed with "expected 4516.288042 to be less than 4500" | yes | confirmed | log:5612-5613; 16.3 ms over `toBeLessThan(4_500)` |
| 4 | The run's only other failure was the `registerHooks` telemetry test | yes | confirmed | log:5610 "Failed Tests 2"; log:5624-5628 the `registerHooks` SyntaxError; web 2 failed, 4699 passed, 20 skipped; the other packages passed |
| 5 | The file passes on its own on 22.14.0 | yes | confirmed | `vitest run --project db src/server/http/health.db.test.ts` with 22.14.0 first on PATH → 18 passed |
| 6 | The first pass's full run on 22.14.0 passed the file | yes | confirmed | `188-t7-blind/runtime.clean.log`: `✓ db src/server/http/health.db.test.ts (18 tests)`, web 383 files passed |

**Overall:** met: the note matches its log, the file passes alone and in a full run on 22.14.0, and nothing but the note changed since re-check 1, where every other claim was confirmed.

## Task 8 — The website

Witnessed: 2026-11-20 18:05 EST, by a fresh agent (blind). Commit: bbf572c (ronne-web, branch feat/marketplace-188-node-26, plus the uncommitted `git diff`; facts from marketplace 46056158). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The home page's stack line says Node.js 26, in en, pt and fr | no | confirmed | `git diff www/messages/*.json` → `home.marketplace.stack` "… · Node.js 24" → "… · Node.js 26" in all three; built `/en.html`, `/pt.html`, `/fr.html` (probe `visible-node.mjs`) → "… · Node.js 26" |
| 2 | The marketplace facts' `nodeRuntime.target` is 26 and the runtime fact shows it in all three languages | no | confirmed | `www/src/content/marketplace.ts:53` → `{ target: "26", minimum: "22.14" }`, used by `Hero.tsx:28` (`nodeValue`); probe → `/en/marketplace.html` "Node.js 26 (22.14+ works)", pt "Node.js 26 (22.14+ também funciona)", fr "Node.js 26 (22.14+ fonctionne aussi)" |
| 3 | The contributor setup step (From a clone) says 26 in en, pt and fr | no | confirmed | `git diff` → `clone.description` in all three ("You need Node.js 26 (22.14 or later works)…", "Você precisa do Node.js 26…", "Il vous faut Node.js 26…"); only the number changed; the same text in the 3 built marketplace pages |
| 4 | `docs/product-facts.md`'s runtime row says 26 | no | confirmed | `docs/product-facts.md:47` → "Runtime: Node.js 26 LTS target (marketplace 188; 24 before it); 22.14 or later works…", source "README; marketplace #315 …, 188" |
| 5 | The facts match the marketplace branch | no | confirmed | marketplace 46056158: `.nvmrc` → `26`; `node-version.ts` → `MIN_NODE = "22.14.0"`; every `engines.node` → `^22.14.0 \|\| >=23.6.0`; `CONTRIBUTING.md:23` → "Node.js 26 LTS … run on 22.14 or later" |
| 6 | A search for "Node.js 24" and `target: "24"` in `www/src` and `www/messages` finds nothing | no | confirmed | both `grep -rn` → rc=1, no output; a wider regex (node/nvm near 24, "24 LTS", "v24.") finds nothing; after the build `grep -rl 'Node.js 24' .next/server/app` → 0 files. "Node 24" left in ronne-web is the site's own runtime (`CLAUDE.md` Deployment, `docs/deploy.md`, `docs/stack.md`), finished specs and a quoted example in `docs/translation-guide.md:281`, none a product claim |
| 7 | ronne-web's checks pass | no | confirmed | from `www/` on Node v26.13.1, pnpm 12.6.0: `pnpm lint` → rc=0, 290 files; `pnpm typecheck` → rc=0; `pnpm test` → 33 files, 198 tests passed; `pnpm build` → rc=0, /en /pt /fr and the marketplace pages prerendered |
| 8 | No topic changes, so `topics.ts` doesn't | no | confirmed | `git status --porcelain` → only `docs/product-facts.md`, the 3 message files and `www/src/content/marketplace.ts` |

**Overall:** met: the home stack line, the runtime fact, the From a clone step and the product-facts row say Node.js 26 in en, pt and fr, the two searches find nothing, and lint, typecheck, test and build pass.

No ronne-web test reads the version text, so no test could be broken to prove it; the rendered-page probe stands in. Committed after the pass as ronne-web `486a25a`: the same 5 files, and the pre-commit checks passed.

## Task 9 — Finish

Witnessed: 2026-11-20 18:11 EST, by a fresh agent (blind). Commit: 6d6c4fb9 + uncommitted diff (SPEC.md criteria ticked, the README index row, PLAN.md notes); ronne-web 486a25a (branch feat/marketplace-188-node-26). Machine: macOS 27.2.1 (arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | AC1: on Node.js 26, install, lint, typecheck, test, build, build:server, packages:check and release:smoke pass, and `pnpm dev` starts | no | confirmed | fresh `git clone` at 6d6c4fb9, v26.13.1: `pnpm install --frozen-lockfile` → rc 0; `pnpm lint` → rc 0, 2522 files; `pnpm typecheck` → 7/7; `pnpm test` → 8/8 (web 523, core 42, rmk 23, repo-tools 22, marketplace 15, mcp 5 files); `pnpm build` → 5/5, 0 cached; `pnpm build:server` → rc 0; `pnpm packages:check` → 4 packages "all on the allowlist". `release:smoke` and `pnpm dev` start servers, left out of this pass: they rest on Task 1 rows 10–11 (788a01c5, Node 26); the later change to the start path is #315's, whose pass started the packed server |
| 2 | AC2: `test:runtime` leaves out `*.test.tsx` and repo-tools, runs everything else (SQLite db tests included), passes on 22.14.0, and has a CONTRIBUTING row | no | confirmed | Task 2 rows 2–4, 9 and re-check rows 3, 4, 12 (468 files, the expected list, 199 `[db]`); Task 7 rows 7–8 (22.14.0, 7/7, 0 `.test.tsx`); `ci.yml` runs `pnpm test:runtime` only when `matrix.role == 'minimum'` |
| 3 | AC3: `ci.yml` has two role-named jobs; the target runs everything the Node 24 job ran, the minimum only install and `test:runtime`; no `if:` names a version | no | confirmed | Task 3 rows 2–6 and re-check row 1; matrix `22.14.0/minimum/"Runtime tests (minimum Node.js)"` and `26/target/"Lint, typecheck, test, build (target Node.js)"`; every step `if:` uses `matrix.role` or `needs.changes` |
| 4 | AC4: `server-checks.yml` has 6 install jobs, no 24 job; services take the target from `.nvmrc` (setup-node on Linux, Homebrew on macOS, failing on a major mismatch) | no | confirmed | Task 3 row 8; Task 4 rows 10, 12, 13 and re-checks (fake-brew probe); `node: [22.14.0, 26]` × 3 OSes; `node-version-file: .nvmrc` (line 76); `tr -d '[:space:]' < .nvmrc` and `::error::` on mismatch (122–129) |
| 5 | AC5: the minimum's entries in both workflows are exactly `MIN_NODE` | no | confirmed | Task 7 rows 1, 2, 4 and re-check 1 row 7; `ci.yml` `- node: 22.14.0`, `server-checks.yml` axis and include `22.14.0`; `node-version.test.ts:13` expects "22.14.0" |
| 6 | AC6: `.nvmrc` 26; Dockerfile `node:26-trixie-slim` by digest, prints v26; `NODE_MAJOR` 26, `bundle.js` verifies a 26 build; the feed workflow uses 26, golden files match | no | confirmed | Task 4 rows 1, 5–9 (`docker run … node --version` → v26.13.1; SHASUMS256 match; golden test with a mutation); `od -c .nvmrc` → `2 6 \n`; `Dockerfile:9` `node:26-trixie-slim@sha256:e6bedef2…20bc`; `bundle.js:31`; `feed-workflow.ts:44,78` and both golden files |
| 7 | AC7: `bundles.yml` and `packages.yml` read `.nvmrc` | no | confirmed | Task 4 row 11; `bundles.yml:46`, `packages.yml:58` `node-version-file: .nvmrc` |
| 8 | AC8: the drift guard passes, and fails on a wrong major, a minimum entry that isn't `MIN_NODE`, or wrong or missing `engines` | no | confirmed | Task 5 row 2 and re-checks 1–5; Task 7 rows 3–5, 14 and re-check 1 rows 1–6; `pnpm --filter @ronneai/repo-tools test` → 22 files, 221 passed |
| 9 | AC9: the N-API guard passes, finds both native modules, fails on a non-N-API or per-version `.node` | no | confirmed | Task 5 rows 7–9, 12; re-check 1 row 10; the same 221-test run |
| 10 | AC10: tsdown's target and `@types/node` unchanged; `engines`, `MIN_NODE` and "22.14 or later" are #315's | no | confirmed | `git diff 52d1d818 HEAD` in `*package.json`, `node-version.ts`, tsdown configs, `packages/config` → only `+"test:runtime"`; `apps/web/tsdown.config.ts:32` `target: "node22"`; `@types/node` 22.20.5; CONTRIBUTING's "22.14 or later" line changes 24 → 26 only |
| 11 | AC11: the listed documents state the 26 target and the CI split, and nothing outside history calls 24 the target | no | confirmed | Task 6 rows 4–13 and re-check rows 2, 3, 17; Task 7 row 12; `git grep` for `Node(.js)? 24`, `node:24`, `node@24`, `node-version: 24`, `24 LTS` outside history and tests → only 188's SPEC and PLAN and `image-security-updates.md:16` (dated). Wording: `test-runs.md` names the target through `.nvmrc`, and `turbo-test-inputs.md:14` is dated history; neither says "26" |
| 12 | AC12: the website says Node.js 26 wherever it named 24 as the target, in en, pt and fr | no | confirmed | Task 8, all 8 rows; ronne-web 486a25a clean, `git diff --stat bbf572c 486a25a` → the same 5 files; `grep -rn 'Node.js 24\|target: "24"' www/src www/messages` → rc 1 |
| 13 | AC13 and the plan step: no required check on `main` is one of the renamed jobs | yes | confirmed | `gh api …/branches/main/protection/required_status_checks --jq .contexts` → the 9 contexts the note lists; `gh api …/rules/branches/main` → `deletion`, `non_fast_forward`, `pull_request` only; `git diff main -- .github/workflows` renames the CI check job, "Install and run (…)" and one step, none required |
| 14 | 188's status is set in the index, like other finished features with website Documentation | no | confirmed | row 188 → `done (the Documentation in ronne-web \`feat/marketplace-188-node-26\`)`, the form of 132, 134–137; the branch exists at 486a25a |
| 15 | `pnpm witness:check` and `pnpm docs:check` pass, and all 13 criteria are ticked | no | confirmed | on the working tree: both rc 0; `git diff` SPEC.md → 13 `[ ]` → `[x]`, nothing else |

**Overall:** met: every acceptance criterion is ticked and backed by a witness pass (tasks 1–8, plus this pass's runs at 6d6c4fb9), no renamed job is a required check, and both checks pass.

After the pass, criterion 11 was reworded to match row 11: `test-runs.md` takes the target from `.nvmrc`, and `turbo-test-inputs.md` keeps its dated history. Nothing else changed.

## Task 10 — libatomic

Witnessed: 2026-11-20 22:11 EST, by a fresh agent (blind). Commit: 8e6fc070. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Node.js 26's Linux binary links `libatomic.so.1` and 24's didn't | no | confirmed | official `node-v26.13.1` and `node-v24.22.3` `linux-x64` and `linux-arm64` (all `shasum -c` OK against SHASUMS256.txt), DT_NEEDED read with `probes/elf-needed.mjs`: 26.13.1 lists `libatomic.so.1` on both arches, 24.22.3 on neither |
| 2 | #318's `packages.yml` failed on it before the fix | no | confirmed | `gh run view 44848070447 --log-failed`, attempts 1 and 2 (head 11ea8d3e), Packages (x64) and (arm64): `/opt/rmk-server/node/bin/node: error while loading shared libraries: libatomic.so.1: cannot open shared object file`, then `✗ postinstall didn't install the service` on rmk-pkg-ubuntu |
| 3 | `nfpm.yaml` makes the deb depend on `libatomic1` and the rpm on `libatomic.so.1()(64bit)` | no | confirmed | `nfpm.yaml:42`, `:53`; parsed with yaml 2.9.1 → `overrides.deb.depends` and `overrides.rpm.depends` hold them; run 44859097767's `linux-packages-x64` artifact: deb `Depends: libc6 (>= 2.34), libstdc++6 (>= 11), libatomic1`, rpm header `libatomic.so.1()(64bit)` (arm64 artifact not inspected; row 6 covers arm64) |
| 4 | `package-linux.test.js` checks both, and the repo-tools tests pass | no | confirmed | `pnpm --filter @ronneai/repo-tools test` → 22 files, 221 passed; in a scratch copy, deleting either line fails the test, restoring passes 5/5. Weakness: a text `toContain`, so `# - libatomic1` still passes |
| 5 | The release notes name libatomic for the Linux archives | no | confirmed | `release.yml:439`: "…glibc 2.34 or later … and libatomic (`apt install libatomic1` or `dnf install libatomic` where it's missing: Node.js needs it)"; the file parses (11 jobs) |
| 6 | `packages.yml`'s x64 and arm64 jobs pass on #318 at 8e6fc070 | no | confirmed | `gh run view 44859097767 --json headSha,conclusion` → `8e6fc070… success`; both jobs log `✓ install …`, `✓ upgrade … (200)`, `✓ install again` on ubuntu, debian and fedora, then `✓ the packages install, upgrade and remove on Ubuntu 24.04, Debian 13 and Fedora 42`; `test-in-containers.sh:48-50` never installs libatomic |
| 7 | `test-runs.md`'s table has the risk | no | confirmed | `docs/knowledge/test-runs.md:100` |
| 8 | SPEC.md has the table row and the edge case | no | confirmed | `SPEC.md:118` (matches the run's log); `SPEC.md:160-163`, facts match rows 1–3 and 5 |
| 9 | The new acceptance criterion would be true if ticked | no | confirmed | `SPEC.md:222`, unticked; each part holds: rows 3, 5, 6 |

**Overall:** met: the packages declare libatomic in both formats, the unit test guards both strings, the release notes and test-runs.md name it, and #318's x64 and arm64 package jobs pass at 8e6fc070 where they failed on libatomic before.

Finding (not blocking): the test checks `nfpm.yaml` as text, so a commented-out or misplaced dependency passes it; only `packages.yml` would catch it. Fixed in 980c7287 (re-check 1 below).

## Task 10 — libatomic (adversarial)

Witnessed: 2026-11-20 22:22 EST, by a fresh agent (adversarial). Commit: 8e6fc070. Machine: macOS 27.2.1 (arm64; Docker 29.9.3, amd64 emulated), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Node.js 26's Linux binary links `libatomic.so.1` and 24's doesn't, on x64 and arm64, and needs no other new library | no | confirmed | node-v26.13.1-linux-{x64,arm64}, node-v24.22.3-linux-x64, SHASUMS256 `OK`; `readelf -d`: both 26 builds NEEDED `libatomic.so.1` (`LIBATOMIC_1.0`), 24 not; every other NEEDED entry the same as 24's (`elf-node.txt`) |
| 2 | #318's `packages.yml` failed on it before the fix | no | confirmed | run 44848070447 (11ea8d3e), both jobs, attempts 1 and 2; jobs 136674024935 (x64) and 136706229829 (arm64): `✗ postinstall didn't install the service`, `libatomic.so.1: cannot open shared object file` |
| 3 | The CI containers lacked libatomic, so the later pass comes from the dependency | no | confirmed | the 3 images built with `test-in-containers.sh`'s install lines: Ubuntu 24.04, Debian 13, Fedora 42 → `no libatomic` (`ci-images-libatomic.txt`); the only build-relevant change 11ea8d3e → 8e6fc070 is `nfpm.yaml` |
| 4 | The `.deb` depends on `libatomic1` | no | confirmed | `nfpm.yaml:42` under `overrides.deb.depends`; CI artifacts, `dpkg-deb -f`, amd64 and arm64 → `Depends: libc6 (>= 2.34), libstdc++6 (>= 11), libatomic1` |
| 5 | The `.rpm` depends on `libatomic.so.1()(64bit)`, resolvable on both arches, RHEL 9 and openSUSE too | no | confirmed | `rpm -qp --requires` x86_64 and aarch64 → `libatomic.so.1()(64bit)`; `dnf`/`zypper install` of the CI rpm in clean containers: aarch64 Fedora 42, Rocky 9.9, UBI 9.9, Amazon Linux 2023, openSUSE Leap 15.6; x86_64 Fedora 42, Rocky 9.9, Leap 15.6 → libatomic pulled in, exit 0, `node: v26.13.1` (`distros-*.txt`) |
| 6 | `libatomic1` installs on the oldest systems the .deb claims | no | confirmed | `apt-get install ./rmk-server_0.8.0-1_<arch>.deb` in clean debian:12 and ubuntu:22.04, arm64 and amd64 → `libatomic1 12.2.0-14+deb12u1` / `12.3.0-1ubuntu1~22.04.3`, exit 0, `node: v26.13.1`; Ubuntu 24.04 and Debian 13 the same |
| 7 | Nothing else in the packaged tree needs an undeclared library | no | confirmed | `ldd` on node and every `*.node` under `/opt/rmk-server`, 15 container runs: only `libc.musl-*.so.1` not found, from better-sqlite3's `linuxmusl-*` prebuilds, which glibc never loads (`pkg-meta.txt`) |
| 8 | `package-linux.test.js` checks both dependencies | no | partly | deleting either line fails it; but `toContain` on the whole file: with line 42 as `      # - libatomic1` → `Tests 5 passed`; moved to the other format or under `suggests` also passes |
| 9 | The repo-tools tests pass | no | confirmed | `pnpm --filter @ronneai/repo-tools test` → 22 files, 221 passed; on a `git archive 8e6fc070` copy, `package-linux.test.js` → 5 passed (the copy's one other failure, node-versions, is its missing `packages/server/node_modules`) |
| 10 | `packages.yml`'s x64 and arm64 jobs pass on #318 at 8e6fc070 | no | confirmed | run 44859097767, headSha 8e6fc070, success; jobs 136709081085 (x64) and 136709081006 (arm64): install, upgrade, remove, install-again and purge `✓` lines on Ubuntu, Debian and Fedora |
| 11 | The release notes name libatomic for the Linux archives | no | confirmed | `release.yml:439` run through bash → "…and libatomic (`apt install libatomic1` or `dnf install libatomic` where it's missing: Node.js needs it)…", backticks escaped |
| 12 | `test-runs.md`'s table has the risk | no | confirmed | `test-runs.md:100`; `SPEC.md:118` |
| 13 | The install script, the bundles and the Docker image have no such gap | no | confirmed | `install.sh:274-283` installs through `apt-get`/`dnf install -y`; the image's `node:26-trixie-slim@sha256:e6bedef…` has `libatomic1 14.2.0-19`, `ldd node` resolves it, runtime stage `FROM base`; `bundle.js` writes no requirement text, the release notes cover the archives |
| 14 | No other doc states the packages' or archives' requirements without libatomic | no | confirmed | `README.md:150-152`, `install.md:199`, ronne-web `install.tsx:248` give glibc 2.34 for the apt/dnf packages, which install libatomic themselves; `git grep` finds no other text on the Linux archives |
| 15 | The new acceptance criterion would be true | no | confirmed | rows 4–5, 11, 10; unticked at the commit (`SPEC.md:222`) |

**Overall:** not met: everything holds, the dependency on every distribution and arch tried included, except row 8: the unit test passes with the deb dependency commented out.

## Task 10 — libatomic (re-check 1)

Witnessed: 2026-11-20 22:23 EST, by a fresh agent (adversarial). Commit: 980c7287. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The test reads each format's own `overrides.<deb\|rpm>.depends` list, not the whole file's text | yes | confirmed | `git show 980c7287`: `toContain` became `expect(dependsOf(template, "deb"\|"rpm")).toEqual([...])`; `dependsOf` (`package-linux.test.js:17-32`) skips `#` lines, stops at the first non-item line; a self-test covers comments and `suggests` |
| 2 | It fails when deb's `- libatomic1` is commented out | yes | confirmed | `probes/run.sh comment` (scratch copy) → `1 failed \| 5 passed`; `rpmcomment` → 1 failed; restored, `cmp` clean |
| 3 | It fails when `libatomic1` is moved to the rpm list | yes | confirmed | `probes/run.sh moved` → 1 failed |
| 4 | It fails when `libatomic1` is moved under deb's `suggests:` | yes | confirmed | `probes/run.sh suggests` → 1 failed |
| 5 | The real `nfpm.yaml` passes, with the two expected lists | yes | confirmed | `vitest run src/package-linux.test.js` → `6 passed`; yaml.v3 (`goprobe/probe orig.yaml`) → the same two lists, same order |
| 6 | The repo-tools tests pass | yes | confirmed | 22 files, 222 tests passed; `biome check` on the test → no issues |
| 7 | Nothing else changed between 8e6fc070 and 980c7287 | yes | confirmed | `git diff --name-only 8e6fc070 980c7287` → only `package-linux.test.js` (+48 −6) |
| 8 | No edit of `nfpm.yaml` that drops a dependency from a package still passes the test | no | partly | comment out, move, `suggests`, CRLF (`2 failed`) fail; a second deb `depends:` passes (`dupdepends`), though yaml.v3 refuses it; **`decoy` passes**: `- libatomic1` dropped from `overrides.deb.depends`, a copy of the deb block inside `description: \|-` → `6 passed`, while yaml.v3 gives deb only libc6 and libstdc++6. `dependsOf` matches the first `  deb:` anywhere. `overrides:` renamed to `x-overrides:` also passes |

**Overall:** not met: the three mutations from the last pass now fail, and the real file and the repo-tools tests pass, but `dependsOf` doesn't check that `  deb:` sits under `overrides:`, so a copy of the block elsewhere hides a dropped dependency.

Fixed after this pass: `dependsOf` reads only inside the top-level `overrides:`, returns `undefined` without one or with two `depends:` in a format, and the self-test covers a copy before and after `overrides:`, a renamed `overrides:` and a second `depends:`. With it, all eight of the probe's mutations (`comment moved suggests rpmcomment decoy renamed crlf dupdepends`) fail the test, and the real file passes.

## Task 10 — libatomic (re-check 2)

Witnessed: 2026-11-20 22:29 EST, by a fresh agent (blind). Commit: 8b76acee (the same tree as 0b0cc7b4 on `feat/188-libatomic-test`: `git rev-parse 8b76acee^{tree} HEAD^{tree}` → `25825012…` for both). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the test file changed between 980c7287 and 8b76acee | no | confirmed | `git diff --stat 980c7287 8b76acee` → `packages/repo-tools/src/package-linux.test.js` (+32 −9) |
| 2 | The real `nfpm.yaml` passes with both full lists, and the repo-tools tests pass | no | confirmed | `pnpm --filter @ronneai/repo-tools test` → 22 files, 222 passed; `toEqual` on the three deb and three rpm entries; yaml.v3 gives the same lists; `pnpm exec biome check` → clean |
| 3 | `dependsOf` reads only inside the top-level `overrides:`, so a copy of the deb block elsewhere doesn't count | no | confirmed | `run.sh decoy` → 1 failed; with 980c7287's `dependsOf` put back, the new self-test fails (`expected [ 'decoy' ] to deeply equal [ 'libc6' ]`) |
| 4 | `undefined` without `overrides:` | no | confirmed | `run.sh renamed` → 1 failed, `expected undefined …`; the self-test asserts it |
| 5 | `undefined` with two `depends:` in a format | no | confirmed | `run.sh dupdepends` → 1 failed; the self-test's `twice` case |
| 6 | The earlier mutations still fail | no | confirmed | `run.sh comment moved suggests rpmcomment crlf` → each 1 failed (crlf 2); `cmp` clean after each |
| 7 | No edit of `nfpm.yaml` drops a dependency (as a YAML parser reads it) and still passes the test | no | not met | `run2.sh quoted`: the description as one double-quoted scalar holding a full `overrides:` block, `libatomic1` dropped from the real list → yaml.v3 (strict, as nFPM: `KnownFields(true)`) deb = libc6, libstdc++6; test `6 passed`. `run2.sh seconddoc`: the real key as `overrides: # per format` without `libatomic1`, a full block in a second document after `---` → same, `6 passed` (nFPM reading one document inferred from yaml.v3). A merge key `<<:` before or after the list and an alias of the deb block fail the test or the parse |

**Overall:** not met: rows 1–6 hold, but two contrived edits still drop `libatomic1` from the deb package and pass the test; a line-by-line reader can't settle row 7.

## Task 10 — libatomic (re-check 3)

Witnessed: 2026-11-20 22:58 EST, by a fresh agent (adversarial). Commit: bf01ecc5. Machine: macOS 27.2.1 (arm64; Docker, arm64 containers), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `test-linux-package.sh` reads the newer built package's `Depends` (deb) and `Requires` (rpm) before installing | no | confirmed | `test-linux-package.sh:46-66`: `dpkg-deb -f "$new" Depends`, `rpm -qp --requires "$new"`, `grep -qxF` per needed line, before `install "$old"`; `probes/check.sh` on #318's CI arm64 artifacts → ✓ (debian:13, fedora:42) |
| 2 | It fails, naming the library, when one is dropped from `nfpm.yaml` | no | confirmed | nFPM 2.47.0 Darwin_arm64 (`shasum -c checksums.txt` OK), `probes/build.sh`: `drop` → `✗ … doesn't depend on libatomic1 (it declares: libc6 (>= 2.34);libstdc++6 (>= 11))`, the same for `libatomic.so.1()(64bit)`; `droplibc` → names `libc6 (>= 2.34)` and the libstdc++ line; nothing installed |
| 3 | A weakened version, a weak dependency, `Pre-Depends` or a second `Depends` field doesn't pass it | no | confirmed | `weak`, `recommends` → ✗ both formats; `predep` → deb ✗; `fields` → `dpkg-deb -f` fails (`duplicate value for 'Depends' field`), empty → ✗; `foldalt` (`libatomic1 \| dpkg`) → ✗ |
| 4 | No way the check passes on a package that doesn't really declare the dependency | no | not met | `richnl`: rpm depends `"(bash or\nlibc.so.6(GLIBC_2.34)(64bit)\n)"`, the same for libatomic; `rpm -qp --requires` (rpm 4.20.1) prints `(bash or` / the library / `)` on separate lines, `grep -x` matches → ✓; `dnf install` in clean fedora:42 → exit 0, `package libatomic is not installed` |
| 5 | So any edit of `nfpm.yaml` that drops one of them fails CI | no | not met | follows from row 4; for libatomic the Fedora install would still fail (node doesn't start), but fedora:42's base has glibc 2.41 and libstdc++ 15.2.1, so the rich form on those lines passes the check and the install |
| 6 | A failure stops the job | no | confirmed | dash (debian:13, ubuntu:24.04) and bash-as-sh (fedora:42) → exit 1 after the ✗ line; `probes/exec-status.sh` (bash `-euo pipefail` around `docker exec … sh test-linux-package.sh`, as `test-in-containers.sh:56`) → `caller exit=1` |
| 7 | The check reads only the newer package, and both arches run it | no | confirmed | `case $new` (`:46`); `packages.yml` x64 and arm64 both call `test-in-containers.sh older linux-packages`; the older 0.0.1 comes from the same template in the same step |
| 8 | On #319's CI (Server package run 44861706181) both Packages jobs pass and log the check | no | confirmed | headSha `bf01ecc5…`, success; jobs 136717169235 (x64), 136717169314 (arm64): the ✓ dependency line for the `.deb` on ubuntu and debian and the `.rpm` on fedora, then install, upgrade, remove, install-again and purge ✓ |
| 9 | The PLAN text, the SPEC criterion and `test-runs.md` describe the check | no | confirmed | `PLAN.md:141-149`, `SPEC.md:222-225`, `test-runs.md:100`; wording: `test-runs.md` says "each built", only the newer one is read |
| 10 | The repo-tools tests pass | no | confirmed | 22 files, 222 passed |
| 11 | Task 10's Done when and the last acceptance criterion are now true | no | partly | the jobs pass on #318 and #319, the tests pass, the packages declare libatomic; but a rich rpm dependency passes the check (rows 4–5) |

**Overall:** not met: the deb check holds against every mutation tried and failures stop the job, but the rpm check matches lines of `rpm -qp --requires`, so a rich dependency written across lines passes it without needing the library.

Fixed after this pass: the check requires the declared list to be exactly the three expected lines, in order (`[ "$declared" = "$needed" ]`; the real packages declare exactly those, and nothing else in `Depends` or `Requires`), and `test-runs.md` says "the newly built". With the probe's nine packages, every mutated format fails (`drop`, `droplibc`, `weak`, `recommends` in both; `predep`, `fields`, `foldalt` in the deb; `richnl` in the rpm: `declares [(bash or;libc.so.6(GLIBC_2.34)(64bit););…], not exactly […]`), and the real packages pass.

## Task 10 — libatomic (re-check 4)

Witnessed: 2026-11-20 23:09 EST, by a fresh agent (adversarial). Commit: 6331a398. Machine: macOS 27.2.1 (Docker, arm64 Linux containers), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The check requires the declared list to equal exactly the three expected lines, in order, for the deb and the rpm | yes | confirmed | `git show 6331a398 -- scripts/` → `[ "$declared" = "$needed" ] \|\| fail "… declares [..], not exactly [..]"`; `declared` from `dpkg-deb -f "$new" Depends \| tr ',' '\n' \| sed 's/^ *//'` or `rpm -qp --requires "$new"`; `needed` in nfpm.yaml's order |
| 2 | The real packages declare exactly those three and pass | yes | confirmed | `probes/check.sh pk/orig` (nfpm.yaml at 6331a398) → ✓ deb (debian:13), ✓ rpm (fedora:42); CI the same on x64 and arm64 (row 7) |
| 3 | No wrong refusal from whitespace or a trailing newline | no | confirmed | `dpkg-deb -f orig.deb Depends \| od -c` → one trailing `\n`, stripped by `$(…)`; `rpm -qp --requires` ends `(64bit)\n`; nFPM writes `, `, the `sed` removes the space; no CR, no trailing blanks |
| 4 | The older 0.0.1 package isn't wrongly refused | no | confirmed | only `$new` is checked (lines 44-60); as the new package, `build.sh v001` → `check.sh pk/v001` → ✓ `rmk-server_0.0.1-1_arm64.deb`, ✓ `rmk-server-0.0.1-1.aarch64.rpm` |
| 5 | Every mutation from re-check 3 fails in the format it changes | yes | confirmed | `check.sh` on each `pk/*`: drop, droplibc, recommends, weak (deb and rpm), fields (`declares []`), foldalt, predep (deb), richnl (rpm) refused; the other format passes only where `diff` shows it unchanged |
| 6 | A failure still stops the job | yes | confirmed | `probes/exec-status.sh` (`pk/drop` deb through `docker exec` in a `set -euo pipefail` caller) → the ✗ line, caller exit=1, `NOT STOPPED` never printed |
| 7 | On #319 at 6331a398 (run 44863161824) both Packages jobs pass and log the check | yes | confirmed | headSha `6331a398a199…`, success; Packages (arm64) 3m40s, (x64) 3m52s pass; jobs 136722161922 / 136722161988: the ✓ dependency lines for the `.deb` (Ubuntu, Debian) and `.rpm` (Fedora), then `✓ the packages install, upgrade and remove on Ubuntu 24.04, Debian 13 and Fedora 42` |
| 8 | The docs match the script | yes | confirmed | PLAN.md:142-146, SPEC.md:222-225, test-runs.md:100; nit: the PLAN says "the built package", the others "newly built"; none is false |
| 9 | Task 10's Done when and the criterion would now be true | yes | confirmed | repo-tools 22 files, 222 passed; Packages pass on #318 and #319 |
| 10 | No package passes the check without really depending on all three libraries | no | partly | `build.sh provides`: `provides: [libatomic1]` (deb), `["libatomic.so.1()(64bit)"]` (rpm), depends unchanged → `check.sh pk/provides` ✓ both; `apt-get install -s` (debian:13) → `Inst rmk-server` only; `dnf install --assumeno` (fedora:42) → no libatomic. The job still fails later for libatomic (node v26.13.1 on clean debian:13 → `libatomic.so.1: cannot open shared object file`, exit 127); the same edit for libc6 or libstdc++6 passes, since the containers have both |

**Overall:** not met: the exact match closes re-check 3's hole, the real packages (0.8.0 and 0.0.1) pass, every earlier mutation fails, a failure stops the job, and #319's Packages jobs pass; but a package that `provides` a library itself passes the check without pulling it in (row 10), low severity: a deliberate template edit, and for libatomic the install step still fails.

Fixed after this pass (the owner chose one more round): the check also requires the newer package to provide nothing but itself (deb: no `Provides`; rpm: exactly `rmk-server = <version>-<release>`, as the real packages do), and fails with a message when `dpkg-deb` or `rpm` can't read the package. On the probe's packages: `provides` → `✗ … provides [libatomic1], not only itself []` (deb) and `[libatomic.so.1()(64bit);rmk-server = 0.8.0-1]` (rpm); `fields` → `✗ dpkg-deb can't read …'s control file`; every other mutation still fails in its format, and the real 0.8.0 and 0.0.1 packages pass.

## Task 10 — libatomic (re-check 5)

Witnessed: 2026-11-20 23:27 EST, by a fresh agent (adversarial). Commit: 28e91e4d. Machine: macOS 27.2.1 (arm64; probes in Docker debian:13 and fedora:42, arm64), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | deb: `dpkg-deb -f … Provides` must be empty | no | confirmed | `test-linux-package.sh:49-50,71-72`; `check.sh pk/provides` → `✗ … provides [libatomic1], not only itself []`; a lowercase `deb.fields: provides:` (`pk/lcprov`) fails the same way |
| 2 | rpm: `rpm -qp --provides` must be exactly `rmk-server = <VERSION>-<RELEASE>` | no | confirmed | `pk/provides` → `✗ … provides [libatomic.so.1()(64bit);rmk-server = 0.8.0-1], not only itself […]`; `pk/selfname` (named `libatomic1`) → rpm ✗ |
| 3 | It fails with a message when `dpkg-deb` can't read the package | no | confirmed | 100 random bytes (`pk/garbage`), an empty file (`pk/empty`), a duplicate `Depends` (`pk/fields`) on debian:13 → exit 1, `✗ dpkg-deb can't read …'s control file` |
| 4 | It fails with a message when `rpm` can't read the package | no | not met | the same files on fedora:42 → exit 3 / 1, empty log: line 56's `declared=$(rpm -qp --requires …)` has no `\|\| fail`, so `set -e` ends the script first; the job still fails |
| 5 | The real 0.8.0 and 0.0.1 packages pass | no | confirmed | `pk/orig`, `pk/v001` → ✓ in both formats; a pre-release `pk/rc` (`0.9.0~rc.1-1`) also passes |
| 6 | The `provides` package and every earlier mutation fail in the format they change | no | confirmed | drop, droplibc, weak (both); predep, recommends, foldalt, fields (deb); recommends, richnl (rpm); provides (both); unchanged formats pass |
| 7 | No package passes without really depending on all three libraries | no | partly | `pk/selfname` (`name: libatomic1`, Provides empty, Depends exact) → debian:13 ✓, and apt installs it with no real libatomic1: the deb side never checks `Package`; CI would still stop at the upgrade (`trying to overwrite '/opt/rmk-server/bin/rmk-server'`) |
| 8 | A failure still stops the job | no | confirmed | `test-in-containers.sh:6` `set -euo pipefail`, `:57` `docker exec … sh /s/test-linux-package.sh`; every failing probe exited non-zero |
| 9 | On #319 at 28e91e4d (run 44865257610) both Packages jobs pass and log the check | no | confirmed | headSha 28e91e4d, success; jobs 136728256724, 136728256767: 3 ✓ dependency lines each |
| 10 | The docs match the script | no | partly | PLAN.md:146-147, SPEC.md:222-225, test-runs.md:100 match lines 49-72, except row 4 (rpm) and row 7 (deb name) |
| 11 | Task 10's Done when and the criterion are now true | no | partly | `package-linux.test.js` 6 passed; Packages pass on #319; the rpm "can't read" message doesn't exist (row 4) |

**Overall:** not met: the provides check refuses every package that provides a library and passes the real 0.8.0, 0.0.1 and rc packages, but an unreadable rpm stops the script without a message, and a deb named after a library passes the check.

Fixed after this pass: `rpm -qp --requires` gets `|| fail "rpm can't read …"`, and the deb side reads `dpkg-deb -f … Package Provides`, which must be exactly `Package: rmk-server`. On all 16 of the probe's packages: orig, v001 and rc pass in both formats; `pk/empty` and `pk/garbage` → `✗ rpm can't read …` on fedora:42 and `✗ dpkg-deb can't read …` on debian:13; `pk/selfname` → `✗ libatomic1_0.8.0-1_arm64.deb provides [Package: libatomic1], not only itself [Package: rmk-server]`; every other mutation fails in the format it changes.

## Task 10 — libatomic (re-check 6)

Witnessed: 2026-11-20 23:53 EST, by a fresh agent (blind). Commit: a2ca9300. Machine: macOS 27.2.1, Node v26.13.1.

Scope (owner): a narrow confirming pass of re-check 5's open rows 4 and 7, plus a rerun of the existing probe packages; no hunt for new bypasses.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `rpm -qp --requires` has `\|\| fail "rpm can't read …"`: an empty and a garbage file named as the rpm fail on fedora:42 with that message | no | confirmed | `git diff 28e91e4d a2ca9300` → the `\|\| fail`; `check.sh pk/empty`, `pk/garbage` on fedora:42 → exit 1, `✗ rpm can't read rmk-server-0.8.0-1.aarch64.rpm` |
| 2 | The deb side reads `dpkg-deb -f … Package Provides`, which must be exactly `Package: rmk-server`: `pk/selfname` fails on debian:13 | no | confirmed | `itself='Package: rmk-server'`; `check.sh pk/selfname` → `✗ libatomic1_0.8.0-1_arm64.deb provides [Package: libatomic1], not only itself [Package: rmk-server]` (✓ in re-check 5); the rpm side still fails |
| 3 | Across the 16 probe packages, orig, v001 and rc pass in both formats, and every mutation fails in the format it changes | no | confirmed | `probes/all.sh` (32 container runs): orig, v001, rc ✓ both; drop, droplibc, weak, recommends, provides, selfname, empty, garbage ✗ both; fields, foldalt, predep, lcprov ✗ deb, ✓ rpm; richnl ✗ rpm, ✓ deb; no `rmk-w6-*` container left |
| 4 | On #319's CI at a2ca9300 (run 44866463473), both Packages jobs pass and log the ✓ line for the .deb and the .rpm | no | confirmed | headSha a2ca9300, success; job 136731823784 (x64) and 136731823798 (arm64): the ✓ line for the `.deb` ×2 and `.rpm` ×1, then install, upgrade, remove, purge ✓ |
| 5 | `git diff 28e91e4d a2ca9300` changes only the script and WITNESS.md | no | confirmed | `git diff --stat` → those 2 files (script 11 lines, WITNESS.md +22) |
| 6 | The repo-tools tests pass, and task 10's Done when and the SPEC's last criterion would now be true | no | confirmed | 22 files, 222 passed; `nfpm.yaml:42,53`, `package-linux.test.js:87`, `release.yml:439`, `test-runs.md:100`; `packages.yml` x64 and arm64 pass on #318 and #319; "provides nothing but itself" covers the deb's `Package` check too |

**Overall:** met: an unreadable rpm fails with `rpm can't read …`, a deb named after a library fails on its `Package` field, all 16 probe packages behave as expected in both formats, and both CI package jobs at a2ca9300 log the ✓ dependency line.

## Task 10 — libatomic (re-check 7)

Witnessed: 2026-11-20 23:58 EST, by a fresh agent (adversarial). Commit: a2ca9300 (merged to main as bb2bf9c5; `git diff a2ca9300 bb2bf9c5 -- scripts packaging packages` is empty). Machine: macOS 27.2.1 (arm64, Docker running debian:13 and fedora:42), Node v26.13.1.

Scope (owner): a narrow confirming pass, adversarial in mode: it tries to break re-check 5's two fixes (row 4, an unreadable rpm; row 7, a deb named after a library), reruns the existing probe packages, and doesn't look for unrelated new bypasses. Re-check 6 confirmed the same fixes, but blind, and a [risky] task needs its latest adversarial pass met.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `declared=$(rpm -qp --requires …) \|\| fail "rpm can't read …"`: an unreadable rpm (empty, garbage, truncated) fails on fedora:42 with that message | no | confirmed | `test-linux-package.sh:56`; rpms cut to 60, 400, 1400, 2000 bytes and to half, plus `empty`, `garbage` → exit 1, `✗ rpm can't read rmk-server-0.8.0-1.aarch64.rpm`; from 2500 bytes on only the payload is cut: ✓, then `✗ dnf install …`; a non-rpm file read as a manifest with 255/256/257/512 missing names → `exit=254`, never 0 (`rpm-overflow.sh`); with `\|\| fail` removed from lines 49 and 56, `garbage` stops at `exit=3` with no message |
| 2 | The deb side requires `dpkg-deb -f … Package Provides` to be exactly `Package: rmk-server`; any other `Package` or any `Provides` fails, the real deb passes | no | confirmed | `test-linux-package.sh:49-50,72-73`; debs rebuilt with `dpkg-deb --nocheck` (`deb-craft.sh`): `prefix` (rmk-server-proxy), `swap`, `provfirst`, `provself` → `✗ … provides [...], not only itself`; `dupe`, `contprov` → `can't read … control file`; `upper`, `lcpkg`, `trailws`, `provempty` pass, and dpkg reads each as `Package: rmk-server` with no Provides, so none is a bypass; debs cut to 60–700 bytes → `can't read`; cut only in data → ✓, then `✗ apt-get install` |
| 3 | Across the 16 probe packages the real ones pass in both formats and every mutation fails in the format it changes | no | confirmed | `all.sh`: orig, v001, rc ✓ both; drop, droplibc, empty, garbage, provides, recommends, selfname, weak ✗ both; fields, foldalt, lcprov, predep ✗ deb, ✓ rpm; richnl ✗ rpm, ✓ deb |
| 4 | On #319's CI at a2ca9300 (run 44866463473) both Packages jobs pass and log the ✓ line | no | confirmed | headSha a2ca9300bee9…, success; jobs 136731823784, 136731823798: the deb line twice (Ubuntu, Debian), the rpm line once (Fedora) |
| 5 | A failure still stops the job | no | confirmed | `packages.yml:88`, no `continue-on-error`; `test-in-containers.sh:6,57` `set -euo pipefail`, `docker exec`; the real runner with only the image builds stubbed, newer = `provides` → `✗ rmk-server_0.9.0-1_arm64.deb provides [...]`, exit 1 after the first container |

**Overall:** met: unreadable rpms and debs are named and stop the run; a deb has to be `Package: rmk-server` and provide nothing; the 16 probe packages behave as claimed; CI at a2ca9300 logged the check; a failure fails the job.
