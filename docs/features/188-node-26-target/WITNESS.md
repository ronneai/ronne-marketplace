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
