# 082 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — Spike: what goes in the package

Witnessed: 2026-10-04 (23:13–23:15 EDT on 2026-10-03), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, npm 11.5.2, Docker 29.7.2.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Done-when met: the notes record sizes, install times and the choice | confirmed | PLAN.md's task 1 notes have a Measured table (8.4 MB, 34.4 MB unpacked, 65–67 MB installed, 2.5 s macOS, 5.7 s Debian) and "Choice: a new `packages/server`" with three reasons. |
| 2 | The standalone build uses pnpm's symlinked layout; externals resolve through hashed links | confirmed | `find .next/standalone -type l \| wc -l` → 50; `du` → 38M; `.next/standalone/apps/web/.next/node_modules` has `better-sqlite3-bfc5648742806807 -> …/.pnpm/better-sqlite3@13.0.3/…`, `pg-ad45e98bb7b7a165 -> …/.pnpm/pg@8.23.1/…`, `@node-rs/argon2-790216376ce6de64 -> …`. |
| 3 | better-sqlite3 13.0.3 ships 8 prebuilt binaries and has no install script; argon2 uses optional per-platform deps | confirmed | `prebuilds/` holds 8 `.node` files (darwin, linux, linuxmusl and win32, each x64 and arm64). The scripts have no install, preinstall or postinstall, and `gypfile: false`. argon2 has 13 optional platform packages. |
| 4 | Standalone output copies apps/web/.env; the assembler excludes .env; .dockerignore excludes .env | confirmed | `.next/standalone/apps/web/.env` exists, with keys DATABASE_URL, AUTH_SECRET, STORAGE_PATH and PUBLIC_URL (values not read). The assembler's copy filter drops `.env*`. `.dockerignore` lines 8–10 exclude `**/.env` and `**/.env.*`. |
| 5 | The assembler gives no symlinks, no *.node and one-line re-exports; the pack is ~8.4 MB, ~1,753 files, with no .env | confirmed (one file fewer) | 21 packages flattened, `pg-protocol` 1.16.1 kept. 0 symlinks, 0 `.node` files, 3 one-line shims. `npm pack` → 8.4 MB packed, 34.4 MB unpacked, **1,752** files, no `.env`. |
| 6 | macOS: `npm install -g` works (~2.5 s), health 503 → setup → 200 with no restart | confirmed | Empty cache and prefix: real 2.20 s. 65M installed, with `argon2-darwin-arm64` and better-sqlite3's prebuild (no `build/`). Health 503 `setup_required`, then `setup.mjs --yes` (SQLite, migrations 0001–0018, root created), then 200 from the same server process. |
| 7 | Linux (node:22-bookworm-slim) does the same with Node 22, and npm picks a linux argon2 binary | confirmed | Node v22.23.3, npm 10.9.9, aarch64. The install took 5.77 s and chose `argon2-linux-arm64-gnu`. Health 503 → setup → 200. |
| 8 | The notes say Windows wasn't run here and leave it to task 4's CI | confirmed | "Windows wasn't run here: task 4's CI matrix covers it." Windows isn't in the Measured table or the Runs list. |
| 9 | (a) The launcher's child server survives the launcher; (b) the messages name Docker/pnpm, not rmk-server | confirmed | (a) Killing `rmk-server` (PID 99640) left `next-server` (99644) re-parented to PID 1, still on :7656 and answering 200. (b) The start log says "run `docker compose exec web pnpm run setup`"; setup says "start it with `pnpm build && pnpm start`". |

**Not checked here:** Windows (left to task 4's CI); the Alpine/musl and emulated amd64 runs in the notes; signing in for a token (setup creating root already exercises argon2); install time with a warm cache.
**Differences from the notes:** 1,752 files, not 1,753, now corrected in the notes (the first tarball still held the `.env`). The macOS install took 2.20 s against 2.5 s (timing noise). Another finding for task 2, now in the notes: without `PUBLIC_URL`, the start log says "Open http://localhost:3000" whatever the port.
**Overall:** met. Every claim re-run matches, apart from the one-file count and timing noise.

## Task 2 — The package and its command

Witnessed: 2026-10-04 (23:26–23:35 EDT on 2026-10-03), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, npm 11.5.2; Docker 29.7.2 for the Node 20 check.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | package.json: name, bin, engines, deps, files | confirmed | `@ronneai/marketplace` 0.2.0, `bin.rmk-server: ./dist/bin.js`, `engines.node: >=22.12`. The dependencies are exactly `@node-rs/argon2 2.2.1` and `better-sqlite3 13.0.3`, as in apps/web. `files`: dist (without maps and tests) and app. |
| 2 | Unit tests exist and pass | confirmed | `pnpm --filter @ronneai/marketplace test` → 14 passed (cli 6, paths 4, server-env 3, node-version 1). `runtime.test.ts` + `src/features/setup` → 23 passed; `prepare-start` (db) → 6 passed. |
| 3 | lint and typecheck pass | confirmed | `pnpm lint` → exit 0; `pnpm typecheck` → exit 0. |
| 4 | The assembler refuses .env, symlinks and .node files; tarball contents | confirmed | `assemble.mjs` skips `.env*`, leaves out the natives, and exits 1 on a symlink, `.env` or `*.node` in app/ (and with no standalone build, or when the versions differ from apps/web). The tarball has 1,765 entries: no `.env`, no `.node`, no symlinks, no dist tests or maps. It has `dist/bin.js` and `app/apps/web/server.js`. 8,516,580 bytes. |
| 5 | --version, --help, unknown command | confirmed | After `npm install -g --prefix …`, in a clean `env -i`: `--version` → `0.2.0`; `--help` → the commands, options and data folders; `frobnicate` → "Unknown option or command", exit 1. |
| 6 | Defaults to 127.0.0.1:7650 | confirmed | Started without `--port` → `lsof` shows only `127.0.0.1:7650 (LISTEN)`. The LAN address and `[::1]` refuse the connection. |
| 7 | Before setup: 503, and the messages name `rmk-server setup` and localhost:<port> | confirmed | 503 `setup_required` "…or run \`rmk-server setup\`". The log says "Open http://localhost:7650 … or run \`rmk-server setup\`". No docker, no :3000. |
| 8 | `setup --yes`, then health 200 with no restart; data folder contents | confirmed | `setup --yes` (DATABASE_URL, RONNE_ROOT_*, PORT) → exit 0, migrations 0001–0018, root created, and the last message names `rmk-server`. The same server PID then answered 200. The data folder holds `.env`, `ronne.db` and `storage/`, with `STORAGE_PATH=<data>/storage` and `PUBLIC_URL=http://localhost:7650`. |
| 9 | migrate and reset-root-password; old password refused, new one accepted | confirmed | `migrate` → "Nothing to migrate". `reset-root-password --yes` → reset. The old password then gets 401 and the new one 201 at `/api/v1/auth/token`. |
| 10 | Stopping rmk-server frees the port | confirmed | One process: the rmk-server PID itself listens (titled `next-server`) and has no children. `kill` → the port is free; SIGTERM in the pty run freed 7659 too. |
| 11 | Busy port: exit 1, the message names --port | confirmed | "port 7650 is in use on 127.0.0.1. Choose another with --port, for example rmk-server --port 7660.", exit 1. |
| 12 | Opens the browser on the first start in a terminal, and not without one | confirmed | A fake `open` first on PATH. Under `pty.fork` it recorded `http://localhost:7659`; without a terminal it recorded nothing. |
| 13 | macOS default data folder | confirmed | Without RONNE_DATA_DIR: "Data folder: <HOME>/Library/Application Support/RonneAI Marketplace", and the folder was created. |
| 14 | Node 20 refused, naming 22.12.0 | confirmed | `node:20-bookworm-slim`: npm warns EBADENGINE; `rmk-server` → "Node.js 22.12.0 or later is needed; this is 20.20.2.", exit 1. |
| 15 | The notes and the SPEC change match the code | confirmed | `serverEnv` sets RONNE_RUNTIME=npm, RONNE_DATA_DIR, RONNE_ENV_FILE, PORT and HOSTNAME, and never PUBLIC_URL. `defaultDataPath` and `defaultPublicUrl` are used in config, steps, run-setup, the setup page and prepare-start. `run.ts` imports the scripts and doesn't spawn them. |

**Not checked here:**
- Already checked by hand in the notes: `migrate` before setup.
- Covered by unit tests: the setup form's npm hints in a browser, the disabled-root advice and the no-terminal hint, and `--host`/`HOST` at runtime.
- Checked from the code and tests only: the Linux and Windows data folders.
- Left to task 4's CI: Linux and Windows.
- Left to the pre-commit hook: a full `pnpm test`/`pnpm build`.

**Differences from the notes:** none.
**Overall:** met. The package builds, packs, installs with `npm i -g` and does everything task 2 promises on this machine.

## Task 3 — Checks and release

Witnessed: 2026-10-04 (23:34–23:45 EDT on 2026-10-03), by a fresh agent. Machine: macOS arm64, Node v24.0.0, npm 11.5.2, pnpm 12.6.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | packs.js lists @ronneai/marketplace with app/, forbids .env/.env.example/.node even in app/, requires server.js and start.mjs; tests; repo-tools tests pass | confirmed | `server: { name: "@ronneai/marketplace", extra: [/^app\//], forbid: [.env…, .node], require: [server.js, start.mjs] }`. `forbid` is checked before `extra`. The new test covers `.env`, `.env.local`, `.env.example`, `.node`, a dist map and the two missing files. repo-tools → 71 tests passed. |
| 2 | `pnpm build && pnpm build:server && pnpm packages:check` passes, four packages | confirmed | All exit 0. ✓ core 128, rmk 65, mcp 19, marketplace 1,765 files, all on the allowlist. |
| 3 | Negative check: missing standalone build gives a readable failure, not a stack trace | confirmed | With `apps/web/.next/standalone` moved aside: exit 1. The other three got ✓, then "✗ @ronneai/marketplace doesn't pack: ✗ No standalone build in ../../apps/web/.next/standalone. Run: NEXT_OUTPUT=standalone …". No stack trace. Restored afterwards. |
| 4 | `pnpm release:smoke` passes with four tarballs, rmk-server answers 503 setup_required, and no server is left running | confirmed | Exit 0 in ~5.8 s: "Packed 4: …" and "✓ rmk-server 0.2.0 started and answered 503 setup_required". Before and after, only the owner's two pre-existing `next-server` processes were running. |
| 5 | release:version covers the server and the 0.2.0 run changes no package.json | confirmed | `VERSIONED` includes `server: packages/server/package.json`. `pnpm release:version 0.2.0` names @ronneai/marketplace, and `git status` was unchanged, because everything is already at 0.2.0. |
| 6 | turbo.json has NEXT_OUTPUT in build env; root build:server script | confirmed | `tasks.build.env = ["NEXT_OUTPUT"]`. `build:server` runs the standalone web build, then the server package (exit 0). |
| 7 | release.yml and ci.yml wired up and both parse as YAML | confirmed | release.yml runs `pnpm build:server` before `packages:check`/`release:smoke`, packs `core cli mcp server`, and publishes `core rmk mcp marketplace` with `--provenance` (`--dry-run` on a dry run), with `id-token: write` and the "npm" environment. ci.yml runs `build:server` before `packages:check`. Both parse with `yaml`. |
| 8 | Done-when (dry-run release) not done, and the notes say so honestly | confirmed | The notes end with "**Still open:** the *Done when*, a dry-run release … which only the owner can approve." Not attempted. |
| 9 | CLAUDE.md command table updated | confirmed | A `pnpm build:server` row. packages:check names the four packages, release:smoke names `rmk-server`, and release:version says "the four published packages". |

**Not checked here:** the dry-run release on GitHub; npm trusted publishing and provenance on npmjs.com; the CI workflows on GitHub; the full lint, typecheck and test run (left to the pre-commit hook).
**Differences from the notes:** two small points, fixed in this commit:
- The notes' "changes nothing" for `release:version 0.2.0` holds only because everything is already at 0.2.0. Now said.
- `release-version.js`'s header comment didn't mention the server. Updated.

**Overall:** met for the work: packages:check and release:smoke pass for all four packages locally. **The Done-when is not met yet:** a dry-run release on GitHub waits for the merge and the owner's approval, so task 3 stays unticked.

## Task 4 — Three systems

Witnessed: 2026-10-04 (23:38–23:42 EDT on 2026-10-03), by a fresh agent. Machine: macOS arm64, Node v24.0.0, npm 11.5.2, Docker 29.7.2.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The workflow parses, and has the pack, matrix and summary jobs, pinned actions, read-only permissions and `persist-credentials: false` | confirmed | Jobs `changes, pack, install, server-package`. Matrix ubuntu/macos/windows × 22/24, `permissions: contents: read`. pack: install, `pnpm build`, `pnpm build:server`, pack, upload (`if-no-files-found: error`). install: `npm install --global tarball/*.tgz`, then the probe. The summary needs success or skipped. Every action is pinned to the same SHA as in the other workflows, and both checkouts set `persist-credentials: false`. |
| 2 | The probe does what the notes say | confirmed | It runs `--version`, takes a free port, uses an empty `RONNE_DATA_DIR` and `--no-open`, and waits for 503 `setup_required` naming `rmk-server setup`. It runs `setup --yes` with `file:<data>/ronne.db`, checks `.env`/`ronne.db`/`storage`, expects 200 with no restart and a 201 token starting `rmk_`, then checks the port is free. On Windows it uses `shell` and `taskkill /T /F`. |
| 3 | Built, packed and installed here, the probe passes on this Mac | confirmed | `pnpm build && pnpm build:server`, then pack → 8.5 MB, then `npm install -g --prefix …`. The probe printed six ✓ lines (Node 24.0.0, darwin arm64) and exited 0 in 2.1 s. |
| 4 | The probe passes in Docker on Node 22 and Node 24 (amd64 if time allows) | confirmed | `node:22-bookworm-slim` (22.23.3, arm64), `node:24-bookworm-slim` (24.21.0, arm64) and emulated `linux/amd64` Node 24.21.0 (x64): six ✓ lines each, exit 0. |
| 5 | A broken package makes the probe fail | confirmed | A stand-in that prints a version and exits → "✗ no answer … within 90 seconds", exit 1 after 91 s. A missing command → ENOENT, exit 1 after 1 s. (After this report, the probe fails at once on an early exit: 1.7 s.) |
| 6 | The Done-when (the matrix passing on GitHub) hasn't happened, the notes say so, and Windows hasn't been run | confirmed | The workflow is new and untracked; `gh run list --workflow server-package.yml` → not found on the default branch. The notes say it's still open, and the task is unticked. |

**Not checked here:**
- Never run, only read: Windows (the `.cmd` shim, `taskkill /T`, `file:C:/…`).
- Seen only on GitHub's side: the hosted runners, artefacts between jobs, the sparse checkout, and the docs-only skip.
- Not covered: macOS x64, and Node 22 on macOS.

**Differences from the notes:**
- The witness also ran the probe on Node 24 and on emulated amd64 in Docker. Now in the notes.
- The probe waited the full 90 s when the command exited early. Fixed: it now fails at once.

**Overall:** not met yet. Every local check passes, but the *Done when* (the matrix passing on GitHub) waits for a pull request, and Windows has never been run, so task 4 stays unticked.

## Task 5 — Documentation and decisions

Witnessed: 2026-10-04 (23:47 EDT on 2026-10-03), by a fresh agent. Machine: macOS arm64, Node v24.0.0. The docs were checked against the code (`packages/server/src/cli.ts`, `paths.ts`, `run.ts`, `package.json`), not only the spec.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The README has a "With Node.js, no clone" section before "From source", and its facts match the code | partly (fixed, see claim 7) | The section sits before *From source*. Each fact matches the code: `npx`, the global install with `rmk-server`, the commands, `127.0.0.1:7650`, `--host`/`HOST`, `--port`/`PORT`, the busy port (`run.ts` never picks another), the data folders including `XDG_DATA_HOME`, upgrading (migrations on start) and the native-module note. Not the moving-from-a-clone line (claim 7). |
| 2 | In-app Documentation `install.node` states the same facts, the section title is "With Node.js", and the test asserts the new text | confirmed | `content.tsx` has `npx` first, the commands, network, data and upgrading, then the clone for developers. `topics.ts` → `{ id: "node", title: "With Node.js" }`. `docs.test.tsx` asserts `npx @ronneai/marketplace`, `rmk-server setup`, the macOS folder and `--host 0.0.0.0`. |
| 3 | MVP §5 names `npx @ronneai/marketplace`; §15's Packages row names the binaries and the server package | confirmed | §5: `npx @ronneai/marketplace`, with `pnpm dlx … init` removed. §15: binaries `rmk`, `rmk-mcp`, `rmk-server`, and the server package with better-sqlite3 and argon2 as its only dependencies (as in its `package.json`). |
| 4 | The runbook's Node section mentions `XDG_DATA_HOME` and the 127.0.0.1 / `--host` default, consistent with the code | confirmed | It matches `paths.ts` and `cli.ts`. |
| 5 | The setup's Public address helper reflects the port | confirmed (landed in task 2, f693696) | `fields.tsx` "…or ${page.localUrl …} on this machine"; `page.tsx` `localUrl: defaultPublicUrl()`; `runtime.ts` derives it from `PORT`; `setup.test.tsx` asserts "or http://localhost:7650 on this machine". |
| 6 | Done-when: the docs, setup and help tests pass, and `pnpm lint` passes | confirmed | 31 tests passed; `pnpm lint` exit 0. |
| 7 | No statement in the changed docs is untrue of the code | **not met, then fixed and re-checked: confirmed** | **First pass:** "Moving from a clone: set `RONNE_DATA_DIR` to its `apps/web/data`" was untrue. A clone's settings are `apps/web/.env`, and its `DATABASE_URL=file:./data/ronne.db` is relative, so `rmk-server` started in setup mode. The spec's edge case said the same. **Re-check after the fix (the same agent):** it made a fake clone with relative paths and a set-up SQLite database, then followed the new README steps literally: copy `.env` and `data/`, then make `DATABASE_URL` and `STORAGE_PATH` absolute. `rmk-server --port 7660` with that `RONNE_DATA_DIR` → "The database is up to date", `/api/health` **200**, and the clone's root at `/api/v1/auth/token` → **201** (a wrong password 401). Control with the old wording → **503**. The changed runbook lines ("Node.js 22.12", the browser on the first start) match `engines`, `MIN_NODE` and `run.ts`. |

**Not checked here:** `pnpm test:e2e` (84 passed in the notes) wasn't re-run. Browser sign-in after the move wasn't checked; the token API was. The runbook's `rmk-server service install` lines are the draft for 083, not this feature.
**Differences from the notes:**
- The moving-from-a-clone instruction, fixed as above.
- The witness noted the moved `.env` keeps the clone's `PUBLIC_URL`. The README now says to update it.

**Overall:** met. Every claim holds after the fix, and the Done-when tests and lint pass.
